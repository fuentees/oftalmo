import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BRASAO_SP_B64 } from "./brasaoBase64";

const ORIGEM = "Centro de Oftalmologia Sanitária – CVE";
const INSTITUICAO_LINHA1 = "SECRETARIA DE ESTADO DA SAÚDE";
const INSTITUICAO_LINHA2 = "COORDENADORIA DE CONTROLE DE DOENÇAS - CCD";
const INSTITUICAO_LINHA3 = "CENTRO DE VIGILÂNCIA EPIDEMIOLÓGICA";
const INSTITUICAO_LINHA4 = '"PROF. ALEXANDRE VRANJAC"';
const ENDERECO = "Av. Dr. Arnaldo, 351 – 6º andar – SP/SP – CEP: 01246-000";
const TELEFONE = "Fone: (11) 3066-8120 – Fax: 3066-8153";
const EMAIL = "E-mail: dvoftal@saude.sp.gov.br";
const TITULO = "RELAÇÃO DE REMESSA DE DOCUMENTOS DIVERSOS";

function parseDateBR(value) {
  if (!value) return "";
  try {
    const d = new Date(value + "T00:00:00");
    if (isNaN(d.getTime())) return String(value);
    return format(d, "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return String(value);
  }
}

export function generateRemessaPdf(remessa) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210;
  const ML = 15;
  const MR = 15;
  const CW = PW - ML - MR; // 180mm
  let y = 15;

  // ── CABEÇALHO ──────────────────────────────────────────────────────────────
  // Borda externa do cabeçalho
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.4);
  pdf.rect(ML, y, CW, 28);

  // Separador vertical logo | texto (logo ~30mm)
  const logoW = 28;
  pdf.line(ML + logoW, y, ML + logoW, y + 28);

  // Texto institucional (centralizado no espaço à direita do logo)
  const textX = ML + logoW + (CW - logoW) / 2;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(0, 0, 0);
  pdf.text(INSTITUICAO_LINHA1, textX, y + 5.5, { align: "center" });
  pdf.text(INSTITUICAO_LINHA2, textX, y + 9.5, { align: "center" });
  pdf.text(INSTITUICAO_LINHA3, textX, y + 13.5, { align: "center" });
  pdf.text(INSTITUICAO_LINHA4, textX, y + 17.5, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.text(ENDERECO, textX, y + 21, { align: "center" });
  pdf.text(TELEFONE, textX, y + 24.5, { align: "center" });
  pdf.text(EMAIL, textX, y + 27.5, { align: "center" });

  // Brasão do Estado de São Paulo
  pdf.addImage(BRASAO_SP_B64, "PNG", ML + 1, y + 1, logoW - 2, 26);

  y += 32;

  // ── TÍTULO ──────────────────────────────────────────────────────────────────
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(204, 0, 0); // vermelho
  pdf.text(TITULO, PW / 2, y + 6, { align: "center" });
  pdf.setTextColor(0, 0, 0);
  y += 14;

  // ── RELAÇÃO / DATA ──────────────────────────────────────────────────────────
  const halfW = CW / 2;
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.4);

  // Box RELAÇÃO
  pdf.rect(ML, y, halfW, 9);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  const relacaoLabel = remessa.numero
    ? `RELAÇÃO: Nº ${String(remessa.numero).padStart(2, "0")}/${remessa.ano}`
    : `RELAÇÃO: PRÉVIA – ${remessa.ano}`;
  pdf.text(relacaoLabel, ML + 3, y + 6);

  // Box DATA
  pdf.rect(ML + halfW, y, halfW, 9);
  const dateStr = parseDateBR(remessa.data);
  pdf.text(`DATA: ${dateStr}`, ML + halfW + 3, y + 6);

  y += 9;

  // ── DO ──────────────────────────────────────────────────────────────────────
  pdf.rect(ML, y, CW, 9);
  pdf.text("DO: ", ML + 3, y + 6);
  pdf.setFont("helvetica", "normal");
  pdf.text(ORIGEM, ML + 12, y + 6);
  y += 9;

  // ── PARA ────────────────────────────────────────────────────────────────────
  pdf.rect(ML, y, CW, 9);
  pdf.setFont("helvetica", "bold");
  pdf.text("PARA: ", ML + 3, y + 6);
  pdf.setFont("helvetica", "normal");
  const paraText = [remessa.para_destino, remessa.para_gve ? `GVE ${remessa.para_gve}` : ""]
    .filter(Boolean).join(" – ");
  pdf.text(paraText, ML + 16, y + 6);
  y += 12;

  // ── TABELA DE ITENS ──────────────────────────────────────────────────────────
  const items = Array.isArray(remessa.items) ? remessa.items : [];

  autoTable(pdf, {
    startY: y,
    margin: { left: ML, right: MR },
    tableWidth: CW,
    head: [["N.º de\nordem", "Interessado", "Assunto"]],
    body: items.length > 0
      ? items.map((item, idx) => [
          String(item.ordem ?? idx + 1),
          String(item.interessado || ""),
          String(item.assunto || ""),
        ])
      : [["", "", ""]],
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
      lineColor: [0, 0, 0],
      lineWidth: 0.4,
      textColor: [0, 0, 0],
      valign: "top",
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center",
      lineWidth: 0.4,
    },
    columnStyles: {
      0: { cellWidth: 18, halign: "center" },
      1: { cellWidth: 38 },
      2: { cellWidth: CW - 18 - 38 },
    },
    // Garante altura mínima por linha para aulas longas
    rowPageBreak: "auto",
    didParseCell: (data) => {
      if (data.section === "body") {
        data.cell.styles.minCellHeight = 16;
      }
    },
  });

  y = pdf.lastAutoTable.finalY + 4;

  // ── RODAPÉ: responsável + recebimento ───────────────────────────────────────
  const footH = 22;
  pdf.setLineWidth(0.4);
  pdf.rect(ML, y, CW / 2, footH);
  pdf.rect(ML + CW / 2, y, CW / 2, footH);

  // Lado esquerdo: responsável
  if (remessa.responsavel) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text(remessa.responsavel, ML + 3, y + 6);
    if (remessa.responsavel_cargo) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      const cargoLines = pdf.splitTextToSize(remessa.responsavel_cargo, CW / 2 - 6);
      pdf.text(cargoLines, ML + 3, y + 11);
    }
  }

  // Lado direito: recebimento
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("RECEBIDO EM: ____/____/____", ML + CW / 2 + 4, y + 6);

  // Linha de assinatura
  pdf.setLineWidth(0.3);
  const sigY = y + footH - 4;
  pdf.line(ML + CW / 2 + 10, sigY, ML + CW - 5, sigY);

  // ── NÚMERO DA PÁGINA ────────────────────────────────────────────────────────
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(120);
  pdf.text(
    remessa.numero
      ? `Remessa Nº ${String(remessa.numero).padStart(2, "0")}/${remessa.ano}`
      : `Prévia – ${remessa.ano}`,
    PW / 2,
    293,
    { align: "center" }
  );

  return pdf;
}

export function downloadRemessaPdf(remessa) {
  const pdf = generateRemessaPdf(remessa);
  const fileName = `remessa_${String(remessa.numero).padStart(2, "0")}_${remessa.ano}.pdf`;
  pdf.save(fileName);
}

export function previewRemessaPdf(remessa) {
  const pdf = generateRemessaPdf(remessa);
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
