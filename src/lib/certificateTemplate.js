import { supabase } from "@/api/supabaseClient";

export const CERTIFICATE_TEMPLATE_KEY = "certificateTemplate";
export const CERTIFICATE_TEMPLATE_BY_TRAINING_KEY =
  "certificateTemplateByTraining";
const CERTIFICATE_TEMPLATE_SYNC_DISABLED_KEY =
  "certificateTemplateStorageSyncDisabled";
const STORAGE_BUCKET =
  import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "uploads";
const CERTIFICATE_TEMPLATE_STORAGE_PATH = "certificates/certificate-template.json";
const CERTIFICATE_TEMPLATE_BY_TRAINING_STORAGE_PATH =
  "certificates/certificate-template-by-training.json";

export const DEFAULT_CERTIFICATE_TEMPLATE = {
  headerLines: [
    "SECRETARIA DE ESTADO DA SAÚDE",
    "CENTRO DE OFTALMOLOGIA SANITÁRIA",
  ],
  title: "CERTIFICADO",
  entityName: "Centro de Oftalmologia Sanitária",
  body:
    "Certificamos que {{nome}} {{rg}}, participou do treinamento \"{{treinamento}}\" promovido por {{entidade}}, com carga horária de {{carga_horaria}} horas, realizado em {{data}}. {{nota_texto}}",
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
    bodyParagraphSpacing: 0,
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

const extractStorageErrorText = (error) =>
  String(
    error?.message || error?.error_description || error?.details || error?.hint || ""
  )
    .trim()
    .toLowerCase();

const isStoragePermissionError = (error) => {
  const message = extractStorageErrorText(error);
  const status = Number(error?.status || 0);
  const code = String(error?.code || "").toLowerCase();
  return (
    status === 401 ||
    status === 403 ||
    code === "42501" ||
    message.includes("row-level security") ||
    message.includes("violates row-level security policy") ||
    message.includes("permission denied") ||
    message.includes("not authorized") ||
    message.includes("unauthorized")
  );
};

const getCertificateTemplateSyncDisabled = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(CERTIFICATE_TEMPLATE_SYNC_DISABLED_KEY) === "1";
};

const setCertificateTemplateSyncDisabled = (disabled) => {
  if (typeof window === "undefined") return;
  if (disabled) {
    window.localStorage.setItem(CERTIFICATE_TEMPLATE_SYNC_DISABLED_KEY, "1");
    return;
  }
  window.localStorage.removeItem(CERTIFICATE_TEMPLATE_SYNC_DISABLED_KEY);
};

export const isCertificateTemplateCloudSyncDisabled = () =>
  getCertificateTemplateSyncDisabled();

const toNormalizedTrainingTemplateId = (value) => String(value || "").trim();

const normalizeTrainingTemplateIds = (value) => {
  const ids = [];
  const pushId = (candidate) => {
    const normalized = toNormalizedTrainingTemplateId(candidate);
    if (normalized) ids.push(normalized);
  };

  if (Array.isArray(value)) {
    value.forEach((item) => pushId(item));
  } else if (typeof value === "object" && value) {
    pushId(value.id);
    pushId(value.training_id);
    if (Array.isArray(value.trainingIds)) {
      value.trainingIds.forEach((item) => pushId(item));
    }
    if (Array.isArray(value.aliasTrainingIds)) {
      value.aliasTrainingIds.forEach((item) => pushId(item));
    }
  } else {
    pushId(value);
  }

  return Array.from(new Set(ids));
};

const normalizeTrainingTemplateId = (value) =>
  normalizeTrainingTemplateIds(value)[0] || "";

const mergeTemplateMap = (templateMap) => {
  const rows = Object.entries(templateMap || {});
  return rows.reduce((acc, [key, value]) => {
    const normalizedKey = normalizeTrainingTemplateId(key);
    if (!normalizedKey || !value || typeof value !== "object") return acc;
    acc[normalizedKey] = mergeTemplate(value);
    return acc;
  }, {});
};

const stableStringifyMap = (templateMap) => {
  const sorted = Object.keys(templateMap || {})
    .sort()
    .reduce((acc, key) => {
      acc[key] = templateMap[key];
      return acc;
    }, {});
  return JSON.stringify(sorted);
};

