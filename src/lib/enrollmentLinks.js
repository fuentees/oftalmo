const normalizeTrainingCode = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "");

const buildEnrollmentToken = ({ trainingId, trainingCode }) => {
  const code = normalizeTrainingCode(trainingCode);
  const id = String(trainingId || "").trim();
  if (code && id) return `c-${code}__${id}`;
  if (code) return `c-${code}`;
  return id;
};

export const buildPublicEnrollmentPath = (trainingId, trainingCode = "") => {
  const token = buildEnrollmentToken({ trainingId, trainingCode });
  if (!token) return "/PublicEnrollment";
  return `/i/${encodeURIComponent(token)}`;
};

export const buildPublicEnrollmentUrl = (
  origin,
  trainingId,
  trainingCode = ""
) => {
  const base = String(origin || "").trim().replace(/\/+$/, "");
  const path = buildPublicEnrollmentPath(trainingId, trainingCode);
  return base ? `${base}${path}` : path;
};
