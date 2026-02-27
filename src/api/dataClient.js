import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "@/api/supabaseClient";
import { resolveUserRole } from "@/lib/accessControl";
import { loadEmailSettingsFromStorage } from "@/lib/emailSettings";

const STORAGE_BUCKET =
  import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "uploads";
const EMAIL_FUNCTION_NAME =
  import.meta.env.VITE_SUPABASE_EMAIL_FUNCTION || "send-email";
const USER_ADMIN_FUNCTION_FALLBACK = "user-admin";
const USER_ADMIN_FUNCTION_NAME =
  import.meta.env.VITE_SUPABASE_USER_ADMIN_FUNCTION ||
  USER_ADMIN_FUNCTION_FALLBACK;
const USER_ADMIN_FUNCTION_CANDIDATES = Array.from(
  new Set(
    [
      String(USER_ADMIN_FUNCTION_NAME || "").trim(),
      USER_ADMIN_FUNCTION_FALLBACK,
    ].filter(Boolean)
  )
);
const USER_ADMIN_FUNCTION_LABEL = USER_ADMIN_FUNCTION_CANDIDATES.map(
  (name) => `"${name}"`
).join(" ou ");
const EMAIL_WEBHOOK_URL = import.meta.env.VITE_EMAIL_WEBHOOK_URL;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const EMAIL_SETTINGS_CACHE_TTL_MS = 60 * 1000;
let sharedEmailSettingsCache = null;
let sharedEmailSettingsCacheTime = 0;

const toSnakeCase = (value) =>
  value.replace(/([A-Z])/g, "_$1").toLowerCase();

const normalizeTrainingDates = (dates) => {
  if (!dates) return [];
  let parsed = dates;

  if (typeof dates === "string") {
    try {
      parsed = JSON.parse(dates);
    } catch (error) {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") return { date: item };
      if (typeof item === "object" && item.date) return { ...item };
      return null;
    })
    .filter(Boolean);
};

const normalizeTrainingRecord = (record) => {
  if (!record) return record;
  const normalizedDates = normalizeTrainingDates(record.dates);
  return {
    ...record,
    dates: normalizedDates,
  };
};

const normalizeEntityData = (table, payload) => {
  if (!payload || table !== "trainings") return payload;
  if (Array.isArray(payload)) {
    return payload.map(normalizeTrainingRecord);
  }
  return normalizeTrainingRecord(payload);
};

export const mapSupabaseUser = (user) => {
  if (!user) return null;
  const metadata = user.user_metadata || {};
  const appMetadata = user.app_metadata || {};
  const role = resolveUserRole({
    email: user.email,
    userMetadata: metadata,
    appMetadata,
  });
  return {
    id: user.id,
    email: user.email,
    full_name: metadata.full_name || metadata.name || user.email,
    ...metadata,
    role,
  };
};

const ENTITY_TABLES = {
  Training: "trainings",
  Professional: "professionals",
  TrainingParticipant: "training_participants",
  Event: "events",
  Material: "materials",
  StockMovement: "stock_movements",
  TrainingMaterial: "training_materials",
  TrainingFeedback: "training_feedback",
  TrainingFeedbackQuestion: "training_feedback_questions",
  AttendanceLink: "attendance_links",
  EnrollmentField: "enrollment_fields",
  AuditLog: "audit_logs",
  MaterialRequest: "material_requests",
  CommunicationMessage: "communication_messages",
  TracomaExamAnswerKey: "tracoma_exam_answer_keys",
  TracomaExamResult: "tracoma_exam_results",
};

const applyOrder = (query, order) => {
  if (!order) return query;
  const descending = order.startsWith("-");
  const column = descending ? order.slice(1) : order;
  if (!column) return query;
  return query.order(column, { ascending: !descending });
};

const SUPABASE_PAGE_SIZE = 1000;

const buildBaseSelectQuery = (table, filters, order) => {
  let query = supabase.from(table).select("*");
  if (filters) query = query.match(filters);
  if (order) {
    query = applyOrder(query, order);
  } else {
    // Mantém paginação estável quando não há ordenação explícita.
    query = query.order("id", { ascending: true });
  }
  return query;
};

