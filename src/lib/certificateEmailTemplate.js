import { supabase } from "@/api/supabaseClient";
import { loadSharedConfigJson, saveSharedConfigJson } from "@/lib/sharedConfigStore";

const STORAGE_BUCKET =
  import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "uploads";
const CERTIFICATE_EMAIL_TEMPLATE_FOLDER = "certificates";
const CERTIFICATE_EMAIL_TEMPLATE_STORAGE_PATH =
  `${CERTIFICATE_EMAIL_TEMPLATE_FOLDER}/certificate-email-template.json`;
const CERTIFICATE_EMAIL_TEMPLATE_FILE_PREFIX = "certificate-email-template-";
const SHARED_CONFIG_KEY_EMAIL_TEMPLATE = "__config__:certificate-email-template";

export const DEFAULT_CERTIFICATE_EMAIL_TEMPLATE = {
  subject: "Certificado de Conclusão",
  body: `
    <h2>Certificado de Conclusão</h2>
    <p>Olá {{nome}},</p>
    <p>Segue em anexo seu certificado do treinamento <strong>{{treinamento}}</strong>.</p>
    <br>
    <p>Atenciosamente,<br>Equipe de Treinamentos</p>
  `.trim(),
};

const mergeTemplate = (template) => ({
  ...DEFAULT_CERTIFICATE_EMAIL_TEMPLATE,
  ...(template || {}),
});

export const loadCertificateEmailTemplate = () => {
  return DEFAULT_CERTIFICATE_EMAIL_TEMPLATE;
};

export const saveCertificateEmailTemplate = (template) => {
  return mergeTemplate(template);
};

export const resetCertificateEmailTemplate = () => {
  return DEFAULT_CERTIFICATE_EMAIL_TEMPLATE;
};

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

export const isCertificateEmailTemplatePermissionError = (error) => {
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

const resolveLatestTemplatePath = async () => {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(
    CERTIFICATE_EMAIL_TEMPLATE_FOLDER,
    {
      limit: 1000,
      sortBy: { column: "name", order: "desc" },
    }
  );
  if (error) {
    if (isCertificateEmailTemplatePermissionError(error)) throw error;
    return CERTIFICATE_EMAIL_TEMPLATE_STORAGE_PATH;
  }

  const candidates = (data || [])
    .map((item) => String(item?.name || "").trim())
    .filter(
      (name) =>
        name.startsWith(CERTIFICATE_EMAIL_TEMPLATE_FILE_PREFIX) &&
        name.endsWith(".json")
    );
  if (candidates.length === 0) {
    return CERTIFICATE_EMAIL_TEMPLATE_STORAGE_PATH;
  }

  candidates.sort((a, b) => {
    const timestampA = getVersionTimestampFromFileName(
      a,
      CERTIFICATE_EMAIL_TEMPLATE_FILE_PREFIX
    );
    const timestampB = getVersionTimestampFromFileName(
      b,
      CERTIFICATE_EMAIL_TEMPLATE_FILE_PREFIX
    );
    if (timestampA !== timestampB) return timestampB - timestampA;
    return b.localeCompare(a);
  });

  return `${CERTIFICATE_EMAIL_TEMPLATE_FOLDER}/${candidates[0]}`;
};

const loadTemplateFromSharedStore = async () => {
  try {
    const parsed = await loadSharedConfigJson(SHARED_CONFIG_KEY_EMAIL_TEMPLATE);
    if (!parsed || typeof parsed !== "object") return null;
    return mergeTemplate(parsed);
  } catch {
    return null;
  }
};

export const resolveCertificateEmailTemplate = async () => {
  const sharedTemplate = await loadTemplateFromSharedStore();
  if (sharedTemplate) return sharedTemplate;

  const latestPath = await resolveLatestTemplatePath();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(latestPath);
  if (error || !data) {
    if (isStorageObjectNotFoundError(error)) {
      return DEFAULT_CERTIFICATE_EMAIL_TEMPLATE;
    }
    throw error;
  }
  const content = await data.text();
  if (!content) return DEFAULT_CERTIFICATE_EMAIL_TEMPLATE;
  try {
    const parsed = JSON.parse(content);
    return mergeTemplate(parsed);
  } catch {
    return DEFAULT_CERTIFICATE_EMAIL_TEMPLATE;
  }
};

export const saveCertificateEmailTemplateToStorage = async (template) => {
  const payload = mergeTemplate(template);
  await saveSharedConfigJson(SHARED_CONFIG_KEY_EMAIL_TEMPLATE, payload);

  const content = JSON.stringify(payload);
  const blob = new Blob([content], { type: "application/json" });
  const fileName = `${CERTIFICATE_EMAIL_TEMPLATE_FILE_PREFIX}${Date.now()}.json`;
  const file = new File([blob], fileName, {
    type: "application/json",
  });
  const path = `${CERTIFICATE_EMAIL_TEMPLATE_FOLDER}/${fileName}`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: false });
  if (error && !isCertificateEmailTemplatePermissionError(error)) {
    throw error;
  }
  return payload;
};

