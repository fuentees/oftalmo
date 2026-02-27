import { supabase } from "@/api/supabaseClient";
import { loadSharedConfigJson, saveSharedConfigJson } from "@/lib/sharedConfigStore";

export const CERTIFICATE_TEMPLATE_KEY = "certificateTemplate";
export const CERTIFICATE_TEMPLATE_BY_TRAINING_KEY =
  "certificateTemplateByTraining";
const STORAGE_BUCKET =
  import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "uploads";
const CERTIFICATE_TEMPLATE_FOLDER = "certificates";
const CERTIFICATE_TEMPLATE_STORAGE_PATH = `${CERTIFICATE_TEMPLATE_FOLDER}/certificate-template.json`;
const CERTIFICATE_TEMPLATE_BY_TRAINING_STORAGE_PATH =
  `${CERTIFICATE_TEMPLATE_FOLDER}/certificate-template-by-training.json`;
const CERTIFICATE_TEMPLATE_FILE_PREFIX = "certificate-template-";
const CERTIFICATE_TEMPLATE_MAP_FILE_PREFIX = "certificate-template-by-training-";
const SHARED_CONFIG_KEY_TEMPLATE = "__config__:certificate-template";
const SHARED_CONFIG_KEY_TEMPLATE_MAP =
  "__config__:certificate-template-by-training";

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
    bodyMaxWordSpacing: 2,
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

const isStorageObjectNotFoundError = (error) => {
  const status = Number(error?.status || 0);
  const message = extractStorageErrorText(error);
  return (
    status === 404 ||
    message.includes("not found") ||
    message.includes("object not found")
  );
};

const getVersionTimestampFromFileName = (name, prefix) => {
  const normalizedName = String(name || "").trim();
  if (!normalizedName.startsWith(prefix) || !normalizedName.endsWith(".json")) {
    return 0;
  }
  const rawTimestamp = normalizedName.slice(prefix.length, -5);
  const parsed = Number(rawTimestamp);
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveLatestVersionedPath = async ({ filePrefix, legacyPath }) => {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(
    CERTIFICATE_TEMPLATE_FOLDER,
    {
      limit: 1000,
      sortBy: { column: "name", order: "desc" },
    }
  );
  if (error) {
    if (isStoragePermissionError(error)) throw error;
    return legacyPath || null;
  }

  const versionedNames = (data || [])
    .map((item) => String(item?.name || "").trim())
    .filter(
      (name) => name.startsWith(filePrefix) && name.endsWith(".json")
    );
  if (versionedNames.length === 0) {
    return legacyPath || null;
  }

  versionedNames.sort((a, b) => {
    const timestampA = getVersionTimestampFromFileName(a, filePrefix);
    const timestampB = getVersionTimestampFromFileName(b, filePrefix);
    if (timestampA !== timestampB) return timestampB - timestampA;
    return b.localeCompare(a);
  });

  return `${CERTIFICATE_TEMPLATE_FOLDER}/${versionedNames[0]}`;
};

const getCertificateTemplateSyncDisabled = () => {
  return false;
};

const setCertificateTemplateSyncDisabled = (disabled) => {
  return disabled;
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

const loadGlobalTemplateFromSharedStore = async () => {
  try {
    const parsed = await loadSharedConfigJson(SHARED_CONFIG_KEY_TEMPLATE);
    if (!parsed || typeof parsed !== "object") return null;
    return mergeTemplate(parsed);
  } catch {
    return null;
  }
};

const loadTemplateMapFromSharedStore = async () => {
  try {
    const parsed = await loadSharedConfigJson(SHARED_CONFIG_KEY_TEMPLATE_MAP);
    if (!parsed || typeof parsed !== "object") return null;
    return mergeTemplateMap(parsed);
  } catch {
    return null;
  }
};

const saveGlobalTemplateToSharedStore = async (template) => {
  const payload = mergeTemplate(template);
  await saveSharedConfigJson(SHARED_CONFIG_KEY_TEMPLATE, payload);
  return payload;
};

const saveTemplateMapToSharedStore = async (templateMap) => {
  const payload = mergeTemplateMap(templateMap);
  await saveSharedConfigJson(SHARED_CONFIG_KEY_TEMPLATE_MAP, payload);
  return payload;
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
  return DEFAULT_CERTIFICATE_TEMPLATE;
};

const loadCertificateTemplateMap = () => {
  return {};
};

export const saveCertificateTemplate = (template) => {
  return mergeTemplate(template);
};

const saveCertificateTemplateMap = (templateMap) => {
  return mergeTemplateMap(templateMap);
};

export const loadCertificateTemplateFromStorage = async () => {
  try {
    const latestPath = await resolveLatestVersionedPath({
      filePrefix: CERTIFICATE_TEMPLATE_FILE_PREFIX,
      legacyPath: CERTIFICATE_TEMPLATE_STORAGE_PATH,
    });
    if (!latestPath) return null;

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(latestPath);
    if (error || !data) {
      if (isStoragePermissionError(error)) throw error;
      if (isStorageObjectNotFoundError(error)) return null;
      return null;
    }

    const text = await data.text();
    if (!text) return null;
    const parsed = JSON.parse(text);
    return mergeTemplate(parsed);
  } catch (error) {
    if (isStoragePermissionError(error)) {
      throw error;
    }
    return null;
  }
};

const loadCertificateTemplateMapFromStorage = async () => {
  try {
    const latestPath = await resolveLatestVersionedPath({
      filePrefix: CERTIFICATE_TEMPLATE_MAP_FILE_PREFIX,
      legacyPath: CERTIFICATE_TEMPLATE_BY_TRAINING_STORAGE_PATH,
    });
    if (!latestPath) return null;

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(latestPath);
    if (error || !data) {
      if (isStoragePermissionError(error)) throw error;
      if (isStorageObjectNotFoundError(error)) return null;
      return null;
    }

    const text = await data.text();
    if (!text) return null;
    const parsed = JSON.parse(text);
    return mergeTemplateMap(parsed);
  } catch (error) {
    if (isStoragePermissionError(error)) {
      throw error;
    }
    return null;
  }
};

export const saveCertificateTemplateToStorage = async (template) => {
  const payload = mergeTemplate(template);
  await saveGlobalTemplateToSharedStore(payload);

  const content = JSON.stringify(payload);
  const blob = new Blob([content], { type: "application/json" });
  const fileName = `${CERTIFICATE_TEMPLATE_FILE_PREFIX}${Date.now()}.json`;
  const file = new File([blob], fileName, {
    type: "application/json",
  });
  const path = `${CERTIFICATE_TEMPLATE_FOLDER}/${fileName}`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: false });
  if (error) {
    if (isStoragePermissionError(error)) {
      return true;
    }
    throw error;
  }
  return true;
};