const fetchAllRows = async (table, filters, order) => {
  const allRows = [];
  let from = 0;

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const query = buildBaseSelectQuery(table, filters, order).range(from, to);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    allRows.push(...rows);
    if (rows.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return allRows;
};

const list = async (table, order, limit) => {
  if (!limit) {
    const rows = await fetchAllRows(table, null, order);
    return normalizeEntityData(table, rows);
  }

  let query = buildBaseSelectQuery(table, null, order);
  query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return normalizeEntityData(table, data || []);
};

const filter = async (table, filters, order, limit) => {
  if (!limit) {
    const rows = await fetchAllRows(table, filters, order);
    return normalizeEntityData(table, rows);
  }

  let query = buildBaseSelectQuery(table, filters, order);
  query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return normalizeEntityData(table, data || []);
};

const create = async (table, payload) => {
  const { data, error } = await supabase
    .from(table)
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return normalizeEntityData(table, data);
};

const bulkCreate = async (table, payload) => {
  const { data, error } = await supabase.from(table).insert(payload).select();
  if (error) throw error;
  return normalizeEntityData(table, data || []);
};

const update = async (table, id, payload) => {
  const { data, error } = await supabase
    .from(table)
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return normalizeEntityData(table, data);
};

const remove = async (table, id) => {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) {
    throw new Error("Registro inválido para exclusão.");
  }

  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq("id", normalizedId)
    .select("id");
  if (error) throw error;
  if (Array.isArray(data) && data.length > 0) {
    return { id: normalizedId, deleted: true };
  }

  const { data: existing, error: checkError } = await supabase
    .from(table)
    .select("id")
    .eq("id", normalizedId)
    .limit(1);
  if (checkError) throw checkError;
  if ((existing || []).length > 0) {
    throw new Error(
      "Não foi possível excluir o registro. Verifique suas permissões."
    );
  }

  // Registro já não existe mais.
  return { id: normalizedId, deleted: false };
};

const createEntityApi = (entityName) => {
  const table = ENTITY_TABLES[entityName] || toSnakeCase(entityName);
  return {
    list: (order, limit) => list(table, order, limit),
    filter: (filters, order, limit) => filter(table, filters, order, limit),
    create: (payload) => create(table, payload),
    bulkCreate: (payload) => bulkCreate(table, payload),
    update: (id, payload) => update(table, id, payload),
    delete: (id) => remove(table, id),
  };
};

const entities = new Proxy(
  {},
  {
    get: (_, entityName) => {
      if (typeof entityName !== "string") return undefined;
      return createEntityApi(entityName);
    },
  }
);

const normalizeValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "true") return true;
  if (trimmed.toLowerCase() === "false") return false;
  return trimmed;
};

const normalizeRows = (rows) =>
  rows
    .map((row) =>
      Object.entries(row).reduce((acc, [key, value]) => {
        const normalizedKey = key?.trim();
        if (!normalizedKey) return acc;
        acc[normalizedKey] = normalizeValue(value);
        return acc;
      }, {})
    )
    .filter((row) => Object.keys(row).length > 0);

const normalizeGveText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeMunicipalityGveRows = (rows) => {
  const unique = [];
  const seen = new Set();
  (rows || []).forEach((item) => {
    const id = String(item?.id || "").trim();
    const municipio = String(item?.municipio || "").trim();
    const gve = String(item?.gve || "").trim();
    if (!municipio || !gve) return;
    const key = normalizeGveText(municipio);
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(id ? { id, municipio, gve } : { municipio, gve });
  });
  return unique.sort((a, b) =>
    a.municipio.localeCompare(b.municipio, "pt-BR", { sensitivity: "base" })
  );
};

const parseCsv = (text) =>
  new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => resolve(normalizeRows(result.data || [])),
      error: (error) => reject(error),
    });
  });

const parseXlsx = (buffer) => {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return normalizeRows(rows || []);
};

const ListMunicipalityGveMapping = async () => {
  const { data, error } = await supabase
    .from("municipality_gve_mappings")
    .select("id, municipio, gve")
    .order("municipio", { ascending: true });
  if (error) throw error;
  return normalizeMunicipalityGveRows(data || []);
};

const InsertMunicipalityGveMappingRows = async (rows) => {
  const payload = (rows || []).map((item) => ({
    municipio: item.municipio,
    gve: item.gve,
  }));
  const chunkSize = 500;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    if (!chunk.length) continue;
    const { error } = await supabase
      .from("municipality_gve_mappings")
      .insert(chunk);
    if (error) throw error;
  }
};

const ReplaceMunicipalityGveMapping = async ({ mapping }) => {
  const normalizedRows = normalizeMunicipalityGveRows(mapping || []);
  if (normalizedRows.length === 0) {
    await ClearMunicipalityGveMapping();
    return [];
  }

  await ClearMunicipalityGveMapping();
  await InsertMunicipalityGveMappingRows(normalizedRows);
  return ListMunicipalityGveMapping();
};

