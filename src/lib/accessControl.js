const normalizeText = (value) => String(value ?? "").trim().toLowerCase();

const ADMIN_ROLE_ALIASES = new Set([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
]);

const normalizeRoleValue = (value) => {
  const normalized = normalizeText(value).replace(/\s+/g, "_");
  if (!normalized) return "usuario";
  if (ADMIN_ROLE_ALIASES.has(normalized)) return "admin";
  return normalized;
};

const parseAdminEmails = () => {
  const raw = String(import.meta.env.VITE_ADMIN_EMAILS || "");
  if (!raw.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((item) => normalizeText(item))
      .filter(Boolean)
  );
};

const ADMIN_EMAILS = parseAdminEmails();

export const ADMIN_ONLY_PAGES = new Set(["Settings", "AuditLogs"]);

export const isAdminEmail = (email) => ADMIN_EMAILS.has(normalizeText(email));

export const resolveUserRole = ({ email, userMetadata, appMetadata }) => {
  const appRole = normalizeRoleValue(appMetadata?.role);
  const userRole = normalizeRoleValue(userMetadata?.role);

  if (isAdminEmail(email)) return "admin";
  if (appRole === "admin") return "admin";
  if (userRole === "admin") return "admin";
  if (appRole !== "usuario") return appRole;
  if (userRole !== "usuario") return userRole;
  return "usuario";
};
