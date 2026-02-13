import jsPDF from "jspdf";
import { format } from "date-fns";
import { loadCertificateTemplate } from "@/lib/certificateTemplate";
import { parseDateSafe, formatDateSafe } from "@/lib/date";

const getTrainingDates = (training) => {
  const rawDates = [];
  if (Array.isArray(training?.dates)) {
    training.dates.forEach((entry) => {
      if (!entry) return;
      if (entry instanceof Date || typeof entry === "string" || typeof entry === "number") {
        rawDates.push(entry);
        return;
      }
      if (entry.date) rawDates.push(entry.date);
      if (entry.start_date) rawDates.push(entry.start_date);
    });
  }
  if (rawDates.length === 0) {
    if (training?.start_date) rawDates.push(training.start_date);
    if (training?.date) rawDates.push(training.date);
  }
  const parsedDates = rawDates
    .map((value) => {
      const parsed = parseDateSafe(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    })
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
  const formatted = parsedDates.map((value) => format(value, "dd/MM/yyyy"));
  return formatted.filter((value, index) => formatted.indexOf(value) === index);
};

const buildTrainingPeriod = (dates) => {
  if (!Array.isArray(dates) || dates.length === 0) return "";
  if (dates.length === 1) return dates[0];
  return `de ${dates[0]} a ${dates[dates.length - 1]}`;
};

const buildTrainingDays = (dates) => {
  if (!Array.isArray(dates) || dates.length === 0) return "";
  return dates.join(", ");
};

const interpolateText = (text, data) =>
  text.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    data[key] !== undefined && data[key] !== null ? String(data[key]) : ""
  );

const parseFormattedText = (value) => {
  const tokens = [];
  let bold = false;
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    tokens.push({ type: "text", text: buffer, bold });
    buffer = "";
  };
  for (let i = 0; i < String(value || "").length; i += 1) {
    const char = value[i];
    const next = value[i + 1];
    if (char === "*" && next === "*") {
      flush();
      bold = !bold;
      i += 1;
      continue;
    }
    if (char === "\n") {
      flush();
      tokens.push({ type: "newline" });
      continue;
    }
    buffer += char;
  }
  flush();
  return tokens;
};

const buildLines = (tokens, maxWidth, measureWord, baseSpaceWidth, firstLineIndent = 0) => {
  const lines = [];
  let current = [];
  let lineWidth = 0;
  let pendingSpace = false;
  let lineIndex = 0;
  const getMaxWidth = () =>
    maxWidth - (lineIndex === 0 ? firstLineIndent : 0);

  const pushLine = () => {
    if (current.length > 0) {
      lines.push(current);
    }
    current = [];
    lineWidth = 0;
    pendingSpace = false;
    lineIndex = lines.length;
  };

  tokens.forEach((token) => {
    if (token.type === "newline") {
      pushLine();
      return;
    }
    const parts = String(token.text || "").split(/(\s+)/);
    parts.forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) {
        pendingSpace = true;
        return;
      }
      const wordWidth = measureWord(part, token.bold);
      const spaceWidth = pendingSpace && current.length > 0 ? baseSpaceWidth : 0;
      if (current.length > 0 && lineWidth + spaceWidth + wordWidth > getMaxWidth()) {
        pushLine();
      }
      if (pendingSpace && current.length > 0) {
        lineWidth += baseSpaceWidth;
      }
      current.push({ text: part, bold: token.bold });
      lineWidth += wordWidth;
      pendingSpace = false;
    });
  });
  if (current.length > 0) lines.push(current);
  return lines;
};