const ClearMunicipalityGveMapping = async () => {
  const { error } = await supabase
    .from("municipality_gve_mappings")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
  return { success: true };
};

const DeleteTrainingParticipantsByTraining = async ({ training_id }) => {
  const trainingId = String(training_id || "").trim();
  if (!trainingId) {
    throw new Error("Treinamento não informado para excluir inscritos.");
  }

  const { data, error } = await supabase
    .from("training_participants")
    .delete()
    .eq("training_id", trainingId)
    .select("id");
  if (error) throw error;

  const deletedCount = Array.isArray(data) ? data.length : 0;
  const { count, error: countError } = await supabase
    .from("training_participants")
    .select("*", { count: "exact", head: true })
    .eq("training_id", trainingId);
  if (countError) throw countError;

  const remainingCount = Number(count || 0);
  if (remainingCount > 0 && deletedCount === 0) {
    throw new Error(
      "Não foi possível excluir os inscritos. Verifique as permissões do usuário."
    );
  }

  return { success: true, deleted_count: deletedCount, remaining_count: remainingCount };
};

const getStoragePathFromUrl = (fileUrl) => {
  try {
    const url = new URL(fileUrl);
    const pathname = url.pathname || "";
    const publicMarker = "/storage/v1/object/public/";
    const privateMarker = "/storage/v1/object/";
    let pathPart = "";
    if (pathname.includes(publicMarker)) {
      pathPart = pathname.split(publicMarker)[1] || "";
    } else if (pathname.includes(privateMarker)) {
      pathPart = pathname.split(privateMarker)[1] || "";
    }
    if (!pathPart) return null;
    const [bucket, ...rest] = pathPart.split("/");
    const path = rest.join("/");
    if (!bucket || !path) return null;
    return { bucket, path };
  } catch (error) {
    return null;
  }
};

const getSignedUrlForStorageFile = async (fileUrl) => {
  const storageRef = getStoragePathFromUrl(fileUrl);
  if (!storageRef) return null;
  const { data, error } = await supabase.storage
    .from(storageRef.bucket)
    .createSignedUrl(storageRef.path, 300);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
};

const extractDataFromFileUrl = async (fileUrl) => {
  let response = await fetch(fileUrl);
  if (!response.ok) {
    const signedUrl = await getSignedUrlForStorageFile(fileUrl);
    if (signedUrl) {
      response = await fetch(signedUrl);
    }
  }
  if (!response.ok) {
    throw new Error(
      `Falha ao baixar arquivo importado (status ${response.status}).`
    );
  }
  const contentType = response.headers.get("content-type") || "";
  const lowerUrl = fileUrl.toLowerCase();
  const isCsv =
    lowerUrl.endsWith(".csv") || contentType.includes("text/csv");
  const isExcel =
    lowerUrl.endsWith(".xlsx") ||
    lowerUrl.endsWith(".xls") ||
    contentType.includes("spreadsheet") ||
    contentType.includes("excel");

  if (isCsv) {
    const text = await response.text();
    return parseCsv(text);
  }

  if (isExcel) {
    const buffer = await response.arrayBuffer();
    return parseXlsx(buffer);
  }

  throw new Error("Formato de arquivo não suportado (use CSV ou XLSX).");
};

const UploadFile = async ({ file, bucket = STORAGE_BUCKET }) => {
  if (!file) throw new Error("Arquivo não informado.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `${uid}-${safeName}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: false });
  if (error) throw error;

  const { data: publicData } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path);

  return {
    file_url: publicData.publicUrl,
    path: data.path,
  };
};

const ExtractDataFromUploadedFile = async ({ file_url }) => {
  try {
    const rows = await extractDataFromFileUrl(file_url);
    return {
      status: "success",
      output: { participants: rows },
    };
  } catch (error) {
    return {
      status: "error",
      details: error.message || "Erro ao processar arquivo.",
    };
  }
};

