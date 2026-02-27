import { supabase } from "@/api/supabaseClient";

const SHARED_CONFIG_TABLE = "shared_app_config";
const SHARED_CONFIG_VERSION_SEPARATOR = "::";

const toSafeConfigKey = (value) => String(value || "").trim();
const isMissingSharedConfigTableError = (error) => {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "")
    .trim()
    .toLowerCase();
  return (
    code === "42p01" ||
    message.includes("relation") && message.includes("shared_app_config")
  );
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
    if (isMissingSharedConfigTableError(error)) {
      return null;
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
  if (!row || row.config_value === undefined || row.config_value === null) {
    return null;
  }
  if (typeof row.config_value === "string") {
    try {
      return JSON.parse(row.config_value);
    } catch {
      return null;
    }
  }
  if (typeof row.config_value === "object") {
    return row.config_value;
  }
  return null;
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
    if (isMissingSharedConfigTableError(error)) {
      throw new Error(
        "Configuração compartilhada não inicializada. Execute o script supabase/create_shared_config_rls_policies.sql no Supabase."
      );
    }
    throw new Error(
      `Falha ao salvar configuração compartilhada (${safeKey}). ${String(
        error?.message || error || "Erro de banco"
      )}`
    );
  }
  return value;
};
