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

const formatCpf = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 11) return String(value || "").trim();
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
};

const resolveCertificateNumber = (source) =>
  String(
    source?.certificate_number ||
      source?.certificateNumber ||
      source?.numero_certificado ||
      ""
  ).trim();

const resolveDocumentInfo = ({ rg, cpf, document = "" }) => {
  const rawRg = String(rg || "").trim();
  const rawCpf = String(cpf || "").trim();
  const rawDocument = String(document || "").trim();
  if (rawRg && !rawCpf && rawRg.replace(/\D/g, "").length === 11) {
    const formattedCpf = formatCpf(rawRg);
    return { type: "CPF", number: formattedCpf, label: `CPF ${formattedCpf}` };
  }
  if (rawRg) {
    return { type: "RG", number: rawRg, label: `RG ${rawRg}` };
  }
  if (rawCpf) {
    const formattedCpf = formatCpf(rawCpf);
    return { type: "CPF", number: formattedCpf, label: `CPF ${formattedCpf}` };
  }
  if (rawDocument) {
    const digits = rawDocument.replace(/\D/g, "");
    if (digits.length === 11) {
      const formattedCpf = formatCpf(rawDocument);
      return { type: "CPF", number: formattedCpf, label: `CPF ${formattedCpf}` };
    }
    return { type: "Documento", number: rawDocument, label: rawDocument };
  }
  return { type: "", number: "", label: "" };
};

const formatTimeRange = (start, end) => {
  const startTime = String(start || "").trim();
  const endTime = String(end || "").trim();
  if (startTime && endTime) return `${startTime} às ${endTime}`;
  return startTime || endTime || "";
};

const normalizeComparableText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const getTrainingScheduleEntries = (training) => {
  const entries = [];
  const dates = Array.isArray(training?.dates) ? training.dates : [];
  dates.forEach((dateItem) => {
    const date = dateItem?.date || dateItem?.start_date || "";
    const fallbackStart = dateItem?.start_time || training?.start_time || "";
    const fallbackEnd = dateItem?.end_time || training?.end_time || "";
    const sessions = Array.isArray(dateItem?.sessions) ? dateItem.sessions : [];
    if (sessions.length === 0) {
      entries.push({
        date,
        start_time: fallbackStart,
        end_time: fallbackEnd,
        title: "",
        speaker_name: "",
        professional_id: "",
        professional_email: "",
      });
      return;
    }
    sessions.forEach((session) => {
      entries.push({
        date,
        start_time: session?.start_time || fallbackStart,
        end_time: session?.end_time || fallbackEnd,
        title: session?.title || "",
        speaker_name: session?.speaker_name || "",
        professional_id: session?.professional_id || "",
        professional_email: session?.professional_email || "",
      });
    });
  });
  if (entries.length > 0) return entries;
  return getTrainingDates(training).map((date) => ({
    date,
    start_time: training?.start_time || "",
    end_time: training?.end_time || "",
    title: "",
    speaker_name: "",
    professional_id: "",
    professional_email: "",
  }));
};

const formatScheduleDate = (value) => {
  const parsed = parseDateSafe(value);
  if (Number.isNaN(parsed.getTime())) return String(value || "").trim();
  return format(parsed, "dd/MM/yyyy");
};

