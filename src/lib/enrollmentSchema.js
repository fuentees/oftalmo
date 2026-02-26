export const DEFAULT_ENROLLMENT_SECTIONS = [
  { key: "pessoais", label: "Dados Pessoais" },
  { key: "instituicao", label: "Instituição" },
  { key: "enderecos", label: "Endereços" },
  { key: "contatos", label: "Contatos" },
];

export const DEFAULT_ENROLLMENT_FIELDS = [
  {
    field_key: "name",
    label: "Nome",
    type: "text",
    required: true,
    placeholder: "Nome completo",
    section: "pessoais",
    order: 1,
  },
  {
    field_key: "cpf",
    label: "CPF",
    type: "text",
    required: true,
    placeholder: "000.000.000-00",
    section: "pessoais",
    order: 2,
  },
  {
    field_key: "rg",
    label: "RG",
    type: "text",
    required: true,
    placeholder: "00.000.000-0",
    section: "pessoais",
    order: 3,
  },
  {
    field_key: "email",
    label: "E-mail",
    type: "email",
    required: true,
    placeholder: "nome@email.com",
    section: "pessoais",
    order: 4,
  },
  {
    field_key: "professional_formation",
    label: "Formação Profissional",
    type: "text",
    required: false,
    placeholder: "Ex: Enfermagem",
    section: "instituicao",
    order: 5,
  },
  {
    field_key: "institution",
    label: "Instituição que representa",
    type: "text",
    required: false,
    placeholder: "Ex: Hospital X",
    section: "instituicao",
    order: 6,
  },
  {
    field_key: "state",
    label: "Estado",
    type: "text",
    required: false,
    placeholder: "UF",
    section: "instituicao",
    order: 7,
  },
  {
    field_key: "health_region",
    label: "GVE",
    type: "text",
    required: false,
    placeholder: "Ex: GVE Taubaté",
    section: "instituicao",
    order: 8,
  },
  {
    field_key: "municipality",
    label: "Município",
    type: "text",
    required: false,
    placeholder: "Cidade",
    section: "instituicao",
    order: 9,
  },
  {
    field_key: "unit_name",
    label: "Nome da Unidade",
    type: "text",
    required: false,
    placeholder: "Unidade de saúde",
    section: "instituicao",
    order: 10,
  },
  {
    field_key: "sector",
    label: "Cargo",
    type: "text",
    required: false,
    placeholder: "Cargo/Função",
    section: "instituicao",
    order: 11,
  },
  {
    field_key: "work_address",
    label: "Endereço de Trabalho",
    type: "text",
    required: false,
    placeholder: "Rua, número, bairro",
    section: "enderecos",
    order: 12,
  },
  {
    field_key: "residential_address",
    label: "Endereço Residencial",
    type: "text",
    required: false,
    placeholder: "Rua, número, bairro",
    section: "enderecos",
    order: 13,
  },
  {
    field_key: "commercial_phone",
    label: "Telefone Comercial",
    type: "tel",
    required: false,
    placeholder: "(00) 0000-0000",
    section: "contatos",
    order: 14,
  },
  {
    field_key: "mobile_phone",
    label: "Celular",
    type: "tel",
    required: false,
    placeholder: "(00) 00000-0000",
    section: "contatos",
    order: 15,
  },
];

export const PARTICIPANT_FIELD_MAP = {
  name: "professional_name",
  cpf: "professional_cpf",
  rg: "professional_rg",
  email: "professional_email",
  sector: "professional_sector",
  registration: "professional_registration",
  professional_formation: "professional_formation",
  institution: "institution",
  state: "state",
  health_region: "health_region",
  municipality: "municipality",
  unit_name: "unit_name",
  position: "position",
  work_address: "work_address",
  residential_address: "residential_address",
  commercial_phone: "commercial_phone",
  mobile_phone: "mobile_phone",
};

const normalizeEnrollmentText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const BRAZIL_STATE_UF = new Set([
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
]);

const BRAZIL_STATE_NAMES = new Set([
  "acre",
  "alagoas",
  "amapa",
  "amazonas",
  "bahia",
  "ceara",
  "distrito federal",
  "espirito santo",
  "goias",
  "maranhao",
  "mato grosso",
  "mato grosso do sul",
  "minas gerais",
  "para",
  "paraiba",
  "parana",
  "pernambuco",
  "piaui",
  "rio de janeiro",
  "rio grande do norte",
  "rio grande do sul",
  "rondonia",
  "roraima",
  "santa catarina",
  "sao paulo",
  "sergipe",
  "tocantins",
]);

const getEnrollmentFieldDescriptor = (field) =>
  [
    normalizeEnrollmentText(field?.label),
    normalizeEnrollmentText(field?.placeholder),
  ]
    .filter(Boolean)
    .join(" ");

const includesAnyToken = (base, tokens) => {
  if (!base) return false;
  return tokens.some((token) => base.includes(token));
};

const isStateValue = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const upper = raw.toUpperCase();
  if (BRAZIL_STATE_UF.has(upper)) return true;
  const normalized = normalizeEnrollmentText(raw);
  return BRAZIL_STATE_NAMES.has(normalized);
};