const getUserAdminFunctionError = (error) => {
  const rawMessage = String(error?.message || "").trim();
  const status = Number(error?.status || 0);
  let message = rawMessage;
  if (rawMessage.startsWith("{") && rawMessage.endsWith("}")) {
    try {
      const parsed = JSON.parse(rawMessage);
      const parsedMessage = String(parsed?.error || parsed?.message || "").trim();
      if (parsedMessage) {
        message = parsedMessage;
      }
    } catch (parseError) {
      // mantém a mensagem original quando não for JSON válido
    }
  }
  const lowered = message.toLowerCase();
  const projectRef = (() => {
    try {
      if (typeof SUPABASE_URL !== "string" || !SUPABASE_URL.trim()) return "";
      const host = new URL(SUPABASE_URL.trim()).hostname || "";
      return host.split(".")[0] || "";
    } catch (parseError) {
      return "";
    }
  })();
  const projectHint = projectRef
    ? ` Projeto atual do frontend: "${projectRef}".`
    : "";

  if (status === 401) {
    return "Não foi possível validar sua sessão no serviço de usuários. Atualize a página e tente novamente. Se continuar, entre novamente no sistema.";
  }
  if (status === 403) {
    return "Você não tem permissão para gerenciar usuários.";
  }
  if (status >= 500 && lowered.includes("fetch failed")) {
    return `A função ${USER_ADMIN_FUNCTION_LABEL} respondeu com erro interno (${status}). Verifique os logs da função no Supabase e confirme os secrets SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no mesmo projeto.${projectHint}`;
  }
  if (
    lowered.includes("invalid jwt") ||
    lowered.includes("jwt expired") ||
    lowered.includes("jwt malformed")
  ) {
    return "Não foi possível validar sua sessão no serviço de usuários. Atualize a página e tente novamente. Se continuar, entre novamente no sistema.";
  }
  if (lowered.includes("edge function returned a non-2xx status code")) {
    return `A função ${USER_ADMIN_FUNCTION_LABEL} respondeu com erro de permissão ou configuração.${projectHint} Verifique se a função foi deployada no mesmo projeto e se o usuário atual tem perfil de admin.`;
  }
  if (
    lowered.includes("failed to send a request to the edge function") ||
    lowered.includes("networkerror") ||
    lowered.includes("failed to fetch")
  ) {
    return `Não foi possível conectar à função ${USER_ADMIN_FUNCTION_LABEL}. Verifique no Supabase se a Edge Function foi deployada e se o nome está correto em VITE_SUPABASE_USER_ADMIN_FUNCTION.${projectHint} Se necessário, execute: supabase functions deploy user-admin.`;
  }
  if (lowered.includes("not found") || lowered.includes("404")) {
    return `A função ${USER_ADMIN_FUNCTION_LABEL} não foi encontrada no projeto Supabase.${projectHint} Faça o deploy da função com: supabase functions deploy user-admin.`;
  }
  return message || "Falha ao executar operação de gestão de usuários.";
};

const isAuthRelatedUserAdminError = (error) => {
  const status = Number(error?.status || 0);
  const lowered = String(error?.message || "").toLowerCase();
  if (status === 401) return true;
  return (
    lowered.includes("invalid jwt") ||
    lowered.includes("jwt expired") ||
    lowered.includes("jwt malformed") ||
    lowered.includes("jwt invalid") ||
    lowered.includes("token inválido") ||
    lowered.includes("token invalido") ||
    lowered.includes("unauthorized") ||
    lowered.includes("sessão expirada") ||
    lowered.includes("sessao expirada") ||
    lowered.includes("auth session missing")
  );
};

const extractErrorMessage = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (
      /^<!doctype html/i.test(trimmed) ||
      /^<html[\s>]/i.test(trimmed) ||
      /^<body[\s>]/i.test(trimmed)
    ) {
      return "";
    }
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractErrorMessage(
          parsed?.error ||
            parsed?.message ||
            parsed?.msg ||
            parsed?.detail ||
            parsed?.details
        );
      } catch (parseError) {
        // mantém mensagem original quando não for JSON válido
      }
    }
    return trimmed;
  }
  if (typeof value === "object") {
    return extractErrorMessage(
      value.error ||
        value.message ||
        value.msg ||
        value.detail ||
        value.details
    );
  }
  return String(value || "").trim();
};

const readFunctionErrorContext = async (context) => {
  if (!context) return { status: 0, detail: "" };
  const status = Number(context?.status || 0);

  const tryReadText = async (responseLike) => {
    if (!responseLike || typeof responseLike.text !== "function") return "";
    try {
      const text = await responseLike.text();
      return String(text || "").trim();
    } catch (error) {
      return "";
    }
  };

  let rawText = "";
  if (typeof context?.clone === "function") {
    rawText = await tryReadText(context.clone());
  } else {
    rawText = await tryReadText(context);
  }

  if (!rawText) {
    return { status, detail: "" };
  }

  const parsedMessage = extractErrorMessage(rawText);
  if (parsedMessage) {
    return { status, detail: parsedMessage };
  }
  return { status, detail: "" };
};

