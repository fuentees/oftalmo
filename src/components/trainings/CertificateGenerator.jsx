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

const drawJustifiedText = (pdf, text, x, y, maxWidth, lineHeight) => {
  if (!text) return;
  const lines = pdf.splitTextToSize(text, maxWidth);
  const spacingThreshold = maxWidth * 0.6;
  lines.forEach((line, index) => {
    const lineText = String(line || "").trim();
    const lineY = y + index * lineHeight;
    if (!lineText) return;
    const words = lineText.split(/\s+/);
    const isLast = index === lines.length - 1;
    if (isLast || words.length <= 1) {
      pdf.text(lineText, x, lineY);
      return;
    }
    const wordsWidth = words.reduce((sum, word) => sum + pdf.getTextWidth(word), 0);
    if (!Number.isFinite(wordsWidth) || wordsWidth <= 0) {
      pdf.text(lineText, x, lineY);
      return;
    }
    if (wordsWidth < spacingThreshold) {
      pdf.text(lineText, x, lineY);
      return;
    }
    const gaps = words.length - 1;
    const spaceWidth = (maxWidth - wordsWidth) / gaps;
    if (!Number.isFinite(spaceWidth) || spaceWidth < 0) {
      pdf.text(lineText, x, lineY);
      return;
    }
    let cursorX = x;
    words.forEach((word, idx) => {
      pdf.text(word, cursorX, lineY);
      cursorX += pdf.getTextWidth(word) + (idx < gaps ? spaceWidth : 0);
    });
  });
};

const getImageFormat = (dataUrl) => {
  if (!dataUrl) return null;
  if (dataUrl.includes("image/png")) return "PNG";
  if (dataUrl.includes("image/jpeg") || dataUrl.includes("image/jpg")) {
    return "JPEG";
  }
  return "PNG";
};

const getLogoPosition = (template, key, index, pageWidth, pageHeight, logoItem) => {
  const defaultsByKey = {
    primary: { x: 20, y: 18, w: 30, h: 30 },
    secondary: { x: pageWidth - 50, y: 18, w: 30, h: 30 },
    tertiary: { x: 20, y: pageHeight - 50, w: 30, h: 30 },
    quaternary: { x: pageWidth - 50, y: pageHeight - 50, w: 30, h: 30 },
  };
  const defaultsByIndex = [
    { x: 20, y: 18, w: 30, h: 30 },
    { x: pageWidth - 50, y: 18, w: 30, h: 30 },
    { x: 20, y: pageHeight - 50, w: 30, h: 30 },
    { x: pageWidth - 50, y: pageHeight - 50, w: 30, h: 30 },
  ];
  const base =
    defaultsByKey[key] ||
    defaultsByIndex[index] || { x: 20, y: 18, w: 30, h: 30 };
  const stored =
    logoItem?.position || template.logoPositions?.[key] || {};
  return {
    x: Number.isFinite(Number(stored.x)) ? Number(stored.x) : base.x,
    y: Number.isFinite(Number(stored.y)) ? Number(stored.y) : base.y,
    w: Number.isFinite(Number(stored.w)) ? Number(stored.w) : base.w,
    h: Number.isFinite(Number(stored.h)) ? Number(stored.h) : base.h,
  };
};

const getTextPosition = (template, key, defaults) => {
  const stored = template.textPositions?.[key] || {};
  return {
    x: Number.isFinite(Number(stored.x)) ? Number(stored.x) : defaults.x,
    y: Number.isFinite(Number(stored.y)) ? Number(stored.y) : defaults.y,
    width: Number.isFinite(Number(stored.width)) ? Number(stored.width) : defaults.width,
  };
};

