export const buildPublicEnrollmentPath = (trainingId) => {
  const id = String(trainingId || "").trim();
  if (!id) return "/PublicEnrollment";
  return `/i/${encodeURIComponent(id)}`;
};

export const buildPublicEnrollmentUrl = (origin, trainingId) => {
  const base = String(origin || "").trim().replace(/\/+$/, "");
  const path = buildPublicEnrollmentPath(trainingId);
  return base ? `${base}${path}` : path;
};