const normalizeUserAdminInvokeError = async (error) => {
  const baseMessage = String(error?.message || "").trim();
  const lowered = baseMessage.toLowerCase();
  const isNon2xx =
    lowered.includes("edge function returned a non-2xx status code") ||
    lowered.includes("non-2xx");
  const responseLike = error?.context;
  if (!isNon2xx) {
    return error;
  }

  const fallbackStatus = Number(error?.status || 0);
  const { status, detail } = await readFunctionErrorContext(responseLike);

  if (detail) {
    const normalized = new Error(detail);
    normalized.status = status || fallbackStatus;
    return normalized;
  }

  const parsedBaseMessage = extractErrorMessage(baseMessage);
  if (
    parsedBaseMessage &&
    !parsedBaseMessage.toLowerCase().includes("edge function returned a non-2xx")
  ) {
    const normalized = new Error(parsedBaseMessage);
    normalized.status = status || fallbackStatus;
    return normalized;
  }

  if (status || fallbackStatus) {
    const normalized = new Error(
      `Falha ao comunicar com o serviço de usuários (status ${
        status || fallbackStatus
      }).`
    );
    normalized.status = status || fallbackStatus;
    return normalized;
  }

  return error;
};

const normalizeKnownUserAdminError = (error) => {
  const status = Number(error?.status || 0);
  const normalizedMessage = extractErrorMessage(error?.message || "");
  const lowered = normalizedMessage.toLowerCase();

  if (lowered.includes("edge function returned a non-2xx status code")) {
    const fallback = new Error(
      `Falha ao comunicar com o serviço de usuários${
        status ? ` (status ${status})` : ""
      }.`
    );
    fallback.status = status;
    return fallback;
  }

  if (normalizedMessage && normalizedMessage !== String(error?.message || "").trim()) {
    const wrapped = new Error(normalizedMessage);
    wrapped.status = status;
    return wrapped;
  }

  return error;
};

const invokeUserAdminFunctionFallback = async (
  functionName,
  action,
  payload,
  options = {}
) => {
  const accessToken = await getAccessToken({
    refreshIfMissing: true,
    forceRefresh: Boolean(options?.forceRefresh),
  });
  if (!accessToken) {
    const authError = new Error(
      "Sessão expirada ou inválida. Faça login novamente para continuar."
    );
    authError.status = 401;
    throw authError;
  }
  const data = await invokeSupabaseFunction(
    functionName,
    {
      action,
      ...payload,
    },
    accessToken
  );
  if (data?.error) {
    throw new Error(String(data.error));
  }
  return data || {};
};

const callUserAdminFunction = async (action, payload = {}) => {
  let lastError = null;

  for (let i = 0; i < USER_ADMIN_FUNCTION_CANDIDATES.length; i += 1) {
    const functionName = USER_ADMIN_FUNCTION_CANDIDATES[i];
    try {
      const accessToken = await getAccessToken({ refreshIfMissing: true });
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          action,
          ...payload,
        },
        headers: accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : undefined,
      });
      if (error) {
        throw error;
      }
      if (data?.error) {
        throw new Error(String(data.error));
      }
      return data || {};
    } catch (error) {
      const non2xxNormalizedError = await normalizeUserAdminInvokeError(error);
      const normalizedError = normalizeKnownUserAdminError(non2xxNormalizedError);
      lastError = normalizedError;
      const lowered = String(normalizedError?.message || "").toLowerCase();
      const isNotFound =
        lowered.includes("not found") || lowered.includes("404");
      const hasNextCandidate = i < USER_ADMIN_FUNCTION_CANDIDATES.length - 1;
      const shouldTryFallback =
        shouldFallbackFunctionCall(normalizedError?.message || "") ||
        shouldFallbackByStatus(normalizedError?.status);
      let attemptedForceRefresh = false;

      if (isAuthRelatedUserAdminError(normalizedError)) {
        attemptedForceRefresh = true;
        try {
          return await invokeUserAdminFunctionFallback(
            functionName,
            action,
            payload,
            { forceRefresh: true }
          );
        } catch (authFallbackError) {
          lastError = normalizeKnownUserAdminError(authFallbackError);
          const authFallbackLowered = String(
            lastError?.message || ""
          ).toLowerCase();
          const authFallbackNotFound =
            authFallbackLowered.includes("not found") ||
            authFallbackLowered.includes("404");
          if (authFallbackNotFound && hasNextCandidate) {
            continue;
          }
        }
      }

      if (shouldTryFallback) {
        try {
          return await invokeUserAdminFunctionFallback(
            functionName,
            action,
            payload
          );
        } catch (fallbackError) {
          lastError = normalizeKnownUserAdminError(fallbackError);
          if (!attemptedForceRefresh && isAuthRelatedUserAdminError(lastError)) {
            attemptedForceRefresh = true;
            try {
              return await invokeUserAdminFunctionFallback(
                functionName,
                action,
                payload,
                { forceRefresh: true }
              );
            } catch (refreshFallbackError) {
              lastError = normalizeKnownUserAdminError(refreshFallbackError);
            }
          }
          const fallbackLowered = String(
            lastError?.message || ""
          ).toLowerCase();
          const fallbackNotFound =
            fallbackLowered.includes("not found") ||
            fallbackLowered.includes("404");
          if (fallbackNotFound && hasNextCandidate) {
            continue;
          }
        }
      }

      if (isNotFound && hasNextCandidate) {
        continue;
      }
      throw new Error(getUserAdminFunctionError(lastError || normalizedError || error));
    }
  }

  throw new Error(getUserAdminFunctionError(lastError));
};

