export const normalizeParticipantText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

export const normalizeParticipantEmail = (value) =>
  String(value ?? "").trim().toLowerCase();

export const normalizeParticipantRg = (value) =>
  String(value ?? "")
    .replace(/[^0-9a-zA-Z]/g, "")
    .toUpperCase()
    .trim();

const toParticipantIdentity = (participant) => ({
  name: String(participant?.professional_name || "").trim(),
  email: String(participant?.professional_email || "").trim(),
  rg: String(
    participant?.professional_rg || participant?.professional_cpf || ""
  ).trim(),
});

const toNormalizedIdentity = (identity) => ({
  name: normalizeParticipantText(identity?.name),
  email: normalizeParticipantEmail(identity?.email),
  rg: normalizeParticipantRg(identity?.rg || identity?.cpf),
});

export const resolveTrainingParticipantMatch = (participants, identity) => {
  const normalizedTarget = toNormalizedIdentity(identity);
  const rows = Array.isArray(participants) ? participants : [];

  if (
    !normalizedTarget.name &&
    !normalizedTarget.email &&
    !normalizedTarget.rg
  ) {
    return null;
  }

  if (normalizedTarget.rg) {
    const byRg = rows.find((item) => {
      const normalized = toNormalizedIdentity(toParticipantIdentity(item));
      return normalized.rg && normalized.rg === normalizedTarget.rg;
    });
    if (byRg) return byRg;
  }

  if (normalizedTarget.email) {
    const byEmail = rows.filter((item) => {
      const normalized = toNormalizedIdentity(toParticipantIdentity(item));
      return normalized.email && normalized.email === normalizedTarget.email;
    });
    if (byEmail.length === 1) return byEmail[0];
  }

  if (normalizedTarget.name) {
    const byName = rows.filter((item) => {
      const normalized = toNormalizedIdentity(toParticipantIdentity(item));
      return normalized.name && normalized.name === normalizedTarget.name;
    });
    if (byName.length === 1) return byName[0];
  }

  return null;
};

export const buildParticipantIdentity = (participant, fallback = {}) => {
  const rawName = String(
    participant?.professional_name || fallback?.name || ""
  ).trim();
  const rawEmail = String(
    participant?.professional_email || fallback?.email || ""
  ).trim();
  const rawRg = String(
    participant?.professional_rg ||
      participant?.professional_cpf ||
      fallback?.rg ||
      fallback?.cpf ||
      ""
  ).trim();
  return {
    name: rawName || "Formando sem nome",
    email: normalizeParticipantEmail(rawEmail) || null,
    rg: normalizeParticipantRg(rawRg) || null,
  };
};