const getTemplateUpdatedAt = (template) => {
  const value = template?.updatedAt;
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const countLogos = (template) =>
  Object.values(template?.logos || {}).filter(Boolean).length;

const hasCustomSignatures = (template) => {
  const signatures = [template?.signature1, template?.signature2].filter(Boolean);
  return signatures.some(
    (signature) =>
      signature.source === "custom" ||
      Boolean(signature.name) ||
      Boolean(signature.role)
  );
};

const hasCustomContent = (template) =>
  countLogos(template) > 0 || hasCustomSignatures(template);

const pickBestTemplate = (local, remote) => {
  if (!remote) return { template: local, source: "local" };
  if (!local) return { template: remote, source: "remote" };
  const localCustom = hasCustomContent(local);
  const remoteCustom = hasCustomContent(remote);
  if (localCustom && !remoteCustom) return { template: local, source: "local" };
  if (!localCustom && remoteCustom) return { template: remote, source: "remote" };
  const localUpdatedAt = getTemplateUpdatedAt(local);
  const remoteUpdatedAt = getTemplateUpdatedAt(remote);
  if (localUpdatedAt && remoteUpdatedAt) {
    return localUpdatedAt >= remoteUpdatedAt
      ? { template: local, source: "local" }
      : { template: remote, source: "remote" };
  }
  if (localUpdatedAt && !remoteUpdatedAt) return { template: local, source: "local" };
  if (!localUpdatedAt && remoteUpdatedAt) return { template: remote, source: "remote" };
  return { template: local, source: "local" };
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

const loadCertificateTemplateMap = () => {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(
      CERTIFICATE_TEMPLATE_BY_TRAINING_KEY
    );
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return mergeTemplateMap(parsed);
  } catch (error) {
    return {};
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

const saveCertificateTemplateMap = (templateMap) => {
  if (typeof window === "undefined") return;
  const payload = mergeTemplateMap(templateMap);
  window.localStorage.setItem(
    CERTIFICATE_TEMPLATE_BY_TRAINING_KEY,
    JSON.stringify(payload)
  );
};

export const loadCertificateTemplateFromStorage = async () => {
  if (getCertificateTemplateSyncDisabled()) return null;
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(CERTIFICATE_TEMPLATE_STORAGE_PATH);
    if (error || !data) {
      if (isStoragePermissionError(error)) {
        setCertificateTemplateSyncDisabled(true);
      }
      return null;
    }
    const text = await data.text();
    if (!text) return null;
    const parsed = JSON.parse(text);
    return mergeTemplate(parsed);
  } catch (error) {
    if (isStoragePermissionError(error)) {
      setCertificateTemplateSyncDisabled(true);
    }
    return null;
  }
};

const loadCertificateTemplateMapFromStorage = async () => {
  if (getCertificateTemplateSyncDisabled()) return null;
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(CERTIFICATE_TEMPLATE_BY_TRAINING_STORAGE_PATH);
    if (error || !data) {
      if (isStoragePermissionError(error)) {
        setCertificateTemplateSyncDisabled(true);
      }
      return null;
    }
    const text = await data.text();
    if (!text) return null;
    const parsed = JSON.parse(text);
    return mergeTemplateMap(parsed);
  } catch (error) {
    if (isStoragePermissionError(error)) {
      setCertificateTemplateSyncDisabled(true);
    }
    return null;
  }
};

export const saveCertificateTemplateToStorage = async (template) => {
  if (getCertificateTemplateSyncDisabled()) return false;
  const payload = mergeTemplate(template);
  const content = JSON.stringify(payload);
  const blob = new Blob([content], { type: "application/json" });
  const file = new File([blob], "certificate-template.json", {
    type: "application/json",
  });
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(CERTIFICATE_TEMPLATE_STORAGE_PATH, file, { upsert: true });
  if (error) {
    if (isStoragePermissionError(error)) {
      setCertificateTemplateSyncDisabled(true);
      return false;
    }
    throw error;
  }
  setCertificateTemplateSyncDisabled(false);
  return true;
};

const saveCertificateTemplateMapToStorage = async (templateMap) => {
  if (getCertificateTemplateSyncDisabled()) return false;
  const payload = mergeTemplateMap(templateMap);
  const content = JSON.stringify(payload);
  const blob = new Blob([content], { type: "application/json" });
  const file = new File([blob], "certificate-template-by-training.json", {
    type: "application/json",
  });
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(CERTIFICATE_TEMPLATE_BY_TRAINING_STORAGE_PATH, file, {
      upsert: true,
    });
  if (error) {
    if (isStoragePermissionError(error)) {
      setCertificateTemplateSyncDisabled(true);
      return false;
    }
    throw error;
  }
  setCertificateTemplateSyncDisabled(false);
  return true;
};

const mergeTemplateMapsByFreshness = (localMap, remoteMap) => {
  const local = mergeTemplateMap(localMap);
  const remote = mergeTemplateMap(remoteMap);
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const merged = {};
  keys.forEach((key) => {
    const { template } = pickBestTemplate(local[key], remote[key]);
    if (!template) return;
    merged[key] = mergeTemplate(template);
  });
  return merged;
};

const resolveGlobalCertificateTemplate = async () => {
  const local = loadCertificateTemplate();
  const remote = await loadCertificateTemplateFromStorage();
  const { template, source } = pickBestTemplate(local, remote);
  if (source === "remote") {
    saveCertificateTemplate(template);
    return template;
  }
  if (!remote || template !== remote) {
    try {
      await saveCertificateTemplateToStorage(template);
    } catch (error) {
      // Falha ao sincronizar não deve impedir o uso do modelo local.
    }
  }
  return template;
};

const resolveCertificateTemplateMap = async () => {
  const localMap = loadCertificateTemplateMap();
  const remoteMap = await loadCertificateTemplateMapFromStorage();

  if (!remoteMap) {
    if (Object.keys(localMap).length > 0) {
      try {
        await saveCertificateTemplateMapToStorage(localMap);
      } catch (error) {
        // Falha ao sincronizar não deve impedir uso local.
      }
    }
    return localMap;
  }

  const mergedMap = mergeTemplateMapsByFreshness(localMap, remoteMap);
  saveCertificateTemplateMap(mergedMap);

  if (stableStringifyMap(mergedMap) !== stableStringifyMap(remoteMap)) {
    try {
      await saveCertificateTemplateMapToStorage(mergedMap);
    } catch (error) {
      // Falha ao sincronizar não deve impedir uso local.
    }
  }

  return mergedMap;
};

export const saveCertificateTemplateForTraining = async (
  trainingId,
  template
) => {
  const normalizedIds = normalizeTrainingTemplateIds(trainingId);
  if (!normalizedIds.length) {
    throw new Error("Treinamento inválido para salvar modelo.");
  }

  const payload = mergeTemplate(template);
  const localMap = loadCertificateTemplateMap();
  const nextMap = { ...localMap };
  normalizedIds.forEach((id) => {
    nextMap[id] = payload;
  });
  saveCertificateTemplateMap(nextMap);

  try {
    const remoteMap = await loadCertificateTemplateMapFromStorage();
    const mergedMap = mergeTemplateMapsByFreshness(nextMap, remoteMap || {});
    normalizedIds.forEach((id) => {
      mergedMap[id] = payload;
    });
    saveCertificateTemplateMap(mergedMap);
    await saveCertificateTemplateMapToStorage(mergedMap);
  } catch (error) {
    throw error;
  }

  return payload;
};

export const resetCertificateTemplateForTraining = async (trainingId) => {
  const normalizedIds = normalizeTrainingTemplateIds(trainingId);
  if (!normalizedIds.length) {
    return loadCertificateTemplate();
  }

  const localMap = loadCertificateTemplateMap();
  const nextMap = { ...localMap };
  normalizedIds.forEach((id) => {
    delete nextMap[id];
  });
  saveCertificateTemplateMap(nextMap);

  try {
    const remoteMap = await loadCertificateTemplateMapFromStorage();
    const mergedMap = mergeTemplateMapsByFreshness(nextMap, remoteMap || {});
    normalizedIds.forEach((id) => {
      delete mergedMap[id];
    });
    saveCertificateTemplateMap(mergedMap);
    await saveCertificateTemplateMapToStorage(mergedMap);
  } catch (error) {
    throw error;
  }

  return loadCertificateTemplate();
};

export const resolveCertificateTemplate = async (trainingScope = null) => {
  const globalTemplate = await resolveGlobalCertificateTemplate();
  const normalizedIds = normalizeTrainingTemplateIds(trainingScope);
  if (!normalizedIds.length) {
    return globalTemplate;
  }

  const templateMap = await resolveCertificateTemplateMap();
  const scopedTemplate = normalizedIds
    .map((id) => templateMap[id])
    .find(Boolean);
  if (!scopedTemplate) {
    return globalTemplate;
  }

  return mergeTemplate(scopedTemplate);
};

export const resetCertificateTemplate = () => {
  if (typeof window === "undefined") return DEFAULT_CERTIFICATE_TEMPLATE;
  window.localStorage.setItem(
    CERTIFICATE_TEMPLATE_KEY,
    JSON.stringify(DEFAULT_CERTIFICATE_TEMPLATE)
  );
  return DEFAULT_CERTIFICATE_TEMPLATE;
};
