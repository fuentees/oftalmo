import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "@/api/supabaseClient";

const STORAGE_BUCKET =
  import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "uploads";
const EMAIL_FUNCTION_NAME =
  import.meta.env.VITE_SUPABASE_EMAIL_FUNCTION || "send-email";
const EMAIL_WEBHOOK_URL = import.meta.env.VITE_EMAIL_WEBHOOK_URL;

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
  return {
    id: user.id,
    email: user.email,
    full_name: metadata.full_name || metadata.name || user.email,
    role: appMetadata.role || metadata.role || "usuario",
    ...metadata,
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
};

const applyOrder = (query, order) => {
  if (!order) return query;
  const descending = order.startsWith("-");
  const column = descending ? order.slice(1) : order;
  if (!column) return query;
  return query.order(column, { ascending: !descending });
};

const list = async (table, order, limit) => {
  let query = supabase.from(table).select("*");
  query = applyOrder(query, order);
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return normalizeEntityData(table, data || []);
};

const filter = async (table, filters, order, limit) => {
  let query = supabase.from(table).select("*");
  if (filters) query = query.match(filters);
  query = applyOrder(query, order);
  if (limit) query = query.limit(limit);
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
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
  return { id };
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

const isValidWebhookUrl = (value) =>
  typeof value === "string" && /^https?:\/\//i.test(value.trim());

const SendEmail = async ({ to, subject, body }) => {
  const payload = { to, subject, html: body };
  if (isValidWebhookUrl(EMAIL_WEBHOOK_URL)) {
    const response = await fetch(EMAIL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error("Falha ao enviar email via webhook.");
    }
    return response.json().catch(() => ({}));
  }

  const { data, error } = await supabase.functions.invoke(
    EMAIL_FUNCTION_NAME,
    {
      body: payload,
    }
  );
  if (error) {
    throw new Error(
      error.message ||
        "Função send-email não configurada no Supabase."
    );
  }
  return data;
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
    },
  },
  appLogs: {
    logUserInApp,
  },
};
