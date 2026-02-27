import { supabase } from "@/api/supabaseClient";

const SHARED_CONFIG_TRAINING_TITLE = "__APP_SHARED_CONFIG__";

const toSafeConfigKey = (value) => String(value || "").trim();

export const loadSharedConfigJson = async (configKey) => {
  const safeKey = toSafeConfigKey(configKey);
  if (!safeKey) return null;

  const { data, error } = await supabase
    .from("training_materials")
    .select("id, description, created_at")
    .is("training_id", null)
    .eq("name", safeKey)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.description) return null;
  try {
    return JSON.parse(String(row.description));
  } catch {
    return null;
  }
};

export const saveSharedConfigJson = async (configKey, value) => {
  const safeKey = toSafeConfigKey(configKey);
  if (!safeKey) {
    throw new Error("Chave de configuração inválida.");
  }

  const { data: userData } = await supabase.auth.getUser();
  const userEmail = String(userData?.user?.email || "").trim();
  const payload = {
    training_id: null,
    training_title: SHARED_CONFIG_TRAINING_TITLE,
    name: safeKey,
    description: JSON.stringify(value ?? {}),
    file_type: "application/json",
    uploaded_by: userEmail || "sistema",
  };

  const { error } = await supabase.from("training_materials").insert(payload);
  if (error) throw error;
  return value;
};
