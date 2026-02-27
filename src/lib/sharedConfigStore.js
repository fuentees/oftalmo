import { supabase } from "@/api/supabaseClient";

const SHARED_CONFIG_TABLE = "shared_app_config";
const SHARED_CONFIG_FALLBACK_TABLE = "training_materials";
const SHARED_CONFIG_VERSION_SEPARATOR = "::";

const toSafeConfigKey = (value) => String(value || "").trim();
const extractDbErrorText = (error) =>
  String(error?.message || error?.details || error?.hint || "")
    .trim()
    .toLowerCase();
const isMissingSharedConfigTableError = (error) => {
  const code = String(error?.code || "").toLowerCase();
  const message = extractDbErrorText(error);
  return (
    code === "42p01" ||
    message.includes("relation") && message.includes("shared_app_config")
  );
};
const isDbPolicyError = (error) => {
  const code = String(error?.code || "").toLowerCase();
  const message = extractDbErrorText(error);
  return (
    code === "42501" ||
    message.includes("row-level security") ||
    message.includes("violates row-level security policy") ||
    message.includes("permission denied")
  );
};

const parseJsonValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
};

const loadSharedConfigFromFallback = async (configKey) => {
  const { data, error } = await supabase
    .from(SHARED_CONFIG_FALLBACK_TABLE)
    .select("description, created_at")
    .eq("name", configKey)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : null;
  return parseJsonValue(row?.description);
};

const saveSharedConfigToFallback = async ({ configKey, value, userEmail }) => {
  const payload = {
    training_id: null,
    training_title: "__APP_SHARED_CONFIG__",
    name: configKey,
    description: JSON.stringify(value ?? {}),
    file_type: "application/json",
    uploaded_by: userEmail || null,
  };
  const { error } = await supabase
    .from(SHARED_CONFIG_FALLBACK_TABLE)
    .insert(payload);
  if (error) throw error;
};

export const loadSharedConfigJson = async (configKey) => {
  const safeKey = toSafeConfigKey(configKey);
  if (!safeKey) return null;

  const versionPrefix = `${safeKey}${SHARED_CONFIG_VERSION_SEPARATOR}`;
  const { data, error } = await supabase
    .from(SHARED_CONFIG_TABLE)
    .select("config_key, config_value, updated_at")
    .like("config_key", `${versionPrefix}%`)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) {
    if (isMissingSharedConfigTableError(error) || isDbPolicyError(error)) {
      return loadSharedConfigFromFallback(safeKey);
    }
    throw error;
  }

  let row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    // Compatibilidade com chave legada sem versionamento.
    const { data: legacyData, error: legacyError } = await supabase
      .from(SHARED_CONFIG_TABLE)
      .select("config_key, config_value, updated_at")
      .eq("config_key", safeKey)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (legacyError) {
      if (isMissingSharedConfigTableError(legacyError)) {
        return null;
      }
      throw legacyError;
    }
    row = Array.isArray(legacyData) ? legacyData[0] : null;
  }
  const parsedCurrent = parseJsonValue(row?.config_value);
  if (parsedCurrent) return parsedCurrent;
  return loadSharedConfigFromFallback(safeKey);
};

export const saveSharedConfigJson = async (configKey, value) => {
  const safeKey = toSafeConfigKey(configKey);
  if (!safeKey) {
    throw new Error("Chave de configuração inválida.");
  }

  const { data: userData } = await supabase.auth.getUser();
  const userEmail = String(userData?.user?.email || "").trim();
  const payload = {
    config_key: `${safeKey}${SHARED_CONFIG_VERSION_SEPARATOR}${Date.now()}`,
    config_value: value ?? {},
    updated_at: new Date().toISOString(),
    updated_by: userEmail || null,
  };

  const { error } = await supabase
    .from(SHARED_CONFIG_TABLE)
    .insert(payload);
  if (error) {
    if (isMissingSharedConfigTableError(error) || isDbPolicyError(error)) {
      try {
        await saveSharedConfigToFallback({
          configKey: safeKey,
          value,
          userEmail,
        });
        return value;
      } catch (fallbackError) {
        throw new Error(
          `Falha ao salvar configuração compartilhada (${safeKey}). ${String(
            fallbackError?.message || fallbackError || "Erro de banco"
          )}`
        );
      }
    }
    throw new Error(
      `Falha ao salvar configuração compartilhada (${safeKey}). ${String(
        error?.message || error || "Erro de banco"
      )}`
    );
  }
  return value;
};
