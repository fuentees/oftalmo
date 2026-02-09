export const CERTIFICATE_TEMPLATE_KEY = "certificateTemplate";

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
  logos: {
    primary: "",
    secondary: "",
    tertiary: "",
    quaternary: "",
  },
  logoPositions: {
    primary: { x: 20, y: 18, w: 30, h: 30 },
    secondary: { x: 247, y: 18, w: 30, h: 30 },
    tertiary: { x: 20, y: 160, w: 30, h: 30 },
    quaternary: { x: 247, y: 160, w: 30, h: 30 },
  },
};

const mergeTemplate = (template) => ({
  ...DEFAULT_CERTIFICATE_TEMPLATE,
  ...template,
  logos: {
    ...DEFAULT_CERTIFICATE_TEMPLATE.logos,
    ...(template?.logos || {}),
  },
  logoPositions: {
    ...DEFAULT_CERTIFICATE_TEMPLATE.logoPositions,
    ...(template?.logoPositions || {}),
  },
  signature1: {
    ...DEFAULT_CERTIFICATE_TEMPLATE.signature1,
    ...(template?.signature1 || {}),
  },
  signature2: {
    ...DEFAULT_CERTIFICATE_TEMPLATE.signature2,
    ...(template?.signature2 || {}),
  },
});

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

export const resetCertificateTemplate = () => {
  if (typeof window === "undefined") return DEFAULT_CERTIFICATE_TEMPLATE;
  window.localStorage.setItem(
    CERTIFICATE_TEMPLATE_KEY,
    JSON.stringify(DEFAULT_CERTIFICATE_TEMPLATE)
  );
  return DEFAULT_CERTIFICATE_TEMPLATE;
};
