import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { useGveMapping } from "@/hooks/useGveMapping";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  GraduationCap,
  Calendar,
  Clock,
  MapPin,
  User,
  CheckCircle,
  AlertCircle,
  Loader2,
  Video,
} from "lucide-react";
import { format } from "date-fns";
import { formatDateSafe, parseDateSafe } from "@/lib/date";

const defaultSections = [
  { key: "pessoais", label: "Dados Pessoais" },
  { key: "instituicao", label: "Instituição" },
  { key: "enderecos", label: "Endereços" },
  { key: "contatos", label: "Contatos" },
];

const defaultEnrollmentFields = [
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
    placeholder: "Unidade de saude",
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

const participantFieldMap = {
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

const formatSectionLabel = (value) => {
  if (!value) return "";
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatCpf = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})/, "$1-$2")
    .replace(/(-\d{2})\d+?$/, "$1");
};

const formatPhone = (value) => {
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

const formatRg = (value) => {
  const cleaned = String(value ?? "").replace(/[^0-9xX]/g, "").slice(0, 12);
  return cleaned.toUpperCase();
};

const formatPersonName = (value) => {
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

const formatFieldValue = (field, value, options = {}) => {
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

const isValidCpf = (value) => {
  const cpfDigits = String(value || "").replace(/\D/g, "");
  if (cpfDigits.length !== 11 || /^(\d)\1+$/.test(cpfDigits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpfDigits[i]) * (10 - i);
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(cpfDigits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpfDigits[i]) * (11 - i);
  check = (sum * 10) % 11;
  if (check === 10) check = 0;
  return check === Number(cpfDigits[10]);
};

export default function PublicEnrollment() {
  const queryString =
    window.location.search || window.location.hash.split("?")[1] || "";
  const urlParams = new URLSearchParams(queryString);
  const trainingId = urlParams.get("training");

  const [formData, setFormData] = useState(
    /** @type {Record<string, any>} */ ({})
  );
  const [submitted, setSubmitted] = useState(false);
  const [formErrors, setFormErrors] = useState(
    /** @type {Record<string, string | null>} */ ({})
  );
  const { municipalityOptions, getGveByMunicipio } = useGveMapping();

  const { data: training, isLoading } = useQuery({
    queryKey: ["training", trainingId],
    queryFn: async () => {
      const trainings = await dataClient.entities.Training.list();
      return trainings.find((item) => item.id === trainingId);
    },
    enabled: !!trainingId,
  });

  const { data: enrollmentFields = [] } = useQuery({
    queryKey: ["enrollment-fields-public", trainingId],
    queryFn: async () => {
      const allFields = await dataClient.entities.EnrollmentField.list("order");
      return allFields.filter(
        (field) => !field.training_id || field.training_id === trainingId
      );
    },
    enabled: !!trainingId,
  });

  const trainingDates = useMemo(() => {
    const list = Array.isArray(training?.dates) ? [...training.dates] : [];
    return list.sort((a, b) => {
      const dateA = parseDateSafe(a?.date);
      const dateB = parseDateSafe(b?.date);
      const timeA = Number.isNaN(dateA.getTime()) ? 0 : dateA.getTime();
      const timeB = Number.isNaN(dateB.getTime()) ? 0 : dateB.getTime();
      return timeA - timeB;
    });
  }, [training?.dates]);

  const activeEnrollmentFields = useMemo(
    () =>
      enrollmentFields
        .filter((field) => field.is_active)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [enrollmentFields]
  );

  const templateFields =
    activeEnrollmentFields.length > 0
      ? activeEnrollmentFields
      : defaultEnrollmentFields;

  const orderedTemplateFields = useMemo(() => {
    const sorted = [...templateFields].sort((a, b) => {
      const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
      const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;
      if (orderA !== orderB) return orderA - orderB;
      const labelA = String(a.label || a.field_key || "");
      const labelB = String(b.label || b.field_key || "");
      return labelA.localeCompare(labelB, "pt-BR", { sensitivity: "base" });
    });
    const seen = new Set();
    return sorted.filter((field) => {
      const key = String(field.field_key || "").trim();
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [templateFields]);

  const sections = useMemo(() => {
    const seen = new Set();
    const list = [];

    defaultSections.forEach((section) => {
      if (seen.has(section.key)) return;
      seen.add(section.key);
      list.push(section);
    });

    orderedTemplateFields.forEach((field) => {
      const key = String(field.section || "").trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      list.push({ key, label: formatSectionLabel(key) });
    });

    return list;
  }, [orderedTemplateFields]);

  const sectionOrder = useMemo(
    () => sections.map((section) => section.key),
    [sections]
  );

  const sectionLabels = useMemo(
    () =>
      sections.reduce((acc, section) => {
        acc[section.key] = section.label || formatSectionLabel(section.key);
        return acc;
      }, {}),
    [sections]
  );

  const fieldsBySection = useMemo(
    () =>
      sectionOrder.reduce((acc, section) => {
        acc[section] = orderedTemplateFields.filter(
          (field) => (field.section || "pessoais") === section
        );
        return acc;
      }, {}),
    [sectionOrder, orderedTemplateFields]
  );

  useEffect(() => {
    if (!orderedTemplateFields.length) return;
    setFormData((prev) => {
      const next = {};
      orderedTemplateFields.forEach((field) => {
        const key = String(field.field_key || "").trim();
        if (!key) return;
        next[key] = prev[key] ?? "";
      });
      return next;
    });
  }, [orderedTemplateFields]);

  const enrollMutation = useMutation({
    mutationFn: async (/** @type {Record<string, any>} */ data) => {
      const normalizedCpf = String(data.cpf || "").trim();
      if (normalizedCpf) {
        const existing = await dataClient.entities.TrainingParticipant.filter({
          training_id: trainingId,
          professional_cpf: normalizedCpf,
        });
        if (existing && existing.length > 0) {
          throw new Error("CPF já inscrito neste treinamento");
        }
      }

      if (
        training.max_participants &&
        training.participants_count >= training.max_participants
      ) {
        throw new Error("Treinamento com vagas esgotadas");
      }

      const firstDate =
        trainingDates.length > 0
          ? String(trainingDates[0]?.date || "").trim()
          : "";
      const baseDate =
        (firstDate && parseDateSafe(firstDate)) || parseDateSafe(training?.date);
      const validityDate =
        training.validity_months &&
        baseDate &&
        !Number.isNaN(baseDate.getTime())
          ? format(
              new Date(
                new Date(baseDate).setMonth(
                  baseDate.getMonth() + training.validity_months
                )
              ),
              "yyyy-MM-dd"
            )
          : null;

      const mapped = {};
      Object.entries(data).forEach(([fieldKey, fieldValue]) => {
        const participantKey = participantFieldMap[fieldKey];
        if (!participantKey) return;
        mapped[participantKey] = fieldValue;
      });

      await dataClient.entities.TrainingParticipant.create({
        training_id: trainingId,
        training_title: training.title,
        training_date: firstDate || null,
        professional_name: mapped.professional_name || "",
        professional_cpf: mapped.professional_cpf || "",
        professional_rg: mapped.professional_rg || "",
        professional_email: mapped.professional_email || "",
        professional_sector: mapped.professional_sector || "",
        professional_registration: mapped.professional_registration || "",
        professional_formation: mapped.professional_formation || "",
        institution: mapped.institution || "",
        state: mapped.state || "",
        health_region: mapped.health_region || "",
        municipality: mapped.municipality || "",
        unit_name: mapped.unit_name || "",
        position: mapped.position || "",
        work_address: mapped.work_address || "",
        residential_address: mapped.residential_address || "",
        commercial_phone: mapped.commercial_phone || "",
        mobile_phone: mapped.mobile_phone || "",
        enrollment_status: "inscrito",
        enrollment_date: new Date().toISOString(),
        attendance_records: [],
        attendance_percentage: 0,
        approved: false,
        certificate_issued: false,
        validity_date: validityDate,
      });

      await dataClient.entities.Training.update(trainingId, {
        participants_count: (training.participants_count || 0) + 1,
      });
    },
    onSuccess: () => {
      setSubmitted(true);
    },
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    const errors = /** @type {Record<string, string | null>} */ ({});

    orderedTemplateFields.forEach((field) => {
      const rawValue = formData[field.field_key];
      const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;

      if (field.required && !value) {
        errors[field.field_key] = "Campo obrigatório.";
        return;
      }

      if (!value) return;

      const lowerKey = String(field.field_key || "").toLowerCase();
      const digits = String(value).replace(/\D/g, "");

      if (lowerKey.includes("cpf")) {
        if (!isValidCpf(value)) {
          errors[field.field_key] = "CPF inválido.";
        }
        return;
      }

      if (lowerKey.includes("rg")) {
        if (digits.length < 5 || digits.length > 12) {
          errors[field.field_key] = "RG inválido.";
        }
        return;
      }

      if (field.type === "email" || lowerKey.includes("email")) {
        const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
        if (!isValidEmail) {
          errors[field.field_key] = "E-mail inválido.";
        }
        return;
      }

      if (
        field.type === "tel" ||
        lowerKey.includes("phone") ||
        lowerKey.includes("celular")
      ) {
        if (digits.length < 10 || digits.length > 11) {
          errors[field.field_key] = "Telefone inválido.";
        }
      }
    });

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const normalizedFormData = { ...formData };
    orderedTemplateFields.forEach((field) => {
      const rawValue = formData[field.field_key];
      if (rawValue === undefined || rawValue === null) return;
      if (typeof rawValue !== "string") {
        normalizedFormData[field.field_key] = rawValue;
        return;
      }
      const trimmed = rawValue.trim();
      normalizedFormData[field.field_key] = trimmed
        ? formatFieldValue(field, trimmed)
        : "";
    });

    enrollMutation.mutate(normalizedFormData);
  };

  if (!trainingId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                Link de inscrição inválido. Entre em contato com o administrador.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!training) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                Treinamento não encontrado.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Inscrição Realizada!</h2>
              <p className="text-slate-600 mt-2">
                Sua inscrição foi confirmada com sucesso.
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 text-left space-y-2">
              <p className="text-sm text-slate-600">
                <strong>Treinamento:</strong> {training.title}
              </p>
              {trainingDates.length > 0 && (
                <div>
                  <p className="text-sm text-slate-600 font-semibold mb-1">Datas:</p>
                  {trainingDates.map((dateItem, index) => (
                    <p key={index} className="text-sm text-slate-600 pl-3">
                      • {formatDateSafe(dateItem.date)}
                      {dateItem.start_time && dateItem.end_time
                        ? ` - ${dateItem.start_time} às ${dateItem.end_time}`
                        : ""}
                    </p>
                  ))}
                </div>
              )}
              {training.location && (
                <p className="text-sm text-slate-600">
                  <strong>Local:</strong> {training.location}
                </p>
              )}
            </div>
            <p className="text-sm text-slate-500">
              Aguarde confirmação por e-mail. Compareça 15 minutos antes do horário.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isFullyBooked =
    training.max_participants &&
    training.participants_count >= training.max_participants;
  const isCancelled = training.status === "cancelado";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader className="bg-blue-600 text-white">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl">Inscricao em Treinamento</CardTitle>
                <p className="text-blue-100 text-sm mt-1">
                  Preencha os dados para confirmar sua participacao
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-6 space-y-6">
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-lg text-slate-900">{training.title}</h3>
              {training.code && (
                <p className="text-sm text-slate-600">Código: {training.code}</p>
              )}
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Datas e Horários:</p>
                {trainingDates.length > 0 ? (
                  trainingDates.map((dateItem, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 text-sm text-slate-700 pl-2"
                    >
                      <Calendar className="h-4 w-4 text-blue-600" />
                      <span>{formatDateSafe(dateItem.date)}</span>
                      {dateItem.start_time && dateItem.end_time && (
                        <>
                          <Clock className="h-4 w-4 text-blue-600" />
                          <span>{dateItem.start_time} - {dateItem.end_time}</span>
                        </>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    <span>Data a definir</span>
                  </div>
                )}
                {training.location && (
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <MapPin className="h-4 w-4 text-blue-600" />
                    {training.location}
                  </div>
                )}
                {training.online_link && (
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <Video className="h-4 w-4 text-blue-600" />
                    <span>Treinamento Online</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <User className="h-4 w-4 text-blue-600" />
                  Coordenador: {training.coordinator || "-"}
                </div>
              </div>
              {training.max_participants && (
                <p className="text-sm text-slate-600">
                  Vagas: {training.participants_count || 0} / {training.max_participants}
                </p>
              )}
            </div>

            {(isFullyBooked || isCancelled) && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  {isCancelled
                    ? "Este treinamento foi cancelado."
                    : "Vagas esgotadas para este treinamento."}
                </AlertDescription>
              </Alert>
            )}

            {enrollMutation.isError && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  {enrollMutation.error?.message || "Erro ao realizar inscricao."}
                </AlertDescription>
              </Alert>
            )}

            {!isFullyBooked && !isCancelled && (
              <form onSubmit={handleSubmit} className="space-y-6">
                {municipalityOptions.length > 0 && (
                  <datalist id="municipios-list">
                    {municipalityOptions.map((municipio) => (
                      <option key={municipio} value={municipio} />
                    ))}
                  </datalist>
                )}

                <div className="space-y-8">
                  {sectionOrder.map((section, index) => {
                    const sectionFields = fieldsBySection[section] || [];
                    if (!sectionFields.length) return null;

                    return (
                      <div key={section} className="space-y-4">
                        {index > 0 && <div className="border-t border-slate-200" />}
                        <h3 className="text-lg font-semibold text-slate-900">
                          {sectionLabels[section] || formatSectionLabel(section)}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {sectionFields.map((field) => {
                            const fieldKey = String(field.field_key || "");
                            const lowerKey = fieldKey.toLowerCase();
                            const isMunicipalityField =
                              lowerKey.includes("municipio") ||
                              lowerKey.includes("municipality");
                            const isGveField =
                              lowerKey === "health_region" ||
                              lowerKey.includes("gve") ||
                              lowerKey.includes("regional");
                            const resolvedGve = getGveByMunicipio(
                              formData.municipality
                            );
                            const fieldValue =
                              isGveField && resolvedGve
                                ? resolvedGve
                                : formData[fieldKey] || "";

                            return (
                              <div key={fieldKey} className="space-y-2">
                                <Label htmlFor={fieldKey}>
                                  {field.label || fieldKey}
                                  {field.required ? " *" : ""}
                                </Label>
                                <Input
                                  id={fieldKey}
                                  type={field.type || "text"}
                                  value={fieldValue}
                                  list={
                                    isMunicipalityField && municipalityOptions.length > 0
                                      ? "municipios-list"
                                      : undefined
                                  }
                                  readOnly={isGveField && Boolean(resolvedGve)}
                                  onChange={(e) => {
                                    const nextValue = formatFieldValue(
                                      field,
                                      e.target.value,
                                      { liveInput: true }
                                    );

                                    if (isMunicipalityField) {
                                      const gveValue = getGveByMunicipio(nextValue);
                                      setFormData((prev) => ({
                                        ...prev,
                                        [fieldKey]: nextValue,
                                        health_region: gveValue || prev.health_region,
                                      }));
                                      if (formErrors[fieldKey]) {
                                        setFormErrors((prev) => ({
                                          ...prev,
                                          [fieldKey]: null,
                                        }));
                                      }
                                      if (gveValue && formErrors.health_region) {
                                        setFormErrors((prev) => ({
                                          ...prev,
                                          health_region: null,
                                        }));
                                      }
                                      return;
                                    }

                                    setFormData((prev) => ({
                                      ...prev,
                                      [fieldKey]: nextValue,
                                    }));
                                    if (formErrors[fieldKey]) {
                                      setFormErrors((prev) => ({
                                        ...prev,
                                        [fieldKey]: null,
                                      }));
                                    }
                                  }}
                                  placeholder={field.placeholder || ""}
                                  required={Boolean(field.required)}
                                />
                                {formErrors[fieldKey] && (
                                  <p className="text-xs text-red-600">
                                    {formErrors[fieldKey]}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="submit"
                    disabled={enrollMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                  >
                    {enrollMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processando...
                      </>
                    ) : (
                      "Confirmar Inscrição"
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}