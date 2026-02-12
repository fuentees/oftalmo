import { supabase } from "@/api/supabaseClient";

export const CERTIFICATE_TEMPLATE_KEY = "certificateTemplate";
const STORAGE_BUCKET =
  import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "uploads";
const CERTIFICATE_TEMPLATE_STORAGE_PATH = "certificates/certificate-template.json";

export const DEFAULT_CERTIFICATE_TEMPLATE = {
  headerLines: [
    "SECRETARIA DE ESTADO DA SAÚDE",
    "CENTRO DE OFTALMOLOGIA SANITÁRIA",
  ],
  title: "CERTIFICADO",
  entityName: "Centro de Oftalmologia Sanitária",
  body:
    "Certificamos que {{nome}} {{rg}}, participou do treinamento \"{{treinamento}}\" promovido por {{entidade}}, com carga horária de {{carga_horaria}} horas, realizado em {{data}}.",
  footer: "São Paulo, {{data}}",
  signature1: {
    source: "coordinator",
    name: "",
    role: "Coordenador",
  },
  signature2: {
    source: "instructor",
    name: "",
    role: "Instrutor",
  },
  fonts: {
    family: "helvetica",
    headerSize: 10,
    titleSize: 28,
    nameSize: 24,
    bodySize: 14,
    footerSize: 12,
    signatureSize: 11,
    signatureRoleSize: 9,
  },
  textOptions: {
    bodyJustify: true,
    bodyLineHeight: 1.2,
    bodyMaxWordSpacing: 3,
    bodyIndent: 12,
  },
  logos: {},
  logoPositions: {},
  textPositions: {
    title: { x: 148.5, y: 40 },
    body: { x: 148.5, y: 62, width: 257 },
    footer: { x: 148.5, y: 155 },
  },
  signaturePositions: {
    signature1: { x: 70, y: 170, lineWidth: 60 },
    signature2: { x: 227, y: 170, lineWidth: 60 },
  },
};

const cleanLegacyLogos = (merged) => {
  const logoKeys = Object.keys(merged.logos || {});
  const legacyKeys = ["primary", "secondary", "tertiary", "quaternary"];
  const onlyLegacy = logoKeys.length > 0 && logoKeys.every((key) => legacyKeys.includes(key));
  const allEmpty = logoKeys.length > 0 && logoKeys.every((key) => !merged.logos?.[key]);
  if (onlyLegacy && allEmpty) {
    return {
      ...merged,
      logos: {},
      logoPositions: {},
    };
  }
  if (onlyLegacy) {
    const cleanedLogos = { ...merged.logos };
    const cleanedPositions = { ...(merged.logoPositions || {}) };
    legacyKeys.forEach((key) => {
      if (!merged.logos?.[key]) {
        delete cleanedLogos[key];
        delete cleanedPositions[key];
      }
    });
    return {
      ...merged,
      logos: cleanedLogos,
      logoPositions: cleanedPositions,
    };
  }
  return merged;
};

const mergeTemplate = (template) => {
  const merged = {
    ...DEFAULT_CERTIFICATE_TEMPLATE,
    ...template,
    logos: {
      ...(template?.logos || {}),
    },
    logoPositions: {
      ...(template?.logoPositions || {}),
    },
    textPositions: {
      ...DEFAULT_CERTIFICATE_TEMPLATE.textPositions,
      ...(template?.textPositions || {}),
    },
    signaturePositions: {
      ...DEFAULT_CERTIFICATE_TEMPLATE.signaturePositions,
      ...(template?.signaturePositions || {}),
    },
    fonts: {
      ...DEFAULT_CERTIFICATE_TEMPLATE.fonts,
      ...(template?.fonts || {}),
    },
    textOptions: {
      ...DEFAULT_CERTIFICATE_TEMPLATE.textOptions,
      ...(template?.textOptions || {}),
    },
    signature1: {
      ...DEFAULT_CERTIFICATE_TEMPLATE.signature1,
      ...(template?.signature1 || {}),
    },
    signature2: {
      ...DEFAULT_CERTIFICATE_TEMPLATE.signature2,
      ...(template?.signature2 || {}),
    },
  };
  const defaultIndent = Number(DEFAULT_CERTIFICATE_TEMPLATE.textOptions.bodyIndent) || 0;
  const mergedIndent = Number(merged.textOptions?.bodyIndent);
  if (!Number.isFinite(mergedIndent) || mergedIndent < defaultIndent) {
    merged.textOptions.bodyIndent = defaultIndent;
  }
  return cleanLegacyLogos(merged);
};

export const loadCertificateTemplate = () => {
  if (typeof window === "undefined") return DEFAULT_CERTIFICATE_TEMPLATE;
  try {
    const stored = window.localStorage.getItem(CERTIFICATE_TEMPLATE_KEY);
    if (!stored) return DEFAULT_CERTIFICATE_TEMPLATE;
    const parsed = JSON.parse(stored);
    return mergeTemplate(parsed);
  } catch (error) {
    return DEFAULT_CERTIFICATE_TEMPLATE;
  }
};

export const saveCertificateTemplate = (template) => {
  if (typeof window === "undefined") return;
  const payload = mergeTemplate(template);
  window.localStorage.setItem(
    CERTIFICATE_TEMPLATE_KEY,
    JSON.stringify(payload)
  );
};

export const loadCertificateTemplateFromStorage = async () => {
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(CERTIFICATE_TEMPLATE_STORAGE_PATH);
    if (error || !data) return null;
    const text = await data.text();
    if (!text) return null;
    const parsed = JSON.parse(text);
    return mergeTemplate(parsed);
  } catch (error) {
    return null;
  }
};

export const saveCertificateTemplateToStorage = async (template) => {
  const payload = mergeTemplate(template);
  const content = JSON.stringify(payload);
  const blob = new Blob([content], { type: "application/json" });
  const file = new File([blob], "certificate-template.json", {
    type: "application/json",
  });
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(CERTIFICATE_TEMPLATE_STORAGE_PATH, file, { upsert: true });
  if (error) throw error;
  return true;
};

export const resolveCertificateTemplate = async () => {
  const local = loadCertificateTemplate();
  const remote = await loadCertificateTemplateFromStorage();
  if (remote) {
    saveCertificateTemplate(remote);
    return remote;
  }
  return local;
};

export const resetCertificateTemplate = () => {
  if (typeof window === "undefined") return DEFAULT_CERTIFICATE_TEMPLATE;
  window.localStorage.setItem(
    CERTIFICATE_TEMPLATE_KEY,
    JSON.stringify(DEFAULT_CERTIFICATE_TEMPLATE)
  );
  return DEFAULT_CERTIFICATE_TEMPLATE;
};
