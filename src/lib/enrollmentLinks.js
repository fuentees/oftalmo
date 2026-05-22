const buildEnrollmentToken = ({ trainingId }) => {
  return String(trainingId || "").trim();
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