const resolveStaffScheduleDetails = (staff, training) => {
  const explicitEntry = staff?.certificateScheduleEntry;
  const entries = explicitEntry ? [explicitEntry] : getTrainingScheduleEntries(training);
  const staffName = normalizeComparableText(staff?.name);
  const staffEmail = String(staff?.email || "").trim().toLowerCase();
  const staffProfessionalId = String(staff?.professional_id || "").trim();
  const staffLecture = normalizeComparableText(staff?.lecture);

  const matched = entries.filter((entry) => {
    const entryProfessionalId = String(entry?.professional_id || "").trim();
    if (staffProfessionalId && entryProfessionalId === staffProfessionalId) return true;
    const entryEmail = String(entry?.professional_email || "").trim().toLowerCase();
    if (staffEmail && entryEmail === staffEmail) return true;
    const entrySpeaker = normalizeComparableText(entry?.speaker_name);
    if (staffName && entrySpeaker && staffName === entrySpeaker) return true;
    const entryTitle = normalizeComparableText(entry?.title);
    return staffLecture && entryTitle && staffLecture === entryTitle;
  });

  const source = matched.length > 0 ? matched : entries;
  const lectureTitles = Array.from(
    new Set(
      source
        .map((entry) => String(entry?.title || "").trim())
        .filter(Boolean)
    )
  );
  const dates = Array.from(
    new Set(
      source
        .map((entry) => formatScheduleDate(entry?.date))
        .filter(Boolean)
    )
  );
  const times = Array.from(
    new Set(
      source
        .map((entry) => formatTimeRange(entry?.start_time, entry?.end_time))
        .filter(Boolean)
    )
  );
  const details = source
    .map((entry) => {
      const date = formatScheduleDate(entry?.date);
      const time = formatTimeRange(entry?.start_time, entry?.end_time);
      const title = String(entry?.title || "").trim();
      return [date, time, title].filter(Boolean).join(" - ");
    })
    .filter(Boolean);

  return {
    lecture: String(staff?.lecture || "").trim() || lectureTitles.join("; "),
    dates: dates.join(", "),
    times: times.join(", "),
    details: details.join("; "),
  };
};

const buildCertificateControlData = (source) => {
  const certificateNumber = resolveCertificateNumber(source);
  return {
    numero_certificado: certificateNumber,
    codigo_certificado: certificateNumber,
    certificado_numero: certificateNumber,
  };
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

const parseMunicipalityFromLocation = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hasGve = /gve/i.test(raw);
  if (!hasGve) return raw;
  const match = raw.match(/^(.*?)\s*(?:-|•|\|)?\s*GVE\s*[:\-]?\s*(.+)$/i);
  if (match) return String(match[1] || "").trim();
  return raw;
};

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

const DEFAULT_BODY_MAX_WORD_SPACING = 2;
const ABSOLUTE_MAX_WORD_SPACING_FACTOR = 2.2;

const normalizeAlignValue = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["left", "right", "center", "justify"].includes(normalized)) {
    return normalized;
  }
  return null;
};

const getTextCharacterSlots = (value) =>
  Math.max(0, Array.from(String(value || "")).length - 1);

const drawWordWithCharSpacing = (pdf, value, x, y, charSpacing = 0) => {
  const text = String(value || "");
  if (!text) return 0;
  if (!charSpacing) {
    pdf.text(text, x, y);
    return pdf.getTextWidth(text);
  }

  const chars = Array.from(text);
  let cursorX = x;
  chars.forEach((char, index) => {
    pdf.text(char, cursorX, y);
    cursorX += pdf.getTextWidth(char);
    if (index < chars.length - 1) {
      cursorX += charSpacing;
    }
  });

  return cursorX - x;
};

