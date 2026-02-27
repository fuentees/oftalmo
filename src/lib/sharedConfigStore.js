import { supabase } from "@/api/supabaseClient";

const SHARED_CONFIG_TRAINING_TITLE = "__APP_SHARED_CONFIG__";

const toSafeConfigKey = (value) => String(value || "").trim();
const extractDbErrorText = (error) =>
  String(error?.message || error?.details || error?.hint || "")
    .trim()
    .toLowerCase();
const isDbPolicyError = (error) => {
  const status = Number(error?.status || 0);
  const code = String(error?.code || "").toLowerCase();
  const message = extractDbErrorText(error);
  return (
    status === 401 ||
    status === 403 ||
    code === "42501" ||
    message.includes("row-level security") ||
    message.includes("violates row-level security policy") ||
    message.includes("permission denied")
  );
};
const resolveFallbackTrainingContext = async () => {
  const { data, error } = await supabase
    .from("trainings")
    .select("id, title")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.id) return null;
  return {
    id: String(row.id),
    title: String(row.title || SHARED_CONFIG_TRAINING_TITLE),
  };
};
const buildSharedConfigPayload = ({ configKey, value, userEmail, trainingContext }) => ({
  training_id: trainingContext?.id || null,
  training_title: trainingContext?.title || SHARED_CONFIG_TRAINING_TITLE,
  name: configKey,
  description: JSON.stringify(value ?? {}),
  file_type: "application/json",
  uploaded_by: userEmail || "sistema",
});

export const loadSharedConfigJson = async (configKey) => {
  const safeKey = toSafeConfigKey(configKey);
  if (!safeKey) return null;

  const { data, error } = await supabase
    .from("training_materials")
    .select("id, description, created_at")
    .eq("name", safeKey)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  for (const row of rows) {
    if (!row?.description) continue;
    try {
      return JSON.parse(String(row.description));
    } catch {
      // tenta próximo registro
    }
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
  const payload = buildSharedConfigPayload({
    configKey: safeKey,
    value,
    userEmail,
    trainingContext: null,
  });

  const { error } = await supabase.from("training_materials").insert(payload);
  if (error) {
    if (!isDbPolicyError(error)) throw error;
    const trainingContext = await resolveFallbackTrainingContext();
    if (!trainingContext?.id) throw error;
    const fallbackPayload = buildSharedConfigPayload({
      configKey: safeKey,
      value,
      userEmail,
      trainingContext,
    });
    const { error: fallbackError } = await supabase
      .from("training_materials")
      .insert(fallbackPayload);
    if (fallbackError) throw fallbackError;
  }
  return value;
};