export const getEnrollmentFieldSemantic = (field) => {
  const key = String(field?.field_key || "").trim().toLowerCase();
  const descriptor = getEnrollmentFieldDescriptor(field);

  const hasMunicipalityDescriptor = includesAnyToken(descriptor, [
    "municipio",
    "cidade",
  ]);
  const hasGveDescriptor = includesAnyToken(descriptor, [
    "gve",
    "regional de saude",
    "regiao de saude",
    "vigilancia epidemiologica",
    "grupo de vigilancia epidemiologica",
  ]);
  const hasStateDescriptor = includesAnyToken(descriptor, [
    "estado",
    "uf",
    "unidade federativa",
  ]);

  if (hasMunicipalityDescriptor) return "municipality";
  if (hasGveDescriptor && !hasStateDescriptor) return "gve";
  if (hasStateDescriptor && !hasGveDescriptor) return "state";

  if (key === "municipality" || key.includes("municip")) return "municipality";
  if (key === "health_region" || key.includes("gve") || key.includes("regional")) {
    return hasStateDescriptor && !hasGveDescriptor ? "state" : "gve";
  }
  if (key === "state" || key === "uf" || key.includes("estado") || key.includes("state")) {
    return hasGveDescriptor && !hasStateDescriptor ? "gve" : "state";
  }
  return null;
};

export const resolveParticipantFieldFromEnrollmentField = (field) => {
  const semantic = getEnrollmentFieldSemantic(field);
  if (semantic === "gve") return "health_region";
  if (semantic === "state") return "state";
  if (semantic === "municipality") return "municipality";

  const key = String(field?.field_key || "").trim().toLowerCase();
  return PARTICIPANT_FIELD_MAP[key] || null;
};

export const normalizeParticipantRegionFields = ({
  state,
  health_region,
  municipality,
  getGveByMunicipio,
}) => {
  let nextState = String(state ?? "").trim();
  let nextHealthRegion = String(health_region ?? "").trim();
  const nextMunicipality = String(municipality ?? "").trim();
  const mappedGve = String(
    typeof getGveByMunicipio === "function"
      ? getGveByMunicipio(nextMunicipality)
      : ""
  ).trim();

  if (mappedGve) {
    const stateBefore = nextState;
    const healthBefore = nextHealthRegion;
    const normalizedState = normalizeEnrollmentText(stateBefore);
    const normalizedHealth = normalizeEnrollmentText(healthBefore);
    const normalizedMapped = normalizeEnrollmentText(mappedGve);
    const healthMatchesState =
      normalizedState && normalizedHealth && normalizedHealth === normalizedState;
    const stateLooksLikeGve =
      Boolean(stateBefore) &&
      (normalizedState === normalizedMapped ||
        stateBefore.toLowerCase().includes("gve"));
    const healthLooksLikeState = isStateValue(healthBefore);

    if (!healthBefore || healthMatchesState || (stateLooksLikeGve && healthLooksLikeState)) {
      nextHealthRegion = mappedGve;
    }
    if (stateLooksLikeGve && healthLooksLikeState) {
      nextState = healthBefore;
    }
  }

  return {
    state: nextState,
    health_region: nextHealthRegion,
    municipality: nextMunicipality,
  };
};

export const formatSectionLabel = (value) => {
  if (!value) return "";
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const formatCpf = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})/, "$1-$2")
    .replace(/(-\d{2})\d+?$/, "$1");
};

export const formatPhone = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
};

export const formatRg = (value) => {
  const cleaned = String(value ?? "").replace(/[^0-9xX]/g, "").slice(0, 12);
  return cleaned.toUpperCase();
};

export const formatPersonName = (value) => {
  const parts = String(value ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const lowerWords = new Set([
    "da",
    "de",
    "do",
    "das",
    "dos",
    "e",
    "a",
    "o",
    "as",
    "os",
    "em",
    "para",
    "por",
  ]);
  return parts
    .map((word, index) => {
      if (index > 0 && lowerWords.has(word)) return word;
      return word
        .split("-")
        .map((segment) =>
          segment ? segment[0].toUpperCase() + segment.slice(1) : segment
        )
        .join("-");
    })
    .join(" ");
};

export const formatEnrollmentFieldValue = (field, value, options = {}) => {
  if (!value) return value;
  const { liveInput = false } = options;
  const key = String(field?.field_key || "").toLowerCase();
  if (key === "name") {
    return liveInput ? String(value ?? "") : formatPersonName(value);
  }
  if (key.includes("cpf")) return formatCpf(value);
  if (key.includes("rg")) return formatRg(value);
  if (
    field?.type === "tel" ||
    key.includes("phone") ||
    key.includes("celular") ||
    key.includes("telefone")
  ) {
    return formatPhone(value);
  }
  return value;
};

export const isValidCpf = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(digits[i]) * (10 - i);
  }
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) {
    sum += Number(digits[i]) * (11 - i);
  }
  check = (sum * 10) % 11;
  if (check === 10) check = 0;
  return check === Number(digits[10]);
};

export const orderEnrollmentFields = (fields) => {
  const sorted = [...(fields || [])].sort((a, b) => {
    const orderA = Number.isFinite(Number(a?.order)) ? Number(a.order) : 0;
    const orderB = Number.isFinite(Number(b?.order)) ? Number(b.order) : 0;
    if (orderA !== orderB) return orderA - orderB;
    const labelA = String(a?.label || a?.field_key || "");
    const labelB = String(b?.label || b?.field_key || "");
    return labelA.localeCompare(labelB, "pt-BR", { sensitivity: "base" });
  });

  const seen = new Set();
  return sorted.filter((field) => {
    const key = String(field?.field_key || "").trim();
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
