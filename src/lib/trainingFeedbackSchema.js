export const CHOICE_SPLIT_TOKEN = "||";
export const CHOICE_OPTION_TOKEN = "|";

const TRAINING_EVALUATION_RATING_OPTIONS = [
  "5 - ÓTIMO",
  "4 - BOM",
  "3 - REGULAR",
  "2 - FRACO",
  "1 - INSUFICIENTE",
];

export const DEFAULT_TRAINING_FEEDBACK_QUESTIONS = [
  {
    question_text: "A - DURAÇÃO DO CURSO",
    question_type: "choice",
    order: 1,
    question_options: TRAINING_EVALUATION_RATING_OPTIONS,
  },
  {
    question_text: "A - JUSTIFIQUE A SUA NOTA",
    question_type: "text",
    order: 2,
  },
  {
    question_text: "B - TEMPO DESTINADO A CADA ASSUNTO",
    question_type: "choice",
    order: 3,
    question_options: TRAINING_EVALUATION_RATING_OPTIONS,
  },
  {
    question_text: "B - JUSTIFIQUE A SUA NOTA",
    question_type: "text",
    order: 4,
  },
  {
    question_text: "C - DIDÁTICA APLICADA A CADA ASSUNTO",
    question_type: "choice",
    order: 5,
    question_options: TRAINING_EVALUATION_RATING_OPTIONS,
  },
  {
    question_text: "C - JUSTIFIQUE A SUA NOTA",
    question_type: "text",
    order: 6,
  },
  {
    question_text: "D - LOCAL DO TREINAMENTO",
    question_type: "choice",
    order: 7,
    question_options: TRAINING_EVALUATION_RATING_OPTIONS,
  },
  {
    question_text: "D - JUSTIFIQUE A SUA NOTA",
    question_type: "text",
    order: 8,
  },
  {
    question_text: "E - MATERIAL UTILIZADO",
    question_type: "choice",
    order: 9,
    question_options: TRAINING_EVALUATION_RATING_OPTIONS,
  },
  {
    question_text: "E - JUSTIFIQUE A SUA NOTA",
    question_type: "text",
    order: 10,
  },
  {
    question_text:
      "2 - QUAL ASSUNTO VOCÊ CONSIDERA MAIS IMPORTANTE E O MENOS IMPORTANTE PARA O DESENVOLVIMENTO DO TRABALHO QUE IRÁ EFETUAR?",
    question_type: "text",
    order: 11,
  },
  {
    question_text: "3 - COMENTÁRIOS/SUGESTÕES",
    question_type: "text",
    order: 12,
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