export const interpolateEmailTemplate = (text, data) =>
  String(text || "").replace(/\{\{(\w+)\}\}/g, (_, key) =>
    data[key] !== undefined && data[key] !== null ? String(data[key]) : ""
  );

const getTrainingDates = (training) => {
  const rawDates = [];
  if (Array.isArray(training?.dates)) {
    training.dates.forEach((entry) => {
      if (!entry) return;
      if (entry instanceof Date || typeof entry === "string" || typeof entry === "number") {
        rawDates.push(entry);
        return;
      }
      if (entry.date) rawDates.push(entry.date);
      if (entry.start_date) rawDates.push(entry.start_date);
    });
  }
  if (rawDates.length === 0) {
    if (training?.start_date) rawDates.push(training.start_date);
    if (training?.date) rawDates.push(training.date);
  }
  const parsedDates = rawDates
    .map((value) => {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    })
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
  const formatted = parsedDates.map((value) =>
    value.toLocaleDateString("pt-BR")
  );
  return formatted.filter((value, index) => formatted.indexOf(value) === index);
};

const buildTrainingPeriod = (dates) => {
  if (!Array.isArray(dates) || dates.length === 0) return "";
  if (dates.length === 1) return dates[0];
  return `de ${dates[0]} a ${dates[dates.length - 1]}`;
};

const buildTrainingDays = (dates) => {
  if (!Array.isArray(dates) || dates.length === 0) return "";
  return dates.join(", ");
};

const EMAIL_ROLE_LABELS = {
  participant: { tipo: "conclusão", funcao: "participante" },
  monitor: { tipo: "monitoria", funcao: "monitor" },
  speaker: { tipo: "palestra", funcao: "palestrante" },
};

export const buildCertificateEmailData = ({
  training,
  nome,
  rg,
  carga_horaria,
  coordenador,
  instrutor,
  role = "participant",
  aula = "",
}) => {
  const roleLabels = EMAIL_ROLE_LABELS[role] || EMAIL_ROLE_LABELS.participant;
  const trainingDates = getTrainingDates(training);
  return {
    nome: nome || "",
    rg: rg ? `RG ${rg}` : "",
    treinamento: training?.title || "",
    carga_horaria: carga_horaria || training?.duration_hours || "",
    data: trainingDates[0] || "",
    entidade: training?.entityName || "",
    coordenador: coordenador || training?.coordinator || "",
    instrutor: instrutor || training?.instructor || "",
    funcao: roleLabels.funcao,
    tipo_certificado: roleLabels.tipo,
    aula: aula || "",
    periodo_treinamento: buildTrainingPeriod(trainingDates),
    dias_treinamento: buildTrainingDays(trainingDates),
  };
};