const ListManagedUsers = async () => callUserAdminFunction("list_users");

const InviteManagedUser = async ({ email, full_name, role }) =>
  callUserAdminFunction("invite_user", { email, full_name, role });

const CreateManagedUser = async ({
  email,
  password,
  full_name,
  role,
  email_confirm,
}) =>
  callUserAdminFunction("create_user", {
    email,
    password,
    full_name,
    role,
    email_confirm,
  });

const SetManagedUserRole = async ({ user_id, role }) =>
  callUserAdminFunction("set_role", { user_id, role });

const SetManagedUserActive = async ({ user_id, active }) =>
  callUserAdminFunction("set_active", { user_id, active });

const normalizeManagedUserEmail = (value) => String(value || "").trim().toLowerCase();

const resolveManagedUserName = (user) =>
  String(user?.full_name || user?.name || user?.email || "").trim();

const SyncProfessionalsFromManagedUsers = async (options = {}) => {
  const sourceUsers = Array.isArray(options?.users) ? options.users : null;
  const managedUsersResult = sourceUsers
    ? { users: sourceUsers }
    : await ListManagedUsers();
  const rawUsers = Array.isArray(managedUsersResult?.users)
    ? managedUsersResult.users
    : [];

  const managedUsers = [];
  const seenEmails = new Set();
  rawUsers.forEach((user) => {
    const email = normalizeManagedUserEmail(user?.email);
    if (!email || seenEmails.has(email)) return;
    seenEmails.add(email);
    managedUsers.push({
      ...user,
      email,
      full_name: resolveManagedUserName(user),
    });
  });

  if (managedUsers.length === 0) {
    return {
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
    };
  }

  const professionals = await list("professionals");
  const professionalsByEmail = new Map();
  (professionals || []).forEach((professional) => {
    const professionalEmail = normalizeManagedUserEmail(professional?.email);
    if (professionalEmail && !professionalsByEmail.has(professionalEmail)) {
      professionalsByEmail.set(professionalEmail, professional);
    }
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const managedUser of managedUsers) {
    const email = normalizeManagedUserEmail(managedUser?.email);
    if (!email) {
      skipped += 1;
      continue;
    }

    const managedName = resolveManagedUserName(managedUser);
    const nextStatus = managedUser?.is_active === false ? "inativo" : "ativo";
    const existing = professionalsByEmail.get(email);

    if (!existing) {
      const createdProfessional = await create("professionals", {
        name: managedName || email,
        email,
        status: nextStatus,
      });
      if (createdProfessional?.id) {
        professionalsByEmail.set(email, createdProfessional);
      }
      created += 1;
      continue;
    }

    const updates = {};
    const currentName = String(existing?.name || "").trim();
    const currentEmail = normalizeManagedUserEmail(existing?.email);
    const currentStatus = String(existing?.status || "").trim().toLowerCase();

    if (!currentName && managedName) {
      updates.name = managedName;
    }
    if (currentEmail !== email) {
      updates.email = email;
    }
    if (currentStatus !== nextStatus) {
      updates.status = nextStatus;
    }

    if (Object.keys(updates).length === 0) {
      skipped += 1;
      continue;
    }

    const updatedProfessional = await update("professionals", existing.id, updates);
    if (updatedProfessional?.id) {
      professionalsByEmail.set(email, updatedProfessional);
    }
    updated += 1;
  }

  return {
    total: managedUsers.length,
    created,
    updated,
    skipped,
  };
};

const getWebhookUrl = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (typeof window !== "undefined" && url.origin === window.location.origin) {
      return null;
    }
    return url.toString();
  } catch (error) {
    return null;
  }
};

