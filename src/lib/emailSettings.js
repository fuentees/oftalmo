import { supabase } from "@/api/supabaseClient";

const STORAGE_BUCKET =
  import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "uploads";
const EMAIL_SETTINGS_STORAGE_PATH = "certificates/email-settings.json";

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

export const loadEmailSettingsFromStorage = async () => {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(EMAIL_SETTINGS_STORAGE_PATH);

  if (error || !data) {
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
  const content = JSON.stringify(payload);
  const blob = new Blob([content], { type: "application/json" });
  const file = new File([blob], "email-settings.json", {
    type: "application/json",
  });

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(EMAIL_SETTINGS_STORAGE_PATH, file, { upsert: true });
  if (error) throw error;

  return payload;
};

export const clearEmailSettingsInStorage = async () =>
  saveEmailSettingsToStorage(DEFAULT_EMAIL_SETTINGS);