const saveCertificateTemplateMapToStorage = async (templateMap) => {
  const payload = mergeTemplateMap(templateMap);
  await saveTemplateMapToSharedStore(payload);

  const content = JSON.stringify(payload);
  const blob = new Blob([content], { type: "application/json" });
  const fileName = `${CERTIFICATE_TEMPLATE_MAP_FILE_PREFIX}${Date.now()}.json`;
  const file = new File([blob], fileName, {
    type: "application/json",
  });
  const path = `${CERTIFICATE_TEMPLATE_FOLDER}/${fileName}`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: false });
  if (error) {
    if (isStoragePermissionError(error)) {
      return true;
    }
    throw error;
  }
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
  const [shared, remote] = await Promise.all([
    loadGlobalTemplateFromSharedStore(),
    loadCertificateTemplateFromStorage(),
  ]);
  if (shared) return shared;
  if (remote) return remote;
  return DEFAULT_CERTIFICATE_TEMPLATE;
};

const resolveCertificateTemplateMap = async () => {
  const [sharedMap, remoteMap] = await Promise.all([
    loadTemplateMapFromSharedStore(),
    loadCertificateTemplateMapFromStorage(),
  ]);
  if (sharedMap && remoteMap) {
    return mergeTemplateMapsByFreshness(sharedMap, remoteMap);
  }
  if (sharedMap) return sharedMap;
  if (remoteMap) return remoteMap;
  return {};
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
  const nextMap = { ...(await resolveCertificateTemplateMap()) };
  normalizedIds.forEach((id) => {
    nextMap[id] = payload;
  });
  await saveCertificateTemplateMapToStorage(nextMap);

  return payload;
};

export const resetCertificateTemplateForTraining = async (trainingId) => {
  const normalizedIds = normalizeTrainingTemplateIds(trainingId);
  if (!normalizedIds.length) {
    return resolveCertificateTemplate();
  }

  const nextMap = { ...(await resolveCertificateTemplateMap()) };
  normalizedIds.forEach((id) => {
    delete nextMap[id];
  });
  await saveCertificateTemplateMapToStorage(nextMap);
  return resolveCertificateTemplate();
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
  return DEFAULT_CERTIFICATE_TEMPLATE;
};