const resolveNodeAlignment = (node, inherited = "left") => {
  if (!node || typeof node !== "object") return inherited || "left";
  const attrAlign = normalizeAlignValue(node.getAttribute?.("align"));
  if (attrAlign) return attrAlign;

  const styleAlign = normalizeAlignValue(node.style?.textAlign);
  if (styleAlign) return styleAlign;

  const classList = Array.from(node.classList || []);
  if (classList.includes("ql-align-right")) return "right";
  if (classList.includes("ql-align-center")) return "center";
  if (classList.includes("ql-align-justify")) return "justify";

  return inherited || "left";
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
      align: "left",
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
      align: normalizeAlignValue(style?.align) || "left",
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

    const resolvedAlign = resolveNodeAlignment(
      node,
      normalizeAlignValue(style?.align) || "left"
    );
    const nextStyle = {
      ...style,
      bold: style.bold || tag === "strong" || tag === "b",
      italic: style.italic || tag === "em" || tag === "i",
      underline: style.underline || tag === "u",
      align: resolvedAlign,
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
          align: resolvedAlign,
        });
      });
      ensureTrailingNewline();
      return;
    }

    if (tag === "li") {
      const marker = listContext?.type === "ol" ? `${listContext.index}. ` : "• ";
      pushTextToken(marker, { align: listContext?.align || nextStyle.align });
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

const buildLines = (
  tokens,
  maxWidth,
  measureWord,
  baseSpaceWidth,
  firstLineIndent = 0,
  defaultAlign = "left"
) => {
  const lines = [];
  const explicitLines = splitTokensByExplicitLines(tokens);

  explicitLines.forEach((explicitLineTokens) => {
    if (!explicitLineTokens.length) {
      lines.push({
        words: [],
        indent: 0,
        align: normalizeAlignValue(defaultAlign) || "left",
        isParagraphLast: true,
      });
      return;
    }

    const paragraphAlign =
      normalizeAlignValue(
        explicitLineTokens.find((token) => token?.type === "text" && token?.align)?.align
      ) ||
      normalizeAlignValue(defaultAlign) ||
      "left";
    let currentWords = [];
    let lineWidth = 0;
    let pendingSpace = false;
    let currentIndent = firstLineIndent;
    let maxWidthForLine = maxWidth - currentIndent;

    const pushCurrentLine = (isParagraphLast = false) => {
      if (!currentWords.length) return;
      lines.push({
        words: currentWords,
        indent: currentIndent,
        align: paragraphAlign,
        isParagraphLast,
      });
      currentWords = [];
      lineWidth = 0;
      pendingSpace = false;
      currentIndent = 0;
      maxWidthForLine = maxWidth;
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
          pushCurrentLine(false);
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
      pushCurrentLine(true);
    } else if (lines.length > 0) {
      lines[lines.length - 1].isParagraphLast = true;
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
    align = "left",
    maxWordSpacing = DEFAULT_BODY_MAX_WORD_SPACING,
    indent = 0,
    paragraphSpacing = 0,
  } = options || {};
  pdf.setFontSize(fontSize);
  pdf.setFont(fontFamily, "normal");
  const baseSpaceWidth = pdf.getTextWidth(" ");
  const configuredMaxWordSpacing = Number(maxWordSpacing);
  const effectiveMaxWordSpacing = Number.isFinite(configuredMaxWordSpacing)
    ? Math.max(1, Math.min(configuredMaxWordSpacing, ABSOLUTE_MAX_WORD_SPACING_FACTOR))
    : DEFAULT_BODY_MAX_WORD_SPACING;
  const maxSpaceWidth = baseSpaceWidth * effectiveMaxWordSpacing;
  const normalizedAlign = normalizeAlignValue(align) || (justify ? "justify" : "left");
  const tokens = parseFormattedText(text);
  const measureWord = (word, tokenStyle) => {
    pdf.setFont(fontFamily, toFontStyle(tokenStyle));
    return pdf.getTextWidth(word);
  };
  const lines = buildLines(
    tokens,
    maxWidth,
    measureWord,
    baseSpaceWidth,
    indent,
    normalizedAlign
  );
  let cursorY = y;
  lines.forEach((line) => {
    const words = line.words;
    if (words.length === 0) {
      cursorY += lineHeight;
      if (line.isParagraphLast && paragraphSpacing > 0) {
        cursorY += paragraphSpacing;
      }
      return;
    }
    const wordWidths = words.map((word) => measureWord(word.text, word));
    const wordsWidth = wordWidths.reduce((sum, width) => sum + width, 0);
    const gaps = words.length - 1;
    let spaceWidth = baseSpaceWidth;
    let charSpacing = 0;
    const lineIndent = Number(line.indent) || 0;
    const availableWidth = Math.max(0, maxWidth - lineIndent);
    const lineAlign = normalizeAlignValue(line.align) || normalizedAlign;
    const simpleLineWidth = wordsWidth + Math.max(0, gaps) * baseSpaceWidth;
    const shouldJustify =
      lineAlign === "justify" &&
      !line.isParagraphLast &&
      gaps > 0;
    let cursorX = x + lineIndent;

    if (shouldJustify) {
      const proposed = (availableWidth - wordsWidth) / gaps;
      if (Number.isFinite(proposed) && proposed > 0) {
        if (proposed <= maxSpaceWidth) {
          spaceWidth = proposed;
        } else {
          // Mantém o espaço entre palavras em limite visual e completa no tracking.
          spaceWidth = maxSpaceWidth;
          const widthWithCappedSpaces = wordsWidth + gaps * spaceWidth;
          const remainingWidth = availableWidth - widthWithCappedSpaces;
          if (remainingWidth > 0) {
            const totalCharSlots = words.reduce(
              (total, word) => total + getTextCharacterSlots(word.text),
              0
            );
            if (totalCharSlots > 0) {
              charSpacing = remainingWidth / totalCharSlots;
            } else {
              spaceWidth += remainingWidth / gaps;
            }
          }
        }
      }
    } else if (lineAlign === "center") {
      cursorX += Math.max(0, (availableWidth - simpleLineWidth) / 2);
    } else if (lineAlign === "right") {
      cursorX += Math.max(0, availableWidth - simpleLineWidth);
    }

    words.forEach((word, idx) => {
      pdf.setFont(fontFamily, toFontStyle(word));
      const renderedWordWidth = drawWordWithCharSpacing(
        pdf,
        word.text,
        cursorX,
        cursorY,
        charSpacing
      );
      if (word.underline) {
        const underlineY = cursorY + fontSize * 0.12;
        pdf.setLineWidth(0.25);
        pdf.line(cursorX, underlineY, cursorX + renderedWordWidth, underlineY);
      }
      cursorX += renderedWordWidth + (idx < gaps ? spaceWidth : 0);
    });

    cursorY += lineHeight;
    if (line.isParagraphLast && paragraphSpacing > 0) {
      cursorY += paragraphSpacing;
    }
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

const buildParticipantCertificateTextData = (participant, training, template) => {
  const trainingDates = getTrainingDates(training);
  const trainingPeriod = buildTrainingPeriod(trainingDates);
  const trainingDays = buildTrainingDays(trainingDates);
  const participantDate = trainingDates[0] || formatDateSafe(training?.dates?.[0]?.date);
  const emissionDate = formatDateSafe(new Date());
  const scoreInfo = resolveParticipantScore(participant);
  const documentInfo = resolveDocumentInfo({
    rg: participant?.professional_rg,
    cpf: participant?.professional_cpf,
  });

  return {
    ...buildCertificateControlData(participant),
    nome: participant?.professional_name || "",
    rg: documentInfo.label,
    cpf: participant?.professional_cpf ? `CPF ${formatCpf(participant.professional_cpf)}` : "",
    documento: documentInfo.label,
    documento_tipo: documentInfo.type,
    documento_numero: documentInfo.number,
    treinamento: training?.title || "",
    carga_horaria: training?.duration_hours || "",
    data: participantDate || formatDateSafe(new Date()),
    data_treinamento: participantDate || "",
    data_emissao: emissionDate || "",
    entidade: template?.entityName || "",
    coordenador: training?.coordinator || "",
    instrutor: training?.instructor || "",
    local: training?.municipality || training?.location || "",
    municipio: training?.municipality || parseMunicipalityFromLocation(training?.location),
    funcao: "participante",
    tipo_certificado: "participante",
    aula: "",
    data_aula: "",
    horario_aula: "",
    periodo_aula: "",
    detalhes_aula: "",
    periodo_treinamento: trainingPeriod,
    dias_treinamento: trainingDays,
    nota: scoreInfo.scoreLabel,
    nota_percentual: scoreInfo.scoreLabel ? `${scoreInfo.scoreLabel}%` : "",
    kappa: scoreInfo.kappaLabel,
    nota_texto: scoreInfo.scoreText,
  };
};

const buildStaffCertificateTextData = (staff, training, template, roleKey) => {
  const trainingDates = getTrainingDates(training);
  const trainingPeriod = buildTrainingPeriod(trainingDates);
  const trainingDays = buildTrainingDays(trainingDates);
  const trainingDate =
    trainingDates[0] ||
    formatDateSafe(training?.dates?.[0]?.date) ||
    formatDateSafe(new Date());
  const emissionDate = formatDateSafe(new Date());
  const documentInfo = resolveDocumentInfo({
    rg: staff?.rg,
    cpf: staff?.cpf,
    document: staff?.document,
  });
  const scheduleDetails = resolveStaffScheduleDetails(staff, training);

  return {
    ...buildCertificateControlData(staff),
    nome: staff?.name || "",
    rg: documentInfo.label,
    cpf: staff?.cpf ? `CPF ${formatCpf(staff.cpf)}` : "",
    documento: documentInfo.label,
    documento_tipo: documentInfo.type,
    documento_numero: documentInfo.number,
    treinamento: training?.title || "",
    carga_horaria: training?.duration_hours || "",
    data: trainingDate,
    data_treinamento: trainingDate || "",
    data_emissao: emissionDate || "",
    entidade: template?.entityName || "",
    coordenador: training?.coordinator || "",
    instrutor: training?.instructor || "",
    local: training?.municipality || training?.location || "",
    municipio: training?.municipality || parseMunicipalityFromLocation(training?.location),
    funcao: roleKey,
    tipo_certificado: roleKey,
    aula: scheduleDetails.lecture,
    data_aula: scheduleDetails.dates,
    horario_aula: scheduleDetails.times,
    periodo_aula: [scheduleDetails.dates, scheduleDetails.times].filter(Boolean).join(", "),
    detalhes_aula: scheduleDetails.details,
    periodo_treinamento: trainingPeriod,
    dias_treinamento: trainingDays,
    nota: "",
    nota_percentual: "",
    kappa: "",
    nota_texto: "",
  };
};

const drawCertificateControlLine = (pdf, textData, pageWidth, pageHeight, fontFamily) => {
  const certificateNumber = String(textData?.numero_certificado || "").trim();
  if (!certificateNumber) return;
  pdf.setFont(fontFamily, "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`Certificado no ${certificateNumber}`, pageWidth / 2, pageHeight - 12, {
    align: "center",
  });
  pdf.setTextColor(0, 0, 0);
};

const escapeWordHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const interpolateHtmlText = (value, textData) =>
  String(value || "").replace(/\{\{(\w+)\}\}/g, (_, key) =>
    textData[key] !== undefined && textData[key] !== null
      ? escapeWordHtml(textData[key])
      : ""
  );

const renderWordBody = (template, textData) => {
  const interpolated = interpolateText(template?.body || "", textData).trim();
  if (!interpolated) return "";
  if (BODY_HTML_TAG_REGEX.test(interpolated)) return interpolated;
  return interpolated
    .split(/\n+/)
    .map((line) => `<p>${escapeWordHtml(line)}</p>`)
    .join("");
};

const renderWordLogos = (template) => {
  const logoEntries = Array.isArray(template?.logos)
    ? template.logos.map((logo, index) => [
        logo?.id || `logo_${index + 1}`,
        logo?.dataUrl || logo?.url || logo,
      ])
    : Object.entries(template?.logos || {});
  const logos = logoEntries
    .map(([key, dataUrl]) => {
      if (!dataUrl) return "";
      return `<img alt="${escapeWordHtml(key)}" src="${dataUrl}" />`;
    })
    .filter(Boolean);
  if (!logos.length) return "";
  return `<div class="logos">${logos.join("")}</div>`;
};

const createCertificateWordBlob = ({ template, training, textData }) => {
  const fonts = template?.fonts || {};
  const headerLines = Array.isArray(template?.headerLines)
    ? template.headerLines
    : [];
  const title = interpolateHtmlText(template?.title || "CERTIFICADO", textData);
  const footer = template?.footer
    ? interpolateHtmlText(template.footer, {
        ...textData,
        data: textData.data_emissao || textData.data || "",
      })
    : "";
  const signature1 = resolveSignature(template?.signature1, training);
  const signature2 = resolveSignature(template?.signature2, training);
  const signatureHtml = [signature1, signature2]
    .filter((signature) => signature?.name)
    .map(
      (signature) => `
        <div class="signature">
          <div class="signature-line"></div>
          <div class="signature-name">${escapeWordHtml(signature.name)}</div>
          <div class="signature-role">${escapeWordHtml(signature.role || "")}</div>
        </div>
      `
    )
    .join("");
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page WordSection1 {
            size: 29.7cm 21cm;
            margin: 1cm;
            mso-page-orientation: landscape;
          }
          body {
            margin: 0;
            font-family: ${fonts.family || "Arial"}, Arial, sans-serif;
            color: #0f172a;
          }
          .page {
            page: WordSection1;
            width: 27.7cm;
            min-height: 19cm;
            border: 6px double #0052cc;
            padding: 1cm 1.2cm;
            box-sizing: border-box;
            text-align: center;
          }
          .logos {
            display: flex;
            justify-content: space-between;
            align-items: center;
            min-height: 2.2cm;
            margin-bottom: .25cm;
          }
          .logos img {
            max-height: 2.1cm;
            max-width: 4cm;
            object-fit: contain;
          }
          .header div {
            font-size: ${Number(fonts.headerSize) || 10}pt;
            font-weight: 700;
            line-height: 1.25;
          }
          h1 {
            font-size: ${Number(fonts.titleSize) || 28}pt;
            margin: .75cm 0 .55cm;
            letter-spacing: 0;
          }
          .body {
            font-size: ${Number(fonts.bodySize) || 14}pt;
            line-height: ${Number(template?.textOptions?.bodyLineHeight) || 1.35};
            text-align: ${template?.textOptions?.bodyJustify === false ? "left" : "justify"};
            margin: 0 auto;
            max-width: 24cm;
          }
          .body p {
            margin: 0 0 .35cm;
            text-indent: ${Number(template?.textOptions?.bodyIndent) || 0}mm;
          }
          .footer {
            margin-top: .8cm;
            font-size: ${Number(fonts.footerSize) || 12}pt;
            text-align: center;
          }
          .signatures {
            display: flex;
            justify-content: space-around;
            gap: 1.5cm;
            margin-top: 1.2cm;
          }
          .signature {
            width: 7cm;
            text-align: center;
            font-size: ${Number(fonts.signatureSize) || 11}pt;
          }
          .signature-line {
            border-top: 1px solid #111827;
            margin-bottom: .18cm;
          }
          .signature-role {
            font-size: ${Number(fonts.signatureRoleSize) || 9}pt;
            color: #475569;
          }
          .control {
            margin-top: .5cm;
            font-size: 7pt;
            color: #475569;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="page">
          ${renderWordLogos(template)}
          <div class="header">
            ${headerLines.map((line) => `<div>${escapeWordHtml(line)}</div>`).join("")}
          </div>
          <h1>${title}</h1>
          <div class="body">${renderWordBody(template, textData)}</div>
          ${footer ? `<div class="footer">${footer}</div>` : ""}
          ${signatureHtml ? `<div class="signatures">${signatureHtml}</div>` : ""}
          ${
            textData?.numero_certificado
              ? `<div class="control">Certificado no ${escapeWordHtml(textData.numero_certificado)}</div>`
              : ""
          }
        </div>
      </body>
    </html>
  `;
  return new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
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
  const emissionDate = formatDateSafe(new Date());
  const scoreInfo = resolveParticipantScore(participant);
  const documentInfo = resolveDocumentInfo({
    rg: participant.professional_rg,
    cpf: participant.professional_cpf,
  });

  const textData = {
    ...buildCertificateControlData(participant),
    nome: participant.professional_name || "",
    rg: documentInfo.label,
    cpf: participant.professional_cpf ? `CPF ${formatCpf(participant.professional_cpf)}` : "",
    documento: documentInfo.label,
    documento_tipo: documentInfo.type,
    documento_numero: documentInfo.number,
    treinamento: training.title || "",
    carga_horaria: training.duration_hours || "",
    data: participantDate || formatDateSafe(new Date()),
    data_treinamento: participantDate || "",
    data_emissao: emissionDate || "",
    entidade: template.entityName || "",
    coordenador: training.coordinator || "",
    instrutor: training.instructor || "",
    local: training.municipality || training.location || "",
    municipio: training.municipality || parseMunicipalityFromLocation(training.location),
    funcao: "participante",
    tipo_certificado: "participante",
    aula: "",
    data_aula: "",
    horario_aula: "",
    periodo_aula: "",
    detalhes_aula: "",
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
  const bodyAlign =
    normalizeAlignValue(textOptions.bodyAlign) ||
    (justifyBody ? "justify" : "left");
  const lineHeightFactor = Number(textOptions.bodyLineHeight) || 1.2;
  const maxWordSpacing =
    Number(textOptions.bodyMaxWordSpacing) || DEFAULT_BODY_MAX_WORD_SPACING;
  const paragraphSpacing = Number(textOptions.bodyParagraphSpacing) || 0;
  const bodyIndent = Number(textOptions.bodyIndent) || 0;
  const lineHeight = pdf.getTextDimensions("Mg").h * lineHeightFactor;
  pdf.setFontSize(sizes.body);
  pdf.setFont(fontFamily, "normal");
  drawFormattedText(pdf, bodyText, bodyLeft, bodyPosition.y, bodyWidth, lineHeight, {
    fontFamily,
    fontSize: sizes.body,
    align: bodyAlign,
    justify: justifyBody,
    maxWordSpacing,
    paragraphSpacing,
    indent: bodyIndent,
  });

  if (template.footer) {
    pdf.setFontSize(sizes.footer);
    const footerText = interpolateText(template.footer, {
      ...textData,
      data: emissionDate || textData.data || "",
    });
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

  drawCertificateControlLine(pdf, textData, pageWidth, pageHeight, fontFamily);

  return pdf;
};

const generateStaffCertificate = ({
  staff,
  training,
  templateOverride,
  roleKey,
}) => {
  const template = templateOverride || loadCertificateTemplate();
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
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
  const trainingDate =
    trainingDates[0] ||
    formatDateSafe(training.dates?.[0]?.date) ||
    formatDateSafe(new Date());
  const emissionDate = formatDateSafe(new Date());
  const documentInfo = resolveDocumentInfo({
    rg: staff.rg,
    cpf: staff.cpf,
    document: staff.document,
  });
  const scheduleDetails = resolveStaffScheduleDetails(staff, training);

  const textData = {
    ...buildCertificateControlData(staff),
    nome: staff.name || "",
    rg: documentInfo.label,
    cpf: staff.cpf ? `CPF ${formatCpf(staff.cpf)}` : "",
    documento: documentInfo.label,
    documento_tipo: documentInfo.type,
    documento_numero: documentInfo.number,
    treinamento: training.title || "",
    carga_horaria: training.duration_hours || "",
    data: trainingDate,
    data_treinamento: trainingDate || "",
    data_emissao: emissionDate || "",
    entidade: template.entityName || "",
    coordenador: training.coordinator || "",
    instrutor: training.instructor || "",
    local: training.municipality || training.location || "",
    municipio: training.municipality || parseMunicipalityFromLocation(training.location),
    funcao: roleKey,
    tipo_certificado: roleKey,
    aula: scheduleDetails.lecture,
    data_aula: scheduleDetails.dates,
    horario_aula: scheduleDetails.times,
    periodo_aula: [scheduleDetails.dates, scheduleDetails.times].filter(Boolean).join(", "),
    detalhes_aula: scheduleDetails.details,
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
  const bodyAlign =
    normalizeAlignValue(textOptions.bodyAlign) ||
    (justifyBody ? "justify" : "left");
  const lineHeightFactor = Number(textOptions.bodyLineHeight) || 1.2;
  const maxWordSpacing =
    Number(textOptions.bodyMaxWordSpacing) || DEFAULT_BODY_MAX_WORD_SPACING;
  const paragraphSpacing = Number(textOptions.bodyParagraphSpacing) || 0;
  const bodyIndent = Number(textOptions.bodyIndent) || 0;
  const lineHeight = pdf.getTextDimensions("Mg").h * lineHeightFactor;
  pdf.setFontSize(sizes.body);
  pdf.setFont(fontFamily, "normal");
  drawFormattedText(pdf, bodyText, bodyLeft, bodyPosition.y, bodyWidth, lineHeight, {
    fontFamily,
    fontSize: sizes.body,
    align: bodyAlign,
    justify: justifyBody,
    maxWordSpacing,
    paragraphSpacing,
    indent: bodyIndent,
  });

  if (template.footer) {
    pdf.setFontSize(sizes.footer);
    const footerText = interpolateText(template.footer, {
      ...textData,
      data: emissionDate || textData.data || "",
    });
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

  drawCertificateControlLine(pdf, textData, pageWidth, pageHeight, fontFamily);

  return pdf;
};

export const generateCoordinatorCertificate = (
  coordinator,
  training,
  templateOverride
) =>
  generateStaffCertificate({
    staff: coordinator || {},
    training,
    templateOverride,
    roleKey: "coordenador",
  });

export const generateMonitorCertificate = (monitor, training, templateOverride) =>
  generateStaffCertificate({
    staff: monitor || {},
    training,
    templateOverride,
    roleKey: "monitor",
  });

export const generateSpeakerCertificate = (speaker, training, templateOverride) =>
  generateStaffCertificate({
    staff: speaker || {},
    training,
    templateOverride,
    roleKey: "palestrante",
  });

export const generateParticipantCertificateWordBlob = (
  participant,
  training,
  templateOverride
) => {
  const template = templateOverride || loadCertificateTemplate();
  return createCertificateWordBlob({
    template,
    training,
    textData: buildParticipantCertificateTextData(participant || {}, training || {}, template),
  });
};

const generateStaffCertificateWordBlob = ({
  staff,
  training,
  templateOverride,
  roleKey,
}) => {
  const template = templateOverride || loadCertificateTemplate();
  return createCertificateWordBlob({
    template,
    training,
    textData: buildStaffCertificateTextData(staff || {}, training || {}, template, roleKey),
  });
};

export const generateCoordinatorCertificateWordBlob = (
  coordinator,
  training,
  templateOverride
) =>
  generateStaffCertificateWordBlob({
    staff: coordinator || {},
    training,
    templateOverride,
    roleKey: "coordenador",
  });

export const generateMonitorCertificateWordBlob = (
  monitor,
  training,
  templateOverride
) =>
  generateStaffCertificateWordBlob({
    staff: monitor || {},
    training,
    templateOverride,
    roleKey: "monitor",
  });

export const generateSpeakerCertificateWordBlob = (
  speaker,
  training,
  templateOverride
) =>
  generateStaffCertificateWordBlob({
    staff: speaker || {},
    training,
    templateOverride,
    roleKey: "palestrante",
  });
