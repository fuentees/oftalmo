export const CHOICE_SPLIT_TOKEN = "||";
export const CHOICE_OPTION_TOKEN = "|";

export const DEFAULT_TRAINING_FEEDBACK_QUESTIONS = [
  {
    question_text: "Conteúdo apresentado",
    question_type: "rating",
    order: 1,
  },
  {
    question_text: "Didática do instrutor",
    question_type: "rating",
    order: 2,
  },
  {
    question_text: "Material de apoio",
    question_type: "rating",
    order: 3,
  },
  {
    question_text: "Duração/carga horária do curso",
    question_type: "choice",
    order: 4,
    question_options: ["Muito curta", "Adequada", "Muito longa"],
  },
  {
    question_text: "Horário/tempo do treinamento",
    question_type: "choice",
    order: 5,
    question_options: ["Muito ruim", "Ruim", "Adequado", "Muito bom"],
  },
  {
    question_text: "Local e infraestrutura",
    question_type: "choice",
    order: 6,
    question_options: ["Ruim", "Regular", "Bom", "Excelente"],
  },
  {
    question_text: "Assuntos mais importantes para sua prática",
    question_type: "text",
    order: 7,
  },
  {
    question_text: "Assuntos menos importantes",
    question_type: "text",
    order: 8,
    required: false,
  },
  {
    question_text: "Sugestões para próximos treinamentos",
    question_type: "text",
    order: 9,
    required: false,
  },
];

export const normalizeChoiceOptions = (options) =>
  Array.from(
    new Set(
      (options || [])
        .map((option) => String(option || "").trim())
        .filter(Boolean)
    )
  );

export const parseChoiceOptionsFromText = (value) =>
  normalizeChoiceOptions(
    String(value || "")
      .split(CHOICE_OPTION_TOKEN)
      .map((item) => item.trim())
  );

export const buildChoiceQuestionText = (label, options) => {
  const cleanLabel = String(label || "").trim();
  const cleanOptions = normalizeChoiceOptions(options);
  if (!cleanOptions.length) return cleanLabel;
  return `${cleanLabel} ${CHOICE_SPLIT_TOKEN} ${cleanOptions.join(
    ` ${CHOICE_OPTION_TOKEN} `
  )}`;
};

export const extractQuestionMeta = (question) => {
  const rawText = String(question?.question_text || "");
  const questionType = String(question?.question_type || "")
    .trim()
    .toLowerCase();

  if (questionType !== "choice") {
    return {
      label: rawText.trim(),
      options: [],
    };
  }

  const fromColumn = normalizeChoiceOptions(question?.question_options);
  if (fromColumn.length > 0) {
    return {
      label: rawText.trim(),
      options: fromColumn,
    };
  }

  const [labelPart, optionsPart = ""] = rawText.split(CHOICE_SPLIT_TOKEN);
  const options = parseChoiceOptionsFromText(optionsPart);

  return {
    label: String(labelPart || rawText).trim(),
    options,
  };
};
