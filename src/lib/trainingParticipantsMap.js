// Agrupa participantes por treinamento. Muitos registros de participante
// (principalmente os mais antigos, importados via planilha) não têm
// training_id preenchido — só title/date do treinamento na época da
// inscrição. Por isso o match precisa de um fallback por título+data
// normalizados, não só por training_id direto. Extraído de Trainings.jsx
// (onde essa lógica nasceu) para ser reaproveitado em qualquer tela que
// precise contar participantes por treinamento corretamente (ex: o
// Relatório de Atividades em Reports.jsx) sem duplicar — e sem divergir.

const normalizeComparisonText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const normalizeDateKey = (value) => {
  if (!value) return "";
  const text = String(value).trim();
  if (!text) return "";
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getTrainingDateKeys = (training) => {
  const keys = new Set();
  if (Array.isArray(training?.dates)) {
    training.dates.forEach((item) => {
      const dateValue = typeof item === "object" ? item?.date : item;
      const normalized = normalizeDateKey(dateValue);
      if (normalized) keys.add(normalized);
    });
  }
  const baseDate = normalizeDateKey(training?.date);
  if (baseDate) keys.add(baseDate);
  const startDate = normalizeDateKey(training?.start_date);
  if (startDate) keys.add(startDate);
  return Array.from(keys);
};

/**
 * @param {any[]} trainings
 * @param {any[]} participants
 * @returns {Map<string, any[]>} training id -> participantes vinculados
 */
export const buildParticipantsByTrainingMap = (trainings, participants) => {
  const map = new Map();
  const trainingMeta = (trainings || [])
    .map((training) => {
      const trainingId = String(training?.id || "").trim();
      if (!trainingId) return null;
      const titleKey = normalizeComparisonText(training?.title);
      const dateKeys = new Set(getTrainingDateKeys(training));
      map.set(trainingId, []);
      return { trainingId, titleKey, dateKeys };
    })
    .filter(Boolean);

  const seenByTraining = new Map(
    trainingMeta.map((meta) => [meta.trainingId, new Set()])
  );

  const getParticipantKey = (participant) => {
    const participantId = String(participant?.id || "").trim();
    if (participantId) return `id:${participantId}`;
    const name = normalizeComparisonText(participant?.professional_name);
    const email = normalizeComparisonText(participant?.professional_email);
    const rg = normalizeComparisonText(
      participant?.professional_rg || participant?.professional_cpf
    );
    const date = normalizeDateKey(participant?.enrollment_date);
    return `legacy:${name}|${email}|${rg}|${date}`;
  };

  (participants || []).forEach((participant) => {
    const participantTrainingId = String(participant?.training_id || "").trim();
    const participantTitleKey = normalizeComparisonText(participant?.training_title);
    const participantDateKey = normalizeDateKey(participant?.training_date);
    const participantKey = getParticipantKey(participant);

    trainingMeta.forEach((meta) => {
      const linkedById = Boolean(
        participantTrainingId && participantTrainingId === meta.trainingId
      );

      let linkedByLegacyTitleDate = false;
      if (!participantTrainingId && participantTitleKey && participantTitleKey === meta.titleKey) {
        linkedByLegacyTitleDate =
          meta.dateKeys.size === 0 ||
          !participantDateKey ||
          meta.dateKeys.has(participantDateKey);
      }

      if (!linkedById && !linkedByLegacyTitleDate) return;

      const seenSet = seenByTraining.get(meta.trainingId);
      if (seenSet?.has(participantKey)) return;
      seenSet?.add(participantKey);
      map.get(meta.trainingId)?.push(participant);
    });
  });

  return map;
};
