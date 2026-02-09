import jsPDF from "jspdf";
import { format } from "date-fns";
import { loadCertificateTemplate } from "@/lib/certificateTemplate";

const formatDateSafe = (value, pattern = "dd/MM/yyyy") => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, pattern);
};

const interpolateText = (text, data) =>
  text.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    data[key] !== undefined && data[key] !== null ? String(data[key]) : ""
  );

const getImageFormat = (dataUrl) => {
  if (!dataUrl) return null;
  if (dataUrl.includes("image/png")) return "PNG";
  if (dataUrl.includes("image/jpeg") || dataUrl.includes("image/jpg")) {
    return "JPEG";
  }
  return "PNG";
};

const getLogoPosition = (template, key, pageWidth, pageHeight) => {
  const defaults = {
    primary: { x: 20, y: 18, w: 30, h: 30 },
    secondary: { x: pageWidth - 50, y: 18, w: 30, h: 30 },
    tertiary: { x: 20, y: pageHeight - 50, w: 30, h: 30 },
    quaternary: { x: pageWidth - 50, y: pageHeight - 50, w: 30, h: 30 },
  };
  const stored = template.logoPositions?.[key] || {};
  const base = defaults[key] || { x: 20, y: 18, w: 30, h: 30 };
  return {
    x: Number.isFinite(Number(stored.x)) ? Number(stored.x) : base.x,
    y: Number.isFinite(Number(stored.y)) ? Number(stored.y) : base.y,
    w: Number.isFinite(Number(stored.w)) ? Number(stored.w) : base.w,
    h: Number.isFinite(Number(stored.h)) ? Number(stored.h) : base.h,
  };
};

const resolveSignature = (signature, training) => {
  if (!signature || signature.source === "none") return null;
  if (signature.source === "coordinator") {
    return {
      name: training.coordinator || "",
      role: signature.role || "Coordenador",
    };
  }
  if (signature.source === "instructor") {
    return {
      name: training.instructor || "",
      role: signature.role || "Instrutor",
    };
  }
  if (signature.source === "custom") {
    return {
      name: signature.name || "",
      role: signature.role || "",
    };
  }
  return null;
};

export const generateParticipantCertificate = (participant, training) => {
  const template = loadCertificateTemplate();
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Background/Border
  pdf.setDrawColor(0, 82, 204);
  pdf.setLineWidth(2);
  pdf.rect(10, 10, pageWidth - 20, pageHeight - 20);
  
  pdf.setLineWidth(0.5);
  pdf.rect(15, 15, pageWidth - 30, pageHeight - 30);

  // Logos
  const logoKeys = ["primary", "secondary", "tertiary", "quaternary"];
  logoKeys.forEach((key) => {
    const dataUrl = template.logos?.[key];
    if (!dataUrl) return;
    const format = getImageFormat(dataUrl);
    if (!format) return;
    const pos = getLogoPosition(template, key, pageWidth, pageHeight);
    pdf.addImage(dataUrl, format, pos.x, pos.y, pos.w, pos.h);
  });

  // Header lines
  if (Array.isArray(template.headerLines) && template.headerLines.length > 0) {
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    template.headerLines.forEach((line, index) => {
      pdf.text(line, pageWidth / 2, 24 + index * 5, { align: "center" });
    });
  }

  const titleY = 40 + (template.headerLines?.length || 0) * 3;

  // Title
  pdf.setFontSize(28);
  pdf.setFont("helvetica", "bold");
  pdf.text(template.title || "CERTIFICADO", pageWidth / 2, titleY, {
    align: "center",
  });

  // Body
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "normal");
  pdf.text("Certificamos que", pageWidth / 2, titleY + 16, { align: "center" });

  pdf.setFontSize(24);
  pdf.setFont("helvetica", "bold");
  pdf.text(participant.professional_name, pageWidth / 2, titleY + 31, {
    align: "center",
  });

  pdf.setFontSize(14);
  pdf.setFont("helvetica", "normal");

  const participantDate = Array.isArray(training.dates)
    ? formatDateSafe(training.dates[0]?.date)
    : null;

  const textData = {
    nome: participant.professional_name || "",
    rg: participant.professional_rg ? `RG ${participant.professional_rg}` : "",
    treinamento: training.title || "",
    carga_horaria: training.duration_hours || "",
    data: participantDate || formatDateSafe(new Date()),
    entidade: template.entityName || "",
    coordenador: training.coordinator || "",
    instrutor: training.instructor || "",
  };

  const bodyText = interpolateText(template.body || "", textData).trim();
  const bodyLines = pdf.splitTextToSize(bodyText, pageWidth - 40);
  pdf.text(bodyLines, pageWidth / 2, titleY + 50, { align: "center" });

  if (template.footer) {
    pdf.setFontSize(12);
    const footerText = interpolateText(template.footer, textData);
    pdf.text(footerText, pageWidth / 2, pageHeight - 55, { align: "center" });
  }

  // Footer - Signatures
  pdf.setFontSize(11);
  const yPos = pageHeight - 40;

  const signatureItems = [
    resolveSignature(template.signature1, training),
    resolveSignature(template.signature2, training),
  ].filter((signature) => signature?.name);

  if (signatureItems.length === 1) {
    const signature = signatureItems[0];
    pdf.line(pageWidth / 2 - 30, yPos, pageWidth / 2 + 30, yPos);
    pdf.text(signature.name, pageWidth / 2, yPos + 5, { align: "center" });
    pdf.setFontSize(9);
    pdf.text(signature.role || "", pageWidth / 2, yPos + 10, {
      align: "center",
    });
  } else if (signatureItems.length >= 2) {
    const [left, right] = signatureItems;
    pdf.line(40, yPos, 100, yPos);
    pdf.text(left.name, 70, yPos + 5, { align: "center" });
    pdf.setFontSize(9);
    pdf.text(left.role || "", 70, yPos + 10, { align: "center" });

    pdf.setFontSize(11);
    pdf.line(pageWidth - 100, yPos, pageWidth - 40, yPos);
    pdf.text(right.name, pageWidth - 70, yPos + 5, { align: "center" });
    pdf.setFontSize(9);
    pdf.text(right.role || "", pageWidth - 70, yPos + 10, {
      align: "center",
    });
  }

  return pdf;
};

