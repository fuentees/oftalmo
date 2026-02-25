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

const toNumeric = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value).replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const formatDecimal = (value, digits) => {
  if (!Number.isFinite(value)) return "";
  return Number(value).toFixed(digits).replace(".", ",");
};

const resolveParticipantScore = (participant) => {
  const rawKappa = toNumeric(
    participant?.certificate_kappa ?? participant?.kappa ?? null
  );
  const rawScore = toNumeric(
    participant?.certificate_score ??
      participant?.grade ??
      participant?.nota ??
      participant?.score ??
      null
  );

  let kappa = Number.isFinite(rawKappa) ? rawKappa : null;
  let score = Number.isFinite(rawScore) ? rawScore : null;

  if (kappa !== null && kappa >= 0 && kappa <= 100 && score === null && kappa > 1) {
    score = kappa;
    kappa = null;
  }

  if (kappa === null && score !== null && score >= 0 && score <= 1) {
    kappa = score;
    score = null;
  }

  if (kappa !== null) {
    kappa = clamp(kappa, 0, 1);
  }

  if (score !== null) {
    score = clamp(score, 0, 100);
  }

  if (score === null && kappa !== null) {
    score = kappa * 100;
  }

  if (kappa === null && score !== null) {
    kappa = score / 100;
  }

  const scoreLabel = score === null ? "" : formatDecimal(score, 1);
  const kappaLabel = kappa === null ? "" : formatDecimal(kappa, 3);
  const scoreText = scoreLabel
    ? `Nota final (Kappa x100): ${scoreLabel}%`
    : "";

  return {
    kappa,
    score,
    kappaLabel,
    scoreLabel,
    scoreText,
  };
};

const interpolateText = (text, data) =>
  text.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    data[key] !== undefined && data[key] !== null ? String(data[key]) : ""
  );

const BODY_HTML_TAG_REGEX = /<\/?[a-z][\s\S]*>/i;

const toFontStyle = (token) => {
  const isBold = Boolean(token?.bold);
  const isItalic = Boolean(token?.italic);
  if (isBold && isItalic) return "bolditalic";
  if (isBold) return "bold";
  if (isItalic) return "italic";
  return "normal";
};

const tokenizeLegacyFormattedText = (value) => {
  const tokens = [];
  let bold = false;
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    tokens.push({
      type: "text",
      text: buffer,
      bold,
      italic: false,
      underline: false,
    });
    buffer = "";
  };

  const content = String(value || "");
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];
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

const parseHtmlFormattedText = (value) => {
  if (typeof DOMParser === "undefined") return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(value || ""), "text/html");
  const tokens = [];

  const ensureTrailingNewline = () => {
    if (!tokens.length) return;
    if (tokens[tokens.length - 1].type !== "newline") {
      tokens.push({ type: "newline" });
    }
  };

  const pushTextToken = (text, style) => {
    const normalized = String(text || "").replace(/\u00a0/g, " ");
    if (!normalized) return;
    tokens.push({
      type: "text",
      text: normalized,
      bold: Boolean(style?.bold),
      italic: Boolean(style?.italic),
      underline: Boolean(style?.underline),
    });
  };

  const walkNode = (node, style = {}, listContext = null) => {
    if (!node) return;

    if (node.nodeType === 3) {
      pushTextToken(node.textContent, style);
      return;
    }

    if (node.nodeType !== 1) return;
    const tag = String(node.tagName || "").toLowerCase();
    if (!tag) return;

    if (tag === "br") {
      tokens.push({ type: "newline" });
      return;
    }

    const nextStyle = {
      ...style,
      bold: style.bold || tag === "strong" || tag === "b",
      italic: style.italic || tag === "em" || tag === "i",
      underline: style.underline || tag === "u",
    };

    if (tag === "ol" || tag === "ul") {
      const listItems = Array.from(node.children || []).filter(
        (child) => String(child?.tagName || "").toLowerCase() === "li"
      );
      if (!listItems.length) {
        Array.from(node.childNodes || []).forEach((child) =>
          walkNode(child, nextStyle, listContext)
        );
        return;
      }

      listItems.forEach((child, index) => {
        walkNode(child, nextStyle, {
          type: tag,
          index: index + 1,
        });
      });
      ensureTrailingNewline();
      return;
    }

    if (tag === "li") {
      const marker = listContext?.type === "ol" ? `${listContext.index}. ` : "• ";
      pushTextToken(marker, {});
      Array.from(node.childNodes || []).forEach((child) =>
        walkNode(child, nextStyle, null)
      );
      ensureTrailingNewline();
      return;
    }

    const isBlock = [
      "p",
      "div",
      "section",
      "article",
      "blockquote",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "pre",
    ].includes(tag);

    if (isBlock && tokens.length && tokens[tokens.length - 1].type !== "newline") {
      tokens.push({ type: "newline" });
    }

    Array.from(node.childNodes || []).forEach((child) =>
      walkNode(child, nextStyle, listContext)
    );

    if (isBlock) {
      ensureTrailingNewline();
    }
  };

  Array.from(doc.body?.childNodes || []).forEach((node) => walkNode(node, {}));

  while (tokens.length && tokens[tokens.length - 1].type === "newline") {
    tokens.pop();
  }

  return tokens;
};

const parseFormattedText = (value) => {
  const content = String(value || "");
  if (!content) return [];
  if (BODY_HTML_TAG_REGEX.test(content)) {
    const parsedHtmlTokens = parseHtmlFormattedText(content);
    if (parsedHtmlTokens.length > 0) return parsedHtmlTokens;
  }
  return tokenizeLegacyFormattedText(content);
};

