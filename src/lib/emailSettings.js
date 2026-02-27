import { supabase } from "@/api/supabaseClient";
import { loadSharedConfigJson, saveSharedConfigJson } from "@/lib/sharedConfigStore";

const STORAGE_BUCKET =
  import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "uploads";
const EMAIL_SETTINGS_FOLDER = "certificates";
const EMAIL_SETTINGS_STORAGE_PATH = `${EMAIL_SETTINGS_FOLDER}/email-settings.json`;
const EMAIL_SETTINGS_FILE_PREFIX = "email-settings-";
const SHARED_CONFIG_KEY_EMAIL_SETTINGS = "__config__:email-settings";

export const DEFAULT_EMAIL_SETTINGS = {
  fromEmail: "",
  fromName: "",
  webhookUrl: "",
};

const normalizeEmailSettings = (value) => ({
  fromEmail: String(value?.fromEmail || "").trim(),
  fromName: String(value?.fromName || "").trim(),
  webhookUrl: String(value?.webhookUrl || "").trim(),
});

const extractStorageErrorText = (error) =>
  String(
    error?.message || error?.error_description || error?.details || error?.hint || ""
  )
    .trim()
    .toLowerCase();

const isStorageObjectNotFoundError = (error) => {
  const status = Number(error?.status || 0);
  const message = extractStorageErrorText(error);
  return (
    status === 404 ||
    message.includes("not found") ||
    message.includes("object not found")
  );
};

export const isEmailSettingsStoragePermissionError = (error) => {
  const status = Number(error?.status || 0);
  const code = String(error?.code || "").toLowerCase();
  const message = extractStorageErrorText(error);
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

const getVersionTimestampFromFileName = (name, prefix) => {
  const normalizedName = String(name || "").trim();
  if (!normalizedName.startsWith(prefix) || !normalizedName.endsWith(".json")) {
    return 0;
  }
  const rawTimestamp = normalizedName.slice(prefix.length, -5);
  const parsed = Number(rawTimestamp);
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveLatestEmailSettingsPath = async () => {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(
    EMAIL_SETTINGS_FOLDER,
    {
      limit: 1000,
      sortBy: { column: "name", order: "desc" },
    }
  );
  if (error) {
    if (isEmailSettingsStoragePermissionError(error)) return null;
    return EMAIL_SETTINGS_STORAGE_PATH;
  }

  const candidates = (data || [])
    .map((item) => String(item?.name || "").trim())
    .filter(
      (name) =>
        name.startsWith(EMAIL_SETTINGS_FILE_PREFIX) && name.endsWith(".json")
    );
  if (candidates.length === 0) {
    return EMAIL_SETTINGS_STORAGE_PATH;
  }

  candidates.sort((a, b) => {
    const timestampA = getVersionTimestampFromFileName(
      a,
      EMAIL_SETTINGS_FILE_PREFIX
    );
    const timestampB = getVersionTimestampFromFileName(
      b,
      EMAIL_SETTINGS_FILE_PREFIX
    );
    if (timestampA !== timestampB) return timestampB - timestampA;
    return b.localeCompare(a);
  });

  return `${EMAIL_SETTINGS_FOLDER}/${candidates[0]}`;
};

const loadEmailSettingsFromSharedStore = async () => {
  try {
    const parsed = await loadSharedConfigJson(SHARED_CONFIG_KEY_EMAIL_SETTINGS);
    if (!parsed || typeof parsed !== "object") return null;
    return normalizeEmailSettings(parsed);
  } catch {
    return null;
  }
};

export const loadEmailSettingsFromStorage = async () => {
  const sharedSettings = await loadEmailSettingsFromSharedStore();
  if (sharedSettings) return sharedSettings;

  const latestPath = await resolveLatestEmailSettingsPath();
  if (!latestPath) return { ...DEFAULT_EMAIL_SETTINGS };
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(latestPath);

  if (error || !data) {
    if (isEmailSettingsStoragePermissionError(error)) {
      return { ...DEFAULT_EMAIL_SETTINGS };
    }
    if (isStorageObjectNotFoundError(error)) {
      return { ...DEFAULT_EMAIL_SETTINGS };
    }
    throw error;
  }

  const content = await data.text();
  if (!content) return { ...DEFAULT_EMAIL_SETTINGS };

  try {
    const parsed = JSON.parse(content);
    return normalizeEmailSettings(parsed);
  } catch {
    return { ...DEFAULT_EMAIL_SETTINGS };
  }
};

export const saveEmailSettingsToStorage = async (value) => {
  const payload = normalizeEmailSettings(value);
  await saveSharedConfigJson(SHARED_CONFIG_KEY_EMAIL_SETTINGS, payload);

  const content = JSON.stringify(payload);
  const blob = new Blob([content], { type: "application/json" });
  const fileName = `${EMAIL_SETTINGS_FILE_PREFIX}${Date.now()}.json`;
  const file = new File([blob], fileName, {
    type: "application/json",
  });
  const path = `${EMAIL_SETTINGS_FOLDER}/${fileName}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: false });
  if (error && !isEmailSettingsStoragePermissionError(error)) throw error;

  return payload;
};

export const clearEmailSettingsInStorage = async () =>
  saveEmailSettingsToStorage(DEFAULT_EMAIL_SETTINGS);
