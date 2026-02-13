import { format } from "date-fns";

export const parseDateSafe = (value) => {
  if (!value) return new Date(NaN);
  if (value instanceof Date) return new Date(value.getTime());

  if (typeof value === "string") {
    const trimmed = value.trim();
    const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const year = Number(dateOnlyMatch[1]);
      const month = Number(dateOnlyMatch[2]);
      const day = Number(dateOnlyMatch[3]);
      return new Date(year, month - 1, day);
    }
    return new Date(trimmed);
  }

  return new Date(value);
};

export const formatDateSafe = (value, pattern = "dd/MM/yyyy") => {
  const parsed = parseDateSafe(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, pattern);
};
