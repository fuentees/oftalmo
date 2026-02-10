export const CERTIFICATE_TEMPLATE_KEY = "certificateTemplate";
export const CERTIFICATE_TEMPLATE_TYPES = [
  "participant",
  "monitor",
  "coordinator",
  "speaker",
];

const normalizeTemplateType = (value) =>
  CERTIFICATE_TEMPLATE_TYPES.includes(value) ? value : "participant";

const getTemplateStorageKey = (type) =>
  `${CERTIFICATE_TEMPLATE_KEY}:${normalizeTemplateType(type)}`;

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
    bodyIndent: 6,
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

const DEFAULT_TEMPLATES_BY_TYPE = {
  participant: DEFAULT_CERTIFICATE_TEMPLATE,
  monitor: {
    ...DEFAULT_CERTIFICATE_TEMPLATE,
    title: "CERTIFICADO DE MONITORIA",
    body:
      "Certificamos que {{nome}} {{rg}}, atuou como monitor(a) no treinamento \"{{treinamento}}\" promovido por {{entidade}}, com carga horária de {{carga_horaria}} horas, realizado em {{data}}.",
  },
  coordinator: {
    ...DEFAULT_CERTIFICATE_TEMPLATE,
    title: "CERTIFICADO DE COORDENAÇÃO",
    body:
      "Certificamos que {{nome}} {{rg}}, coordenou o treinamento \"{{treinamento}}\" promovido por {{entidade}}, com carga horária de {{carga_horaria}} horas, realizado em {{data}}.",
  },
  speaker: {
    ...DEFAULT_CERTIFICATE_TEMPLATE,
    title: "CERTIFICADO DE PALESTRA",
    body:
      "Certificamos que {{nome}} {{rg}}, ministrou o treinamento \"{{treinamento}}\" promovido por {{entidade}}, com carga horária de {{carga_horaria}} horas, realizado em {{data}}.",
  },
};

const cloneTemplate = (template) =>
  JSON.parse(JSON.stringify(template || DEFAULT_CERTIFICATE_TEMPLATE));

const getDefaultTemplateForType = (type) =>
  cloneTemplate(DEFAULT_TEMPLATES_BY_TYPE[type] || DEFAULT_CERTIFICATE_TEMPLATE);

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

const mergeTemplate = (template, type = "participant") => {
  const merged = {
    ...getDefaultTemplateForType(type),
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
  return cleanLegacyLogos(merged);
};

export const loadCertificateTemplate = (type = "participant") => {
  if (typeof window === "undefined") return DEFAULT_CERTIFICATE_TEMPLATE;
  const normalizedType = normalizeTemplateType(type);
  const storageKey = getTemplateStorageKey(normalizedType);
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored && normalizedType === "participant") {
      const legacy = window.localStorage.getItem(CERTIFICATE_TEMPLATE_KEY);
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        return mergeTemplate(parsedLegacy, normalizedType);
      }
    }
    if (!stored) return getDefaultTemplateForType(normalizedType);
    const parsed = JSON.parse(stored);
    return mergeTemplate(parsed, normalizedType);
  } catch (error) {
    return getDefaultTemplateForType(normalizedType);
  }
};

export const saveCertificateTemplate = (template, type = "participant") => {
  if (typeof window === "undefined") return;
  const payload = mergeTemplate(template, type);
  const storageKey = getTemplateStorageKey(type);
  window.localStorage.setItem(storageKey, JSON.stringify(payload));
  if (normalizeTemplateType(type) === "participant") {
    window.localStorage.setItem(
      CERTIFICATE_TEMPLATE_KEY,
      JSON.stringify(payload)
    );
  }
};

export const resetCertificateTemplate = (type = "participant") => {
  if (typeof window === "undefined") return DEFAULT_CERTIFICATE_TEMPLATE;
  const storageKey = getTemplateStorageKey(type);
  const defaultTemplate = getDefaultTemplateForType(type);
  window.localStorage.setItem(
    storageKey,
    JSON.stringify(defaultTemplate)
  );
  if (normalizeTemplateType(type) === "participant") {
    window.localStorage.setItem(
      CERTIFICATE_TEMPLATE_KEY,
      JSON.stringify(defaultTemplate)
    );
  }
  return defaultTemplate;
};
