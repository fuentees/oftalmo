// Keep only the inputs needed to reproduce the issued document, never its PDF
// or a copy of the template's images for every recipient.
const pick = (source, keys) => Object.fromEntries(
  keys.filter((key) => source?.[key] !== undefined).map((key) => [key, JSON.parse(JSON.stringify(source[key]))])
);

export const buildCertificateIssueMetadata = ({
  recipient, training, type, templateKey, modelId, options = {},
  issuedAt = new Date().toISOString(), validityDate = null,
}) => ({
  schema_version: 1,
  renderer_version: 1,
  type,
  issued_at: issuedAt,
  issued_on: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(issuedAt)),
  validity_date: validityDate,
  training_id: training.id,
  training_title: training.title,
  template_model_id: modelId,
  template_key: templateKey,
  snapshot: {
    recipient: pick(recipient, [
      'professional_name', 'professional_rg', 'professional_cpf', 'grade',
      'certificate_score', 'certificate_kappa', 'name', 'rg', 'cpf', 'document',
      'professional_id', 'email', 'lecture', 'certificateScheduleEntry',
    ]),
    training: pick(training, [
      'id', 'title', 'dates', 'date', 'start_date', 'start_time', 'end_time',
      'duration_hours', 'coordinator', 'instructor', 'municipality', 'location',
    ]),
    options: { includeSchedule: options.includeSchedule !== false },
  },
});

export const hasCertificateSnapshot = (record) => Boolean(
  record?.certificate_issue_metadata?.schema_version === 1 &&
  record?.certificate_issue_metadata?.snapshot &&
  record?.certificate_issue_metadata?.template_key
);

export const certificateEmissionDate = (source) =>
  source?.certificate_issue_metadata?.issued_on || source?.certificate_issue_metadata?.issued_at || source?.certificate_sent_date || new Date();

export const certificateSnapshotInput = (record) => {
  const metadata = record?.certificate_issue_metadata;
  if (!hasCertificateSnapshot(record) || metadata.renderer_version !== 1) {
    throw new Error('Este certificado precisa do arquivo original para preservar a emissão.');
  }
  return {
    recipient: {
      ...metadata.snapshot.recipient,
      certificate_number: record.certificate_number,
      validity_date: metadata.validity_date,
      certificate_issue_metadata: metadata,
    },
    training: metadata.snapshot.training,
    options: metadata.snapshot.options,
    templateKey: metadata.template_key,
    type: metadata.type,
  };
};