const drawFormattedText = (
  pdf,
  text,
  x,
  y,
  maxWidth,
  lineHeight,
  options
) => {
  if (!text) return;
  const {
    fontFamily,
    fontSize,
    justify = true,
    maxWordSpacing = 3,
    indent = 0,
  } = options || {};
  pdf.setFontSize(fontSize);
  pdf.setFont(fontFamily, "normal");
  const baseSpaceWidth = pdf.getTextWidth(" ");
  const maxSpaceWidth = baseSpaceWidth * maxWordSpacing;
  const tokens = parseFormattedText(text);
  const measureWord = (word, isBold) => {
    pdf.setFont(fontFamily, isBold ? "bold" : "normal");
    return pdf.getTextWidth(word);
  };
  const lines = buildLines(tokens, maxWidth, measureWord, baseSpaceWidth, indent);
  lines.forEach((words, index) => {
    if (words.length === 0) return;
    const isLast = index === lines.length - 1;
    const wordWidths = words.map((word) => measureWord(word.text, word.bold));
    const wordsWidth = wordWidths.reduce((sum, width) => sum + width, 0);
    const gaps = words.length - 1;
    let spaceWidth = baseSpaceWidth;
    const availableWidth = maxWidth - (index === 0 ? indent : 0);
    if (justify && !isLast && gaps > 0) {
      const proposed = (availableWidth - wordsWidth) / gaps;
      if (Number.isFinite(proposed) && proposed >= baseSpaceWidth && proposed <= maxSpaceWidth) {
        spaceWidth = proposed;
      }
    }
    let cursorX = x + (index === 0 ? indent : 0);
    words.forEach((word, idx) => {
      pdf.setFont(fontFamily, word.bold ? "bold" : "normal");
      pdf.text(word.text, cursorX, y + index * lineHeight);
      cursorX += wordWidths[idx] + (idx < gaps ? spaceWidth : 0);
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
  const template = templateOverride || loadCertificateTemplate();
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
  const trainingDates = getTrainingDates(training);
  const trainingPeriod = buildTrainingPeriod(trainingDates);
  const trainingDays = buildTrainingDays(trainingDates);
  const participantDate = trainingDates[0] || formatDateSafe(training?.dates?.[0]?.date);

  const textData = {
    nome: participant.professional_name || "",
    rg: participant.professional_rg ? `RG ${participant.professional_rg}` : "",
    treinamento: training.title || "",
    carga_horaria: training.duration_hours || "",
    data: participantDate || formatDateSafe(new Date()),
    entidade: template.entityName || "",
    coordenador: training.coordinator || "",
    instrutor: training.instructor || "",
    funcao: "participante",
    tipo_certificado: "participante",
    aula: "",
    periodo_treinamento: trainingPeriod,
    dias_treinamento: trainingDays,
  };

  // Title
  pdf.setFontSize(sizes.title);
  pdf.setFont(fontFamily, "bold");
  const titleText = interpolateText(template.title || "CERTIFICADO", textData);
  pdf.text(titleText, titlePosition.x, titlePosition.y, {
    align: "center",
  });

  const bodyText = interpolateText(template.body || "", textData).trim();
  const bodyWidth = bodyPosition.width || pageWidth - 40;
  const bodyLeft = Number.isFinite(bodyPosition.x)
    ? bodyPosition.x - bodyWidth / 2
    : 20;
  const textOptions = template.textOptions || {};
  const justifyBody = textOptions.bodyJustify !== false;
  const lineHeightFactor = Number(textOptions.bodyLineHeight) || 1.2;
  const maxWordSpacing = Number(textOptions.bodyMaxWordSpacing) || 3;
  const bodyIndent = Number(textOptions.bodyIndent) || 0;
  const lineHeight = pdf.getTextDimensions("Mg").h * lineHeightFactor;
  pdf.setFontSize(sizes.body);
  pdf.setFont(fontFamily, "normal");
  drawFormattedText(pdf, bodyText, bodyLeft, bodyPosition.y, bodyWidth, lineHeight, {
    fontFamily,
    fontSize: sizes.body,
    justify: justifyBody,
    maxWordSpacing,
    indent: bodyIndent,
  });

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
  const template = templateOverride || loadCertificateTemplate();
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
  const trainingDates = getTrainingDates(training);
  const trainingPeriod = buildTrainingPeriod(trainingDates);
  const trainingDays = buildTrainingDays(trainingDates);

  const textData = {
    nome: monitor.name || "",
    rg: monitor.rg ? `RG ${monitor.rg}` : "",
    treinamento: training.title || "",
    carga_horaria: training.duration_hours || "",
    data: trainingDates[0] || formatDateSafe(training.dates?.[0]?.date) || formatDateSafe(new Date()),
    entidade: template.entityName || "",
    coordenador: training.coordinator || "",
    instrutor: training.instructor || "",
    funcao: "monitor",
    tipo_certificado: "monitor",
    aula: monitor.lecture || "",
    periodo_treinamento: trainingPeriod,
    dias_treinamento: trainingDays,
  };

  // Title
  pdf.setFontSize(sizes.title);
  pdf.setFont(fontFamily, "bold");
  const titleText = interpolateText(template.title || "CERTIFICADO", textData);
  pdf.text(titleText, titlePosition.x, titlePosition.y, {
    align: "center",
  });

  const bodyText = interpolateText(template.body || "", textData).trim();
  const bodyWidth = bodyPosition.width || pageWidth - 40;
  const bodyLeft = Number.isFinite(bodyPosition.x)
    ? bodyPosition.x - bodyWidth / 2
    : 20;
  const textOptions = template.textOptions || {};
  const justifyBody = textOptions.bodyJustify !== false;
  const lineHeightFactor = Number(textOptions.bodyLineHeight) || 1.2;
  const maxWordSpacing = Number(textOptions.bodyMaxWordSpacing) || 3;
  const bodyIndent = Number(textOptions.bodyIndent) || 0;
  const lineHeight = pdf.getTextDimensions("Mg").h * lineHeightFactor;
  pdf.setFontSize(sizes.body);
  pdf.setFont(fontFamily, "normal");
  drawFormattedText(pdf, bodyText, bodyLeft, bodyPosition.y, bodyWidth, lineHeight, {
    fontFamily,
    fontSize: sizes.body,
    justify: justifyBody,
    maxWordSpacing,
    indent: bodyIndent,
  });

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

export const generateSpeakerCertificate = (speaker, training, templateOverride) => {
  const template = templateOverride || loadCertificateTemplate();
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
  const trainingDates = getTrainingDates(training);
  const trainingPeriod = buildTrainingPeriod(trainingDates);
  const trainingDays = buildTrainingDays(trainingDates);

  const textData = {
    nome: speaker.name || "",
    rg: speaker.rg ? `RG ${speaker.rg}` : "",
    treinamento: training.title || "",
    carga_horaria: training.duration_hours || "",
    data: trainingDates[0] || formatDateSafe(training.dates?.[0]?.date) || formatDateSafe(new Date()),
    entidade: template.entityName || "",
    coordenador: training.coordinator || "",
    instrutor: training.instructor || "",
    funcao: "palestrante",
    tipo_certificado: "palestrante",
    aula: speaker.lecture || "",
    periodo_treinamento: trainingPeriod,
    dias_treinamento: trainingDays,
  };

  // Title
  pdf.setFontSize(sizes.title);
  pdf.setFont(fontFamily, "bold");
  const titleText = interpolateText(template.title || "CERTIFICADO", textData);
  pdf.text(titleText, titlePosition.x, titlePosition.y, {
    align: "center",
  });

  const bodyText = interpolateText(template.body || "", textData).trim();
  const bodyWidth = bodyPosition.width || pageWidth - 40;
  const bodyLeft = Number.isFinite(bodyPosition.x)
    ? bodyPosition.x - bodyWidth / 2
    : 20;
  const textOptions = template.textOptions || {};
  const justifyBody = textOptions.bodyJustify !== false;
  const lineHeightFactor = Number(textOptions.bodyLineHeight) || 1.2;
  const maxWordSpacing = Number(textOptions.bodyMaxWordSpacing) || 3;
  const bodyIndent = Number(textOptions.bodyIndent) || 0;
  const lineHeight = pdf.getTextDimensions("Mg").h * lineHeightFactor;
  pdf.setFontSize(sizes.body);
  pdf.setFont(fontFamily, "normal");
  drawFormattedText(pdf, bodyText, bodyLeft, bodyPosition.y, bodyWidth, lineHeight, {
    fontFamily,
    fontSize: sizes.body,
    justify: justifyBody,
    maxWordSpacing,
    indent: bodyIndent,
  });

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