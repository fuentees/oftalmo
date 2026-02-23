const normalizeTrainingText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

const normalizeTrainingTypeValue = (value) =>
  normalizeTrainingText(value).replace(/[^a-z0-9]+/g, "_");

export const isRepadronizacaoType = (value) => {
  const normalized = normalizeTrainingTypeValue(value);
  return (
    normalized === "repadronizacao" ||
    normalized.includes("repadronizacao")
  );
};

export const isRepadronizacaoTraining = (training) => {
  if (!training) return false;
  if (isRepadronizacaoType(training.type)) return true;
  const title = normalizeTrainingText(training.title);
  return title.includes("repadronizacao");
};
