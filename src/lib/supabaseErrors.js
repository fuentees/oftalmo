export const getSupabaseErrorMessage = (error) =>
  String(error?.message || "").trim();

export const isMissingSupabaseTableError = (error, tableName) => {
  const message = getSupabaseErrorMessage(error).toLowerCase();
  const normalizedTable = String(tableName || "").trim().toLowerCase();
  if (!message || !normalizedTable) return false;

  return (
    message.includes(
      `could not find the table 'public.${normalizedTable}' in the schema cache`
    ) ||
    message.includes(`relation "public.${normalizedTable}" does not exist`) ||
    message.includes(`relation "${normalizedTable}" does not exist`)
  );
};