export const generateMonitorCertificate = (monitor, training) => {
  const template = loadCertificateTemplate();
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Background/Border
  pdf.setDrawColor(139, 92, 246);
  pdf.setLineWidth(2);
  pdf.rect(10, 10, pageWidth - 20, pageHeight - 20);
  
  pdf.setLineWidth(0.5);
  pdf.rect(15, 15, pageWidth - 30, pageHeight - 30);

  // Logos
  const logoKeys = ["primary", "secondary", "tertiary", "quaternary"];
  logoKeys.forEach((key) => {
    const dataUrl = template.logos?.[key];
    if (!dataUrl) return;
    const format = getImageFormat(dataUrl);
    if (!format) return;
    const pos = getLogoPosition(template, key, pageWidth, pageHeight);
    pdf.addImage(dataUrl, format, pos.x, pos.y, pos.w, pos.h);
  });

  // Header lines
  if (Array.isArray(template.headerLines) && template.headerLines.length > 0) {
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    template.headerLines.forEach((line, index) => {
      pdf.text(line, pageWidth / 2, 24 + index * 5, { align: "center" });
    });
  }

  const titleY = 40 + (template.headerLines?.length || 0) * 3;

  // Title
  pdf.setFontSize(28);
  pdf.setFont("helvetica", "bold");
  pdf.text("CERTIFICADO DE MONITORIA", pageWidth / 2, titleY, { align: "center" });

  // Body
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "normal");
  pdf.text("Certificamos que", pageWidth / 2, titleY + 16, { align: "center" });

  pdf.setFontSize(24);
  pdf.setFont("helvetica", "bold");
  pdf.text(monitor.name, pageWidth / 2, titleY + 31, { align: "center" });

  pdf.setFontSize(14);
  pdf.setFont("helvetica", "normal");
  
  pdf.text(`atuou como MONITOR no treinamento`, pageWidth / 2, titleY + 46, { align: "center" });
  
  pdf.setFontSize(18);
  pdf.setFont("helvetica", "bold");
  pdf.text(`"${training.title}"`, pageWidth / 2, titleY + 59, { align: "center" });

  pdf.setFontSize(14);
  pdf.setFont("helvetica", "normal");
  
  if (training.duration_hours) {
    pdf.text(`ministrando aulas com carga horária de ${training.duration_hours} horas,`, pageWidth / 2, titleY + 71, { align: "center" });
  }

  const monitorDate = Array.isArray(training.dates)
    ? formatDateSafe(training.dates[0]?.date)
    : null;
  if (monitorDate) {
    const dateText = `realizado em ${monitorDate}.`;
    pdf.text(dateText, pageWidth / 2, titleY + 81, { align: "center" });
  }

  // Footer - Signatures
  pdf.setFontSize(11);
  const yPos = pageHeight - 40;

  const signatureItems = [
    resolveSignature(template.signature1, training),
    resolveSignature(template.signature2, training),
  ].filter((signature) => signature?.name);

  if (signatureItems.length === 1) {
    const signature = signatureItems[0];
    pdf.line(pageWidth / 2 - 30, yPos, pageWidth / 2 + 30, yPos);
    pdf.text(signature.name, pageWidth / 2, yPos + 5, { align: "center" });
    pdf.setFontSize(9);
    pdf.text(signature.role || "", pageWidth / 2, yPos + 10, {
      align: "center",
    });
  } else if (signatureItems.length >= 2) {
    const [left, right] = signatureItems;
    pdf.line(40, yPos, 100, yPos);
    pdf.text(left.name, 70, yPos + 5, { align: "center" });
    pdf.setFontSize(9);
    pdf.text(left.role || "", 70, yPos + 10, { align: "center" });

    pdf.setFontSize(11);
    pdf.line(pageWidth - 100, yPos, pageWidth - 40, yPos);
    pdf.text(right.name, pageWidth - 70, yPos + 5, { align: "center" });
    pdf.setFontSize(9);
    pdf.text(right.role || "", pageWidth - 70, yPos + 10, {
      align: "center",
    });
  }

  return pdf;
};