const splitTokensByExplicitLines = (tokens) => {
  const lines = [[]];
  tokens.forEach((token) => {
    if (token.type === "newline") {
      lines.push([]);
      return;
    }
    lines[lines.length - 1].push(token);
  });
  return lines;
};

const buildLines = (tokens, maxWidth, measureWord, baseSpaceWidth, firstLineIndent = 0) => {
  const lines = [];
  const explicitLines = splitTokensByExplicitLines(tokens);
  let paragraphStartsNextLine = true;

  explicitLines.forEach((explicitLineTokens) => {
    if (!explicitLineTokens.length) {
      lines.push({ words: [], indent: 0 });
      paragraphStartsNextLine = true;
      return;
    }

    let currentWords = [];
    let lineWidth = 0;
    let pendingSpace = false;
    let currentIndent = paragraphStartsNextLine ? firstLineIndent : 0;
    let maxWidthForLine = maxWidth - currentIndent;

    const pushCurrentLine = () => {
      if (!currentWords.length) return;
      lines.push({
        words: currentWords,
        indent: currentIndent,
      });
      currentWords = [];
      lineWidth = 0;
      pendingSpace = false;
      currentIndent = 0;
      maxWidthForLine = maxWidth;
      paragraphStartsNextLine = false;
    };

    explicitLineTokens.forEach((token) => {
      const parts = String(token.text || "").split(/(\s+)/);
      parts.forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          pendingSpace = true;
          return;
        }
        const wordWidth = measureWord(part, token);
        const spaceWidth = pendingSpace && currentWords.length > 0 ? baseSpaceWidth : 0;
        if (
          currentWords.length > 0 &&
          lineWidth + spaceWidth + wordWidth > maxWidthForLine
        ) {
          pushCurrentLine();
        }
        if (pendingSpace && currentWords.length > 0) {
          lineWidth += baseSpaceWidth;
        }
        currentWords.push({
          text: part,
          bold: token.bold,
          italic: token.italic,
          underline: token.underline,
        });
        lineWidth += wordWidth;
        pendingSpace = false;
      });
    });

    if (currentWords.length > 0) {
      lines.push({
        words: currentWords,
        indent: currentIndent,
      });
      paragraphStartsNextLine = false;
    }
  });

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
  const measureWord = (word, tokenStyle) => {
    pdf.setFont(fontFamily, toFontStyle(tokenStyle));
    return pdf.getTextWidth(word);
  };
  const lines = buildLines(tokens, maxWidth, measureWord, baseSpaceWidth, indent);
  lines.forEach((line, index) => {
    const words = line.words;
    if (words.length === 0) return;
    const isLast = index === lines.length - 1;
    const wordWidths = words.map((word) => measureWord(word.text, word));
    const wordsWidth = wordWidths.reduce((sum, width) => sum + width, 0);
    const gaps = words.length - 1;
    let spaceWidth = baseSpaceWidth;
    const lineIndent = Number(line.indent) || 0;
    const availableWidth = maxWidth - lineIndent;
    if (justify && !isLast && gaps > 0) {
      const proposed = (availableWidth - wordsWidth) / gaps;
      if (Number.isFinite(proposed) && proposed >= baseSpaceWidth && proposed <= maxSpaceWidth) {
        spaceWidth = proposed;
      }
    }
    let cursorX = x + lineIndent;
    words.forEach((word, idx) => {
      pdf.setFont(fontFamily, toFontStyle(word));
      const lineY = y + index * lineHeight;
      pdf.text(word.text, cursorX, lineY);
      if (word.underline) {
        const underlineY = lineY + fontSize * 0.12;
        pdf.setLineWidth(0.25);
        pdf.line(cursorX, underlineY, cursorX + wordWidths[idx], underlineY);
      }
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
  const scoreInfo = resolveParticipantScore(participant);

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
    nota: scoreInfo.scoreLabel,
    nota_percentual: scoreInfo.scoreLabel ? `${scoreInfo.scoreLabel}%` : "",
    kappa: scoreInfo.kappaLabel,
    nota_texto: scoreInfo.scoreText,
  };

  // Title
  pdf.setFontSize(sizes.title);
  pdf.setFont(fontFamily, "bold");
  const titleText = interpolateText(template.title || "CERTIFICADO", textData);
  pdf.text(titleText, titlePosition.x, titlePosition.y, {
    align: "center",
  });

  const bodyText = interpolateText(template.body || "", textData).replace(
    /\r\n/g,
    "\n"
  );
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
    nota: "",
    nota_percentual: "",
    kappa: "",
    nota_texto: "",
  };

  // Title
  pdf.setFontSize(sizes.title);
  pdf.setFont(fontFamily, "bold");
  const titleText = interpolateText(template.title || "CERTIFICADO", textData);
  pdf.text(titleText, titlePosition.x, titlePosition.y, {
    align: "center",
  });

  const bodyText = interpolateText(template.body || "", textData).replace(
    /\r\n/g,
    "\n"
  );
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
    nota: "",
    nota_percentual: "",
    kappa: "",
    nota_texto: "",
  };

  // Title
  pdf.setFontSize(sizes.title);
  pdf.setFont(fontFamily, "bold");
  const titleText = interpolateText(template.title || "CERTIFICADO", textData);
  pdf.text(titleText, titlePosition.x, titlePosition.y, {
    align: "center",
  });

  const bodyText = interpolateText(template.body || "", textData).replace(
    /\r\n/g,
    "\n"
  );
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