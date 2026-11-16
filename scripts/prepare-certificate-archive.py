"""Back up public certificate PDFs and create losslessly compressed local copies.

No uploads, replacements, database updates or deletions are performed.
Use the inventory exported by supabase/inventory_certificate_files.sql.
Requires pypdf. Signed PDFs are backed up but never rewritten.
"""
import argparse
import hashlib
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote, urlsplit
from urllib.request import urlopen

from pypdf import PdfReader, PdfWriter
from pypdf.generic import StreamObject


def compress_copy(original, output):
    reader = PdfReader(original)
    if reader.is_encrypted:
        return {"status": "encrypted_preserved"}
    fields = reader.get_fields() or {}
    if any(str(field.get("/FT")) == "/Sig" for field in fields.values()) or \
            reader.trailer["/Root"].get("/Perms"):
        return {"status": "signed_preserved"}
    writer = PdfWriter(clone_from=reader)
    for page in writer.pages:
        page.compress_content_streams()
    # Older jsPDF PDFs contain unfiltered RGB image streams. Flate encoding is
    # lossless: preserve every pixel and transparency, without resampling/JPEG.
    for index, obj in enumerate(writer._objects):
        if isinstance(obj, StreamObject) and obj.get("/Subtype") == "/Image" and not obj.get("/Filter"):
            encoded = obj.flate_encode()
            encoded.pop("/DecodeParms", None)
            encoded.indirect_reference = obj.indirect_reference
            writer._objects[index] = encoded
    writer.compress_identical_objects(remove_duplicates=True, remove_unreferenced=True)
    temporary = output.with_suffix(".partial")
    with temporary.open("wb") as stream:
        writer.write(stream)
    reopened = PdfReader(temporary)
    if len(reopened.pages) != len(reader.pages):
        raise ValueError("Page count changed")
    for before, after in zip(reader.pages, reopened.pages):
        if before.extract_text() != after.extract_text():
            raise ValueError("Certificate text changed")
        if list(before.mediabox) != list(after.mediabox):
            raise ValueError("Page dimensions changed")
        if before.get_contents().get_data() != after.get_contents().get_data():
            raise ValueError("Page drawing commands changed")
        # Confirm lossless image encoding, including any transparency masks.
        def images(resources):
            result = {}
            def visit(objects, prefix=""):
                for name, ref in objects.items():
                    obj = ref.get_object()
                    if obj.get("/Subtype") == "/Image":
                        result[prefix + str(name)] = hashlib.sha256(obj.get_data()).hexdigest()
                        if obj.get("/SMask"):
                            result[prefix + str(name) + "/SMask"] = hashlib.sha256(obj["/SMask"].get_data()).hexdigest()
                    elif obj.get("/Subtype") == "/Form":
                        visit(obj.get("/Resources", {}).get("/XObject", {}), prefix + str(name))
            visit(resources.get("/XObject", {}))
            return result
        if images(before.get("/Resources", {})) != images(after.get("/Resources", {})):
            raise ValueError("Image pixels changed")
    os.replace(temporary, output)
    return {"status": "compressed_copy", "pages": len(reader.pages), "compressed_bytes": output.stat().st_size}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", default="backups/certificates/inventory.json")
    parser.add_argument("--supabase-url", help="Project URL, without keys or credentials")
    parser.add_argument("--output", default="backups/certificates")
    parser.add_argument("--limit", type=int, default=3, help="0 processes the entire inventory")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    # Read only the project URL; no service-role key or login token is needed.
    settings = {}
    for line in (Path(".env").read_text(encoding="utf-8-sig") if Path(".env").exists() else "").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            settings[key.strip()] = value.strip().strip("\"'")
    base = (args.supabase_url or settings.get("VITE_SUPABASE_URL", "")).rstrip("/")
    if urlsplit(base).scheme != "https" or not (urlsplit(base).hostname or "").endswith(".supabase.co"):
        raise ValueError("Expected the project's HTTPS Supabase URL")
    inventory = json.loads(Path(args.inventory).read_text(encoding="utf-8"))
    # Sample large, median and small certificates rather than only the largest.
    if args.limit == 3 and len(inventory) > 3:
        inventory = [inventory[0], inventory[len(inventory)//2], inventory[-1]]
    elif args.limit:
        inventory = inventory[:args.limit]
    root = Path(args.output).resolve()
    (root / "originals").mkdir(parents=True, exist_ok=True)
    (root / "compressed").mkdir(exist_ok=True)
    report = []
    report_path = root / ("sample-report.json" if args.limit else "archive-report.json")
    def process_entry(entry):
        # Names are represented in the report, never printed to a terminal.
        identity = f"{entry['bucket_id']}/{entry['object_path']}"
        local_name = hashlib.sha256(identity.encode()).hexdigest() + ".pdf"
        original = root / "originals" / local_name
        output = root / "compressed" / local_name
        result = {**entry, "original": str(original), "compressed": str(output)}
        try:
            if not original.exists():
                url = base + "/storage/v1/object/public/" + quote(identity, safe="/")
                with urlopen(url, timeout=120) as response:
                    data = response.read()
                if not data.startswith(b"%PDF-") or len(data) != entry["bytes"]:
                    raise ValueError("Original file does not match inventory")
                original.write_bytes(data)
            data = original.read_bytes()
            if len(data) != entry["bytes"] or not data.startswith(b"%PDF-"):
                raise ValueError("Local backup does not match inventory")
            result["sha256"] = hashlib.sha256(data).hexdigest()
            result.update(compress_copy(original, output))
            if result["status"] == "compressed_copy":
                result["compressed_sha256"] = hashlib.sha256(output.read_bytes()).hexdigest()
        except Exception as error:
            result["status"] = "error"
            result["error"] = type(error).__name__
        return result
    with ThreadPoolExecutor(max_workers=max(1, min(8, args.workers))) as pool:
        for future in as_completed([pool.submit(process_entry, entry) for entry in inventory]):
            result = future.result()
            report.append(result)
            if len(report) % 25 == 0 or len(report) == len(inventory) or result["status"] == "error":
                report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"Processed {len(report)}/{len(inventory)}", flush=True)
    errors = sum(item["status"] == "error" for item in report)
    print(json.dumps({"files": len(report), "errors": errors, "original_bytes": sum(x['bytes'] for x in report),
                      "compressed_bytes": sum(x.get('compressed_bytes', x['bytes']) for x in report)}))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
