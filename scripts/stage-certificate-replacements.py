"""Prepare a reviewed local upload folder; never change cloud files."""
import hashlib
import json
import shutil
from collections import Counter
from pathlib import Path


def main():
    root = Path('backups/certificates').resolve()
    inventory = json.loads((root / 'inventory.json').read_text(encoding='utf-8'))
    report = json.loads((root / 'archive-report.json').read_text(encoding='utf-8'))
    identity = lambda row: (row['bucket_id'], row['object_path'])
    if len(report) != len(inventory) or {identity(x) for x in report} != {identity(x) for x in inventory}:
        raise ValueError('The full inventory has not been backed up')
    if any(row['status'] == 'error' for row in report):
        raise ValueError('Resolve all archive errors before preparing replacements')
    upload_root = root / 'ready-to-upload'
    replacements = []
    retained_bytes = 0
    for row in report:
        original = Path(row['original'])
        if hashlib.sha256(original.read_bytes()).hexdigest() != row['sha256']:
            raise ValueError('Original backup checksum mismatch')
        if row['status'] != 'compressed_copy' or row['compressed_bytes'] >= row['bytes']:
            retained_bytes += row['bytes']
            continue
        compressed = Path(row['compressed'])
        if hashlib.sha256(compressed.read_bytes()).hexdigest() != row['compressed_sha256']:
            raise ValueError('Compressed copy checksum mismatch')
        target = (upload_root / row['bucket_id'] / row['object_path']).resolve()
        if not target.is_relative_to(upload_root.resolve()):
            raise ValueError('Invalid object path in inventory')
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(compressed, target)
        replacements.append({
            'bucket_id': row['bucket_id'], 'object_path': row['object_path'],
            'original_bytes': row['bytes'], 'compressed_bytes': row['compressed_bytes'],
            'original_sha256': row['sha256'], 'compressed_sha256': row['compressed_sha256'],
            'original_backup': row['original'], 'upload_file': str(target),
        })
    summary = {
        'inventory_files': len(inventory), 'replacement_files': len(replacements),
        'statuses': dict(Counter(x['status'] for x in report)),
        'original_pdf_bytes': sum(x['bytes'] for x in report),
        'projected_pdf_bytes': retained_bytes + sum(x['compressed_bytes'] for x in replacements),
        'cloud_files_modified': 0,
    }
    (root / 'replacement-plan.json').write_text(json.dumps({'summary': summary, 'files': replacements}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