const getSharedEmailSettings = async () => {
  const now = Date.now();
  if (
    sharedEmailSettingsCache &&
    now - sharedEmailSettingsCacheTime < EMAIL_SETTINGS_CACHE_TTL_MS
  ) {
    return sharedEmailSettingsCache;
  }
  try {
    const loaded = await loadEmailSettingsFromStorage();
    sharedEmailSettingsCache = loaded;
    sharedEmailSettingsCacheTime = now;
    return loaded;
  } catch (error) {
    return {};
  }
};

const getSupabaseFunctionUrl = (functionName) => {
  if (typeof SUPABASE_URL !== "string") return null;
  const trimmed = SUPABASE_URL.trim();
  if (!trimmed) return null;
  const baseUrl = trimmed.replace(/\/$/, "");
  return `${baseUrl}/functions/v1/${functionName}`;
};

const isSessionTokenUsable = (session, toleranceSeconds = 30) => {
  const token = String(session?.access_token || "").trim();
  if (!token) return false;
  const expiresAt = Number(session?.expires_at || 0);
  if (!expiresAt) return true;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return expiresAt - nowSeconds > toleranceSeconds;
};

const getAccessToken = async (options = {}) => {
  const refreshIfMissing = Boolean(options?.refreshIfMissing);
  const forceRefresh = Boolean(options?.forceRefresh);
  try {
    if (forceRefresh) {
      const { data: refreshedData } = await supabase.auth.refreshSession();
      if (isSessionTokenUsable(refreshedData?.session)) {
        return String(refreshedData?.session?.access_token || "").trim();
      }

      const { data: currentAfterRefresh } = await supabase.auth.getSession();
      if (isSessionTokenUsable(currentAfterRefresh?.session)) {
        return String(currentAfterRefresh?.session?.access_token || "").trim();
      }
      return "";
    }

    const { data } = await supabase.auth.getSession();
    if (isSessionTokenUsable(data?.session)) {
      return String(data?.session?.access_token || "").trim();
    }
    if (!refreshIfMissing) {
      return String(data?.session?.access_token || "").trim();
    }

    const { data: refreshedData } = await supabase.auth.refreshSession();
    if (isSessionTokenUsable(refreshedData?.session)) {
      return String(refreshedData?.session?.access_token || "").trim();
    }
    const { data: afterRefreshData } = await supabase.auth.getSession();
    return isSessionTokenUsable(afterRefreshData?.session)
      ? String(afterRefreshData?.session?.access_token || "").trim()
      : "";
  } catch (error) {
    return "";
  }
};

const invokeSupabaseFunction = async (functionName, payload, accessToken) => {
  const url = getSupabaseFunctionUrl(functionName);
  if (!url) {
    throw new Error(
      "Supabase: defina VITE_SUPABASE_URL para chamar funções."
    );
  }
  const anonKey = typeof SUPABASE_ANON_KEY === "string" ? SUPABASE_ANON_KEY.trim() : "";
  if (!anonKey) {
    throw new Error(
      "Supabase: defina VITE_SUPABASE_ANON_KEY para chamar funções."
    );
  }
  const token = typeof accessToken === "string" && accessToken.trim()
    ? accessToken.trim()
    : anonKey;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    let parsedMessage = "";
    if (text) {
      try {
        const parsed = JSON.parse(text);
        parsedMessage = String(parsed?.error || parsed?.message || "").trim();
      } catch (parseError) {
        parsedMessage = "";
      }
    }
    const message = parsedMessage || text || `Falha ao chamar função ${functionName}.`;
    const requestError = new Error(message);
    requestError.status = response.status;
    throw requestError;
  }
  return response.json().catch(() => ({}));
};

const shouldFallbackFunctionCall = (message) => {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("failed to send a request to the edge function") ||
    normalized.includes("edge function returned a non-2xx status code") ||
    normalized.includes("invalid jwt") ||
    normalized.includes("jwt expired") ||
    normalized.includes("jwt malformed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("fetch failed") ||
    normalized.includes("unauthorized") ||
    normalized.includes("401") ||
    normalized.includes("403")
  );
};

