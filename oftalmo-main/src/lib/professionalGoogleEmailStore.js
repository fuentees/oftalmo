import { loadSharedConfigJson, saveSharedConfigJson } from "@/lib/sharedConfigStore";

const SHARED_CONFIG_KEY_PROFESSIONAL_GOOGLE_EMAIL =
  "__config__:professional-google-email-map";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const normalizeString = (value) => String(value || "").trim();
const normalizeEmail = (value) => normalizeString(value).toLowerCase();

const normalizeStorePayload = (value) => {
  const byProfessionalIdRaw =
    value && typeof value === "object" && value.byProfessionalId
      ? value.byProfessionalId
      : {};
  const byProfessionalEmailRaw =
    value && typeof value === "object" && value.byProfessionalEmail
      ? value.byProfessionalEmail
      : {};

  const byProfessionalId = {};
  Object.entries(byProfessionalIdRaw || {}).forEach(([key, email]) => {
    const normalizedKey = normalizeString(key);
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedKey || !EMAIL_REGEX.test(normalizedEmail)) return;
    byProfessionalId[normalizedKey] = normalizedEmail;
  });

  const byProfessionalEmail = {};
  Object.entries(byProfessionalEmailRaw || {}).forEach(([key, email]) => {
    const normalizedKey = normalizeEmail(key);
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedKey || !EMAIL_REGEX.test(normalizedEmail)) return;
    byProfessionalEmail[normalizedKey] = normalizedEmail;
  });

  return {
    byProfessionalId,
    byProfessionalEmail,
  };
};

export const loadProfessionalGoogleEmailStore = async () => {
  const parsed = await loadSharedConfigJson(
    SHARED_CONFIG_KEY_PROFESSIONAL_GOOGLE_EMAIL
  );
  return normalizeStorePayload(parsed);
};

export const saveProfessionalGoogleEmailStore = async (value) => {
  const normalized = normalizeStorePayload(value);
  await saveSharedConfigJson(SHARED_CONFIG_KEY_PROFESSIONAL_GOOGLE_EMAIL, normalized);
  return normalized;
};

export const resolveProfessionalGoogleEmail = (store, options = {}) => {
  const normalizedStore = normalizeStorePayload(store);
  const professionalId = normalizeString(options?.professionalId);
  const professionalEmail = normalizeEmail(options?.professionalEmail);
  const emailById = professionalId
    ? normalizeEmail(normalizedStore.byProfessionalId[professionalId] || "")
    : "";
  if (EMAIL_REGEX.test(emailById)) return emailById;
  const emailByProfessionalEmail = professionalEmail
    ? normalizeEmail(normalizedStore.byProfessionalEmail[professionalEmail] || "")
    : "";
  if (EMAIL_REGEX.test(emailByProfessionalEmail)) return emailByProfessionalEmail;
  return "";
};

export const upsertProfessionalGoogleEmail = async ({
  professionalId,
  professionalEmail,
  googleEmail,
}) => {
  const current = await loadProfessionalGoogleEmailStore();
  const next = normalizeStorePayload(current);
  const normalizedProfessionalId = normalizeString(professionalId);
  const normalizedProfessionalEmail = normalizeEmail(professionalEmail);
  const normalizedGoogleEmail = normalizeEmail(googleEmail);
  const hasGoogleEmail = EMAIL_REGEX.test(normalizedGoogleEmail);

  if (normalizedProfessionalId) {
    if (hasGoogleEmail) {
      next.byProfessionalId[normalizedProfessionalId] = normalizedGoogleEmail;
    } else {
      delete next.byProfessionalId[normalizedProfessionalId];
    }
  }

  if (normalizedProfessionalEmail) {
    if (hasGoogleEmail) {
      next.byProfessionalEmail[normalizedProfessionalEmail] = normalizedGoogleEmail;
    } else {
      delete next.byProfessionalEmail[normalizedProfessionalEmail];
    }
  }

  return saveProfessionalGoogleEmailStore(next);
};
