export const TRACOMA_TOTAL_QUESTIONS = 50;

const EPSILON = 1e-12;

export const normalizeBinaryAnswer = (value) => {
  if (value === 0 || value === 1) return value;
  if (value === "0" || value === "1") return Number(value);
  if (value === false) return 0;
  if (value === true) return 1;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric === 0 || numeric === 1) return numeric;
  return null;
};

export const buildAnswerKeyFromRows = (
  rows,
  totalQuestions = TRACOMA_TOTAL_QUESTIONS
) => {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const questionNumber = Number(row?.question_number || 0);
    const normalizedAnswer = normalizeBinaryAnswer(row?.expected_answer);
    if (!Number.isInteger(questionNumber)) return;
    if (questionNumber < 1 || questionNumber > totalQuestions) return;
    if (normalizedAnswer === null) return;
    map.set(questionNumber, normalizedAnswer);
  });

  const key = [];
  for (let i = 1; i <= totalQuestions; i += 1) {
    if (!map.has(i)) {
      throw new Error(
        `Gabarito incompleto: questão ${i} não está configurada no padrão ouro.`
      );
    }
    key.push(map.get(i));
  }
  return key;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const round = (value, digits = 3) => {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const parseAnswerArray = (answers, expectedCount = TRACOMA_TOTAL_QUESTIONS) => {
  if (!Array.isArray(answers)) {
    throw new Error("As respostas devem ser fornecidas em formato de lista.");
  }
  if (answers.length !== expectedCount) {
    throw new Error(
      `O teste exige ${expectedCount} respostas. Recebido: ${answers.length}.`
    );
  }

  return answers.map((value, index) => {
    const normalized = normalizeBinaryAnswer(value);
    if (normalized === null) {
      throw new Error(
        `A questão ${index + 1} possui resposta inválida. Use apenas 0 ou 1.`
      );
    }
    return normalized;
  });
};

export const getKappaInterpretation = (kappa) => {
  if (!Number.isFinite(kappa)) return "Não foi possível interpretar";
  if (kappa < 0) return "Pior que o acaso";
  if (kappa <= 0.2) return "Concordância fraca";
  if (kappa <= 0.4) return "Regular";
  if (kappa <= 0.6) return "Moderada";
  if (kappa <= 0.8) return "Substancial";
  return "Quase perfeita";
};

export const getAptitudeStatus = (kappa) =>
  Number.isFinite(kappa) && kappa >= 0.7 ? "Apto" : "Necessita retreinamento";

export const computeTracomaKappaMetrics = ({
  answerKey,
  traineeAnswers,
  totalQuestions = TRACOMA_TOTAL_QUESTIONS,
}) => {
  const expectedAnswers = parseAnswerArray(answerKey, totalQuestions);
  const candidateAnswers = parseAnswerArray(traineeAnswers, totalQuestions);

  let a = 0; // padrão=1 e formando=1
  let b = 0; // padrão=0 e formando=1
  let c = 0; // padrão=1 e formando=0
  let d = 0; // padrão=0 e formando=0

  for (let i = 0; i < totalQuestions; i += 1) {
    const expected = expectedAnswers[i];
    const candidate = candidateAnswers[i];
    if (expected === 1 && candidate === 1) a += 1;
    if (expected === 0 && candidate === 1) b += 1;
    if (expected === 1 && candidate === 0) c += 1;
    if (expected === 0 && candidate === 0) d += 1;
  }

  const po = (a + d) / totalQuestions;
  const pe =
    ((a + b) * (a + c) + (c + d) * (b + d)) /
    (totalQuestions * totalQuestions);

  if (Math.abs(1 - pe) < EPSILON) {
    throw new Error(
      "Erro matemático no cálculo do Kappa: Pe igual a 1. Revise o gabarito e as respostas."
    );
  }

  const kappa = (po - pe) / (1 - pe);
  const totalMatches = a + d;
  const concordancePercent = po * 100;
  const sensitivity = a + c > 0 ? a / (a + c) : null;
  const specificity = b + d > 0 ? d / (b + d) : null;

  // Aproximação para erro-padrão de Kappa e IC95%.
  const varianceApprox = (po * (1 - po)) / (totalQuestions * (1 - pe) ** 2);
  const stdError = Number.isFinite(varianceApprox) && varianceApprox >= 0
    ? Math.sqrt(varianceApprox)
    : null;
  const ciLow =
    stdError !== null ? clamp(kappa - 1.96 * stdError, -1, 1) : null;
  const ciHigh =
    stdError !== null ? clamp(kappa + 1.96 * stdError, -1, 1) : null;

  return {
    totalQuestions,
    totalMatches,
    matrix: { a, b, c, d },
    po,
    pe,
    kappa,
    kappaRounded: round(kappa, 3),
    poPercent: concordancePercent,
    interpretation: getKappaInterpretation(kappa),
    aptitudeStatus: getAptitudeStatus(kappa),
    sensitivity,
    specificity,
    ci95: {
      low: ciLow,
      high: ciHigh,
    },
    rounded: {
      po: round(po, 3),
      pe: round(pe, 3),
      poPercent: round(concordancePercent, 2),
      kappa: round(kappa, 3),
      sensitivity: round(sensitivity, 3),
      specificity: round(specificity, 3),
      ci95Low: round(ciLow, 3),
      ci95High: round(ciHigh, 3),
    },
  };
};
