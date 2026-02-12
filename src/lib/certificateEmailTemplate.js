export const CERTIFICATE_EMAIL_TEMPLATE_KEY = "certificateEmailTemplate";

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
  if (typeof window === "undefined") return DEFAULT_CERTIFICATE_EMAIL_TEMPLATE;
  try {
    const stored = window.localStorage.getItem(CERTIFICATE_EMAIL_TEMPLATE_KEY);
    if (!stored) return DEFAULT_CERTIFICATE_EMAIL_TEMPLATE;
    const parsed = JSON.parse(stored);
    return mergeTemplate(parsed);
  } catch (error) {
    return DEFAULT_CERTIFICATE_EMAIL_TEMPLATE;
  }
};

export const saveCertificateEmailTemplate = (template) => {
  if (typeof window === "undefined") return;
  const payload = mergeTemplate(template);
  window.localStorage.setItem(
    CERTIFICATE_EMAIL_TEMPLATE_KEY,
    JSON.stringify(payload)
  );
};

export const resetCertificateEmailTemplate = () => {
  if (typeof window === "undefined") return DEFAULT_CERTIFICATE_EMAIL_TEMPLATE;
  window.localStorage.setItem(
    CERTIFICATE_EMAIL_TEMPLATE_KEY,
    JSON.stringify(DEFAULT_CERTIFICATE_EMAIL_TEMPLATE)
  );
  return DEFAULT_CERTIFICATE_EMAIL_TEMPLATE;
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
