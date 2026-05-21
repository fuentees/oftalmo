import { format } from "date-fns";

export const parseDateSafe = (value) => {
  if (!value) return new Date(NaN);
  if (value instanceof Date) {
    // Se veio como Date UTC (ex: do Supabase), extrai ano/mês/dia local
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    // Extrai a parte YYYY-MM-DD de qualquer string que comece com ela
    // Cobre: "2025-05-15", "2025-05-15T00:00:00Z", "2025-05-15T00:00:00+00:00"
    const datePartMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (datePartMatch) {
      const year = Number(datePartMatch[1]);
      const month = Number(datePartMatch[2]);
      const day = Number(datePartMatch[3]);
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
