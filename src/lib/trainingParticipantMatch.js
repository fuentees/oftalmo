export const normalizeParticipantText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

export const normalizeParticipantEmail = (value) =>
  String(value ?? "").trim().toLowerCase();

export const normalizeParticipantCpf = (value) =>
  String(value ?? "").replace(/\D/g, "").trim();

const toParticipantIdentity = (participant) => ({
  name: String(participant?.professional_name || "").trim(),
  email: String(participant?.professional_email || "").trim(),
  cpf: String(participant?.professional_cpf || "").trim(),
});

const toNormalizedIdentity = (identity) => ({
  name: normalizeParticipantText(identity?.name),
  email: normalizeParticipantEmail(identity?.email),
  cpf: normalizeParticipantCpf(identity?.cpf),
});

export const resolveTrainingParticipantMatch = (participants, identity) => {
  const normalizedTarget = toNormalizedIdentity(identity);
  const rows = Array.isArray(participants) ? participants : [];

  if (
    !normalizedTarget.name &&
    !normalizedTarget.email &&
    !normalizedTarget.cpf
  ) {
    return null;
  }

  if (normalizedTarget.cpf) {
    const byCpf = rows.find((item) => {
      const normalized = toNormalizedIdentity(toParticipantIdentity(item));
      return normalized.cpf && normalized.cpf === normalizedTarget.cpf;
    });
    if (byCpf) return byCpf;
  }

  if (normalizedTarget.email && normalizedTarget.name) {
    const byEmailName = rows.find((item) => {
      const normalized = toNormalizedIdentity(toParticipantIdentity(item));
      return (
        normalized.email &&
        normalized.name &&
        normalized.email === normalizedTarget.email &&
        normalized.name === normalizedTarget.name
      );
    });
    if (byEmailName) return byEmailName;
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
  const rawName = String(participant?.professional_name || fallback?.name || "").trim();
  const rawEmail = String(participant?.professional_email || fallback?.email || "").trim();
  const rawCpf = String(participant?.professional_cpf || fallback?.cpf || "").trim();
  return {
    name: rawName || "Formando sem nome",
    email: normalizeParticipantEmail(rawEmail) || null,
    cpf: normalizeParticipantCpf(rawCpf) || null,
  };
};