const getSignaturePosition = (template, key, defaults) => {
  const stored = template.signaturePositions?.[key] || {};
  return {
    x: Number.isFinite(Number(stored.x)) ? Number(stored.x) : defaults.x,
    y: Number.isFinite(Number(stored.y)) ? Number(stored.y) : defaults.y,
    lineWidth: Number.isFinite(Number(stored.lineWidth))
      ? Number(stored.lineWidth)
      : defaults.lineWidth,
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

export const generateParticipantCertificate = (participant, training, templateOverride) => {
  const template = templateOverride || loadCertificateTemplate("participant");
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const fonts = template.fonts || {};
  const fontFamily = fonts.family || "helvetica";
  const sizes = {
    header: Number(fonts.headerSize) || 10,
    title: Number(fonts.titleSize) || 28,
    name: Number(fonts.nameSize) || 24,
    body: Number(fonts.bodySize) || 14,
    footer: Number(fonts.footerSize) || 12,
    signature: Number(fonts.signatureSize) || 11,
    signatureRole: Number(fonts.signatureRoleSize) || 9,
  };

  // Background/Border
  pdf.setDrawColor(0, 82, 204);
  pdf.setLineWidth(2);
  pdf.rect(10, 10, pageWidth - 20, pageHeight - 20);
  
  pdf.setLineWidth(0.5);
  pdf.rect(15, 15, pageWidth - 30, pageHeight - 30);

  // Logos
  const logoEntries = Array.isArray(template.logos)
    ? template.logos.map((logo, index) => [
        logo?.id || `logo_${index + 1}`,
        logo?.dataUrl || logo?.url || logo,
        logo,
      ])
    : Object.entries(template.logos || {}).map(([key, value]) => [
        key,
        value,
        null,
      ]);
  logoEntries.forEach(([key, dataUrl, logoItem], index) => {
    if (!dataUrl) return;
    const format = getImageFormat(dataUrl);
    if (!format) return;
    const pos = getLogoPosition(template, key, index, pageWidth, pageHeight, logoItem);
    pdf.addImage(dataUrl, format, pos.x, pos.y, pos.w, pos.h);
  });

  // Header lines
  if (Array.isArray(template.headerLines) && template.headerLines.length > 0) {
    pdf.setFontSize(sizes.header);
    pdf.setFont(fontFamily, "bold");
    template.headerLines.forEach((line, index) => {
      pdf.text(line, pageWidth / 2, 24 + index * 5, { align: "center" });
    });
  }

  const titleY = 40 + (template.headerLines?.length || 0) * 3;
  const titlePosition = getTextPosition(template, "title", {
    x: pageWidth / 2,
    y: titleY,
    width: pageWidth - 40,
  });
  const bodyPosition = getTextPosition(template, "body", {
    x: pageWidth / 2,
    y: titleY + 16,
    width: pageWidth - 40,
  });
  const footerPosition = getTextPosition(template, "footer", {
    x: pageWidth / 2,
    y: pageHeight - 55,
    width: pageWidth - 40,
  });
  const signatureDefaults = {
    signature1: { x: 70, y: pageHeight - 40, lineWidth: 60 },
    signature2: { x: pageWidth - 70, y: pageHeight - 40, lineWidth: 60 },
  };
  const titlePosition = getTextPosition(template, "title", {
    x: pageWidth / 2,
    y: titleY,
    width: pageWidth - 40,
  });
  const bodyPosition = getTextPosition(template, "body", {
    x: pageWidth / 2,
    y: titleY + 16,
    width: pageWidth - 40,
  });
  const footerPosition = getTextPosition(template, "footer", {
    x: pageWidth / 2,
    y: pageHeight - 55,
    width: pageWidth - 40,
  });
  const signatureDefaults = {
    signature1: { x: 70, y: pageHeight - 40, lineWidth: 60 },
    signature2: { x: pageWidth - 70, y: pageHeight - 40, lineWidth: 60 },
  };
  // Title
  pdf.setFontSize(sizes.title);
  pdf.setFont(fontFamily, "bold");
  pdf.text(template.title || "CERTIFICADO", titlePosition.x, titlePosition.y, {
    align: "center",
  });

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
  const bodyWidth = bodyPosition.width || pageWidth - 40;
  const bodyLeft = Number.isFinite(bodyPosition.x)
    ? bodyPosition.x - bodyWidth / 2
    : 20;
  const lineHeight = pdf.getTextDimensions("Mg").h * 1.2;
  pdf.setFontSize(sizes.body);
  pdf.setFont(fontFamily, "normal");
  drawJustifiedText(pdf, bodyText, bodyLeft, bodyPosition.y, bodyWidth, lineHeight);

  if (template.footer) {
    pdf.setFontSize(sizes.footer);
    const footerText = interpolateText(template.footer, textData);
    pdf.text(footerText, footerPosition.x, footerPosition.y, { align: "center" });
  }

  // Footer - Signatures
  pdf.setFontSize(sizes.signature);
  const signature1 = resolveSignature(template.signature1, training);
  const signature2 = resolveSignature(template.signature2, training);

  if (signature1?.name) {
    const pos = getSignaturePosition(
      template,
      "signature1",
      signatureDefaults.signature1
    );
    const half = (pos.lineWidth || 60) / 2;
    pdf.line(pos.x - half, pos.y, pos.x + half, pos.y);
    pdf.text(signature1.name, pos.x, pos.y + 5, { align: "center" });
    pdf.setFontSize(sizes.signatureRole);
    pdf.text(signature1.role || "", pos.x, pos.y + 10, { align: "center" });
    pdf.setFontSize(sizes.signature);
  }

  if (signature2?.name) {
    const pos = getSignaturePosition(
      template,
      "signature2",
      signatureDefaults.signature2
    );
    const half = (pos.lineWidth || 60) / 2;
    pdf.line(pos.x - half, pos.y, pos.x + half, pos.y);
    pdf.text(signature2.name, pos.x, pos.y + 5, { align: "center" });
    pdf.setFontSize(sizes.signatureRole);
    pdf.text(signature2.role || "", pos.x, pos.y + 10, { align: "center" });
    pdf.setFontSize(sizes.signature);
  }

  return pdf;
};

export const generateMonitorCertificate = (monitor, training, templateOverride) => {
  const template = templateOverride || loadCertificateTemplate("monitor");
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const fonts = template.fonts || {};
  const fontFamily = fonts.family || "helvetica";
  const sizes = {
    header: Number(fonts.headerSize) || 10,
    title: Number(fonts.titleSize) || 28,
    name: Number(fonts.nameSize) || 24,
    body: Number(fonts.bodySize) || 14,
    footer: Number(fonts.footerSize) || 12,
    signature: Number(fonts.signatureSize) || 11,
    signatureRole: Number(fonts.signatureRoleSize) || 9,
  };

  // Background/Border
  pdf.setDrawColor(139, 92, 246);
  pdf.setLineWidth(2);
  pdf.rect(10, 10, pageWidth - 20, pageHeight - 20);
  
  pdf.setLineWidth(0.5);
  pdf.rect(15, 15, pageWidth - 30, pageHeight - 30);

  // Logos
  const logoEntries = Array.isArray(template.logos)
    ? template.logos.map((logo, index) => [
        logo?.id || `logo_${index + 1}`,
        logo?.dataUrl || logo?.url || logo,
        logo,
      ])
    : Object.entries(template.logos || {}).map(([key, value]) => [
        key,
        value,
        null,
      ]);
  logoEntries.forEach(([key, dataUrl, logoItem], index) => {
    if (!dataUrl) return;
    const format = getImageFormat(dataUrl);
    if (!format) return;
    const pos = getLogoPosition(template, key, index, pageWidth, pageHeight, logoItem);
    pdf.addImage(dataUrl, format, pos.x, pos.y, pos.w, pos.h);
  });

  // Header lines
  if (Array.isArray(template.headerLines) && template.headerLines.length > 0) {
    pdf.setFontSize(sizes.header);
    pdf.setFont(fontFamily, "bold");
    template.headerLines.forEach((line, index) => {
      pdf.text(line, pageWidth / 2, 24 + index * 5, { align: "center" });
    });
  }

  const titleY = 40 + (template.headerLines?.length || 0) * 3;

  // Title
  pdf.setFontSize(sizes.title);
  pdf.setFont(fontFamily, "bold");
  pdf.text(template.title || "CERTIFICADO DE MONITORIA", titlePosition.x, titlePosition.y, {
    align: "center",
  });

  const monitorDate = Array.isArray(training.dates)
    ? formatDateSafe(training.dates[0]?.date)
    : null;

  const textData = {
    nome: monitor.name || "",
    rg: monitor.rg ? `RG ${monitor.rg}` : "",
    treinamento: training.title || "",
    carga_horaria: training.duration_hours || "",
    data: monitorDate || formatDateSafe(new Date()),
    entidade: template.entityName || "",
    coordenador: training.coordinator || "",
    instrutor: training.instructor || "",
  };

  const bodyText = interpolateText(template.body || "", textData).trim();
  const bodyWidth = bodyPosition.width || pageWidth - 40;
  const bodyLeft = Number.isFinite(bodyPosition.x)
    ? bodyPosition.x - bodyWidth / 2
    : 20;
  const lineHeight = pdf.getTextDimensions("Mg").h * 1.2;
  pdf.setFontSize(sizes.body);
  pdf.setFont(fontFamily, "normal");
  drawJustifiedText(pdf, bodyText, bodyLeft, bodyPosition.y, bodyWidth, lineHeight);

  if (template.footer) {
    pdf.setFontSize(sizes.footer);
    const footerText = interpolateText(template.footer, textData);
    pdf.text(footerText, footerPosition.x, footerPosition.y, { align: "center" });
  }

  // Footer - Signatures
  pdf.setFontSize(sizes.signature);
  const signature1 = resolveSignature(template.signature1, training);
  const signature2 = resolveSignature(template.signature2, training);

  if (signature1?.name) {
    const pos = getSignaturePosition(
      template,
      "signature1",
      signatureDefaults.signature1
    );
    const half = (pos.lineWidth || 60) / 2;
    pdf.line(pos.x - half, pos.y, pos.x + half, pos.y);
    pdf.text(signature1.name, pos.x, pos.y + 5, { align: "center" });
    pdf.setFontSize(sizes.signatureRole);
    pdf.text(signature1.role || "", pos.x, pos.y + 10, { align: "center" });
    pdf.setFontSize(sizes.signature);
  }

  if (signature2?.name) {
    const pos = getSignaturePosition(
      template,
      "signature2",
      signatureDefaults.signature2
    );
    const half = (pos.lineWidth || 60) / 2;
    pdf.line(pos.x - half, pos.y, pos.x + half, pos.y);
    pdf.text(signature2.name, pos.x, pos.y + 5, { align: "center" });
    pdf.setFontSize(sizes.signatureRole);
    pdf.text(signature2.role || "", pos.x, pos.y + 10, { align: "center" });
    pdf.setFontSize(sizes.signature);
  }

  return pdf;
};