const shouldFallbackByStatus = (status) =>
  Number(status) === 401 || Number(status) === 403;

const SendEmail = async ({ to, subject, body, attachments }) => {
  const settings = await getSharedEmailSettings();
  const fromEmail =
    typeof settings.fromEmail === "string" ? settings.fromEmail.trim() : "";
  const fromName =
    typeof settings.fromName === "string" ? settings.fromName.trim() : "";
  const payload = { to, subject, html: body };
  const fromData = {};
  if (fromEmail) fromData.email = fromEmail;
  if (fromName) fromData.name = fromName;
  if (Object.keys(fromData).length > 0) {
    payload.from = fromData;
    if (fromEmail) payload.from_email = fromEmail;
    if (fromName) payload.from_name = fromName;
  }

  if (Array.isArray(attachments) && attachments.length > 0) {
    const normalizedAttachments = attachments
      .map((attachment) => {
        if (!attachment || typeof attachment !== "object") return null;
        const filename = String(attachment.filename || attachment.name || "").trim();
        const content = String(attachment.content || attachment.contentBytes || "").trim();
        const contentType = String(
          attachment.contentType || attachment.type || "application/pdf"
        ).trim();
        if (!filename || !content) return null;
        return {
          filename,
          name: filename,
          content,
          contentBytes: content,
          contentType,
          type: contentType,
        };
      })
      .filter(Boolean);
    if (normalizedAttachments.length > 0) {
      payload.attachments = normalizedAttachments;
      if (normalizedAttachments.length === 1) {
        payload.attachment = normalizedAttachments[0];
        payload.attachment_base64 = normalizedAttachments[0].content;
        payload.attachment_name = normalizedAttachments[0].filename;
        payload.attachment_type = normalizedAttachments[0].contentType;
      }
    }
  }

  const webhookUrl =
    getWebhookUrl(settings.webhookUrl) || getWebhookUrl(EMAIL_WEBHOOK_URL);
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error("Falha ao enviar email via webhook.");
    }
    return response.json().catch(() => ({}));
  }

  const accessToken = await getAccessToken();

  try {
    const { data, error } = await supabase.functions.invoke(
      EMAIL_FUNCTION_NAME,
      {
        body: payload,
      }
    );
    if (error) {
      const message = error.message || "";
      if (shouldFallbackFunctionCall(message) || shouldFallbackByStatus(error.status)) {
        return await invokeSupabaseFunction(EMAIL_FUNCTION_NAME, payload, accessToken);
      }
      throw new Error(
        error.message ||
          "Função send-email não configurada no Supabase."
      );
    }
    return data;
  } catch (error) {
    const message = error?.message || String(error || "");
    if (shouldFallbackFunctionCall(message) || shouldFallbackByStatus(error?.status)) {
      return invokeSupabaseFunction(EMAIL_FUNCTION_NAME, payload, accessToken);
    }
    throw error;
  }
};

const logUserInApp = async (pageName) => {
  if (!pageName) return null;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return null;
    await supabase.from("app_logs").insert({
      page_name: pageName,
      user_id: user.id,
      user_email: user.email,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    // Logging é opcional, não deve quebrar o app.
  }
  return null;
};

const me = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    throw new Error("Usuário não autenticado.");
  }
  return mapSupabaseUser(data.user);
};

const logout = async (redirectTo = "/login") => {
  await supabase.auth.signOut();
  if (redirectTo) {
    window.location.href = redirectTo;
  }
};

const redirectToLogin = (returnTo = window.location.href) => {
  const target = `/login?redirect=${encodeURIComponent(returnTo)}`;
  window.location.href = target;
};

export const dataClient = {
  entities,
  auth: {
    me,
    logout,
    redirectToLogin,
  },
  integrations: {
    Core: {
      UploadFile,
      ExtractDataFromUploadedFile,
      SendEmail,
      ListMunicipalityGveMapping,
      ReplaceMunicipalityGveMapping,
      ClearMunicipalityGveMapping,
      DeleteTrainingParticipantsByTraining,
      ListManagedUsers,
      InviteManagedUser,
      CreateManagedUser,
      SetManagedUserRole,
      SetManagedUserActive,
      SyncProfessionalsFromManagedUsers,
    },
  },
  appLogs: {
    logUserInApp,
  },
};
