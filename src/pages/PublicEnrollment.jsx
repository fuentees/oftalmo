import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { useGveMapping } from "@/hooks/useGveMapping";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  DEFAULT_ENROLLMENT_FIELDS,
  DEFAULT_ENROLLMENT_SECTIONS,
  getEnrollmentFieldSemantic,
  formatEnrollmentFieldValue,
  formatSectionLabel,
  isValidCpf,
  normalizeParticipantRegionFields,
  orderEnrollmentFields,
  resolveParticipantFieldFromEnrollmentField,
} from "@/lib/enrollmentSchema";
import { DEFAULT_GOOGLE_CALENDAR_VISIBILITY } from "@/lib/googleCalendar";
import {
  loadProfessionalGoogleEmailStore,
  resolveProfessionalGoogleEmail,
} from "@/lib/professionalGoogleEmailStore";

export default function PublicEnrollment() {
  const resolveTrainingIdFromToken = async (rawToken) => {
    const token = String(rawToken || "").trim();
    if (!token) return "";
    // /s/:code — short code direto no banco
    if (token.startsWith("s-")) {
      const shortCode = token.slice(2).trim();
      if (!shortCode) return "";
      const trainings = await dataClient.entities.Training.filter({ short_code: shortCode });
      return String(trainings?.[0]?.id || "").trim();
    }
    if (token.startsWith("c-")) {
      const encoded = token.slice(2).trim();
      if (!encoded) return "";
      const separatorIndex = encoded.lastIndexOf("__");
      let code = encoded;
      if (separatorIndex > 0) {
        const explicitIdCandidate = encoded.slice(separatorIndex + 2).trim();
        if (/^[0-9a-f-]{16,}$/i.test(explicitIdCandidate)) {
          return explicitIdCandidate;
        }
      }
      if (!code) return "";
      const trainings = await dataClient.entities.Training.filter({ code });
      return String(trainings?.[0]?.id || "").trim();
    }
    return token;
  };

  const queryString =
    window.location.search || window.location.hash.split("?")[1] || "";
  const urlParams = new URLSearchParams(queryString);
  const resolveTrainingTokenFromPath = () => {
    if (typeof window === "undefined") return "";
    const path = String(window.location.pathname || "");
    const shortLinkMatch = path.match(/^\/i\/([^/?#]+)/i);
    if (shortLinkMatch?.[1]) {
      return decodeURIComponent(shortLinkMatch[1]);
    }
    // /s/:code — sem redirecionamento, resolve direto aqui
    const shortCodeMatch = path.match(/^\/s\/([^/?#]+)/i);
    if (shortCodeMatch?.[1]) {
      return `s-${decodeURIComponent(shortCodeMatch[1])}`;
    }
    return "";
  };
  const shortPathToken = resolveTrainingTokenFromPath();
  const queryTrainingId = String(urlParams.get("training") || "").trim();
  const [resolvedTrainingId, setResolvedTrainingId] = useState("");
  const isResolvingToken = !!shortPathToken && !resolvedTrainingId;
  const trainingId = resolvedTrainingId === "not_found" ? "" : (resolvedTrainingId || queryTrainingId);

  const [formData, setFormData] = useState(
    /** @type {Record<string, any>} */ ({})
  );
  const [submitted, setSubmitted] = useState(false);
  const [submissionFeedback, setSubmissionFeedback] = useState(
    /** @type {null | { type: "success" | "warning" | "info"; message: string }} */ (null)
  );
  const [formErrors, setFormErrors] = useState(
    /** @type {Record<string, string | null>} */ ({})
  );
  const [activeTab, setActiveTab] = useState("inscricao");
  const [showAllDates, setShowAllDates] = useState(false);
  const { municipalityOptions, getGveByMunicipio } = useGveMapping();

  const normalizeCpf = (value) => String(value ?? "").replace(/\D/g, "");

  const isDuplicateEnrollmentError = (error) => {
    const message = String(error?.message || "").toLowerCase();
    return (
      message.includes("cpf já inscrito") ||
      message.includes("cpf ja inscrito") ||
      message.includes("duplicate key") ||
      message.includes("already exists") ||
      message.includes("duplicate")
    );
  };

  useEffect(() => {
    let active = true;
    const resolveId = async () => {
      if (queryTrainingId) {
        if (active) setResolvedTrainingId(queryTrainingId);
        return;
      }
      if (!shortPathToken) {
        if (active) setResolvedTrainingId("");
        return;
      }
      try {
        const nextId = await resolveTrainingIdFromToken(shortPathToken);
        if (active) setResolvedTrainingId(nextId || "not_found");
      } catch {
        if (active) setResolvedTrainingId("not_found");
      }
    };
    resolveId();
    return () => {
      active = false;
    };
  }, [shortPathToken, queryTrainingId]);

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

  const { data: professionalGoogleEmailStore = { byProfessionalId: {}, byProfessionalEmail: {} } } =
    useQuery({
      queryKey: ["professional-google-email-store"],
      queryFn: loadProfessionalGoogleEmailStore,
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

  const hasPublishedProgram =
    Boolean(training?.program_published) &&
    trainingDates.some(
      (d) =>
        Array.isArray(d.sessions) &&
        d.sessions.some((s) => String(s?.title || s?.activity || "").trim())
    );

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
      : DEFAULT_ENROLLMENT_FIELDS;

  const orderedTemplateFields = useMemo(
    () =>
      orderEnrollmentFields(templateFields).filter(
        (field) => getEnrollmentFieldSemantic(field) !== "gve"
      ),
    [templateFields]
  );

  const eventMunicipalityLabel = useMemo(() => {
    const rawLocation = String(training?.location || "").trim();
    if (!rawLocation) return "Municipio a definir";
    const withoutGve = rawLocation
      .replace(/\bGVE\b[:\s-]*[0-9A-Za-z.-]*/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/[-|•,;:/]\s*$/g, "")
      .trim();
    const firstSegment = withoutGve.split(/[-|•]/)[0]?.trim();
    return firstSegment || withoutGve || "Municipio a definir";
  }, [training?.location]);

  const municipalityFieldKey = useMemo(() => {
    const field = orderedTemplateFields.find(
      (item) => getEnrollmentFieldSemantic(item) === "municipality"
    );
    return String(field?.field_key || "municipality").trim();
  }, [orderedTemplateFields]);

  const gveFieldKey = useMemo(() => {
    const field = orderedTemplateFields.find(
      (item) => getEnrollmentFieldSemantic(item) === "gve"
    );
    return String(field?.field_key || "health_region").trim();
  }, [orderedTemplateFields]);

  const getAutoGveByValues = (values) => {
    const municipalityValue = values?.[municipalityFieldKey];
    return getGveByMunicipio(municipalityValue);
  };

  const mapEnrollmentDataToParticipantFields = (sourceData = {}) => {
    const mapped = {};

    orderedTemplateFields.forEach((field) => {
      const participantKey = resolveParticipantFieldFromEnrollmentField(field);
      const fieldKey = String(field?.field_key || "").trim();
      if (!participantKey || !fieldKey) return;

      const value = sourceData[fieldKey];
      if (value === undefined || value === null || value === "") return;
      mapped[participantKey] = value;
    });

    const normalizedRegion = normalizeParticipantRegionFields({
      state: mapped.state,
      health_region: mapped.health_region,
      municipality: mapped.municipality,
      getGveByMunicipio,
    });

    return {
      ...mapped,
      ...normalizedRegion,
    };
  };

  const sections = useMemo(() => {
    const seen = new Set();
    const list = [];

    DEFAULT_ENROLLMENT_SECTIONS.forEach((section) => {
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

  const syncParticipantWithGoogleCalendar = async (participant) => {
    if (!training || !participant) return null;
    const attendeeEmail =
      resolveProfessionalGoogleEmail(professionalGoogleEmailStore, {
        professionalId: participant?.professional_id,
        professionalEmail: participant?.professional_email,
      }) || String(participant?.professional_email || "").trim();
    try {
      const response = await dataClient.integrations.Core.SyncGoogleCalendarEnrollment({
        operation: "upsert",
        training: {
          id: training.id,
          title: training.title,
          description: training.description,
          code: training.code,
          location: training.location,
          coordinator: training.coordinator,
          instructor: training.instructor,
          dates: trainingDates,
        },
        participant,
        attendee_email: attendeeEmail,
        visibility_options: DEFAULT_GOOGLE_CALENDAR_VISIBILITY,
      });
      if (response?.success === false && !response?.skipped) {
        return response?.error || response?.message || "Falha ao sincronizar agenda.";
      }
      return null;
    } catch (error) {
      return (
        error?.message ||
        "Falha ao sincronizar automaticamente o evento no Google Agenda."
      );
    }
  };

  const enrollMutation = useMutation({
    mutationFn: async (/** @type {Record<string, any>} */ data) => {
      const normalizedCpf = normalizeCpf(data.cpf);
      if (normalizedCpf) {
        const participants = await dataClient.entities.TrainingParticipant.filter(
          {
            training_id: trainingId,
          },
          "-enrollment_date"
        );
        const existing = (participants || []).filter(
          (participant) => normalizeCpf(participant?.professional_cpf) === normalizedCpf
        );
        if (existing.length > 0) {
          return {
            alreadyEnrolled: true,
            warningMessage: null,
          };
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

      const mapped = mapEnrollmentDataToParticipantFields(data);

      const customFields = {};
      orderedTemplateFields.forEach((field) => {
        const participantKey = resolveParticipantFieldFromEnrollmentField(field);
        const fieldKey = String(field?.field_key || "").trim();
        if (participantKey || !fieldKey) return;
        const value = data[fieldKey];
        if (value !== undefined && value !== null && value !== "") {
          customFields[fieldKey] = value;
        }
      });

      const participantPayload = {
        training_id: trainingId,
        training_title: training.title,
        training_date: firstDate || null,
        professional_name: mapped.professional_name || data.name || "",
        professional_cpf: mapped.professional_cpf || data.cpf || "",
        professional_rg: mapped.professional_rg || data.rg || "",
        professional_email: mapped.professional_email || data.email || "",
        professional_sector: mapped.professional_sector || data.sector || "",
        professional_registration:
          mapped.professional_registration || data.registration || "",
        professional_formation:
          mapped.professional_formation || data.professional_formation || "",
        institution: mapped.institution || data.institution || "",
        state: mapped.state || data.state || "",
        health_region: mapped.health_region || data.health_region || "",
        municipality: mapped.municipality || data.municipality || "",
        unit_name: mapped.unit_name || data.unit_name || "",
        position: mapped.position || data.position || "",
        work_address: mapped.work_address || data.work_address || "",
        residential_address:
          mapped.residential_address || data.residential_address || "",
        commercial_phone: mapped.commercial_phone || data.commercial_phone || "",
        mobile_phone: mapped.mobile_phone || data.mobile_phone || "",
        custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
        enrollment_status: "inscrito",
        enrollment_date: new Date().toISOString(),
        attendance_records: [],
        attendance_percentage: 0,
        approved: false,
        certificate_issued: false,
        validity_date: validityDate,
      };

      let createdParticipant = null;
      try {
        createdParticipant = await dataClient.entities.TrainingParticipant.create(
          participantPayload
        );
      } catch (error) {
        if (isDuplicateEnrollmentError(error)) {
          return {
            alreadyEnrolled: true,
            warningMessage: null,
          };
        }
        throw error;
      }

      let warningMessage = null;
      let emailSent = false;

      // E-mail de confirmação — não bloqueia o fluxo mas registra o resultado
      const recipientEmail = String(participantPayload.professional_email || "").trim();
      if (recipientEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
        try {
          const trainingDatesText = trainingDates.length > 0
            ? trainingDates.map(d => formatDateSafe(d.date)).filter(Boolean).join(", ")
            : formatDateSafe(training.date) || "";
          const locationText = [training.location, training.address].filter(Boolean).join(" — ");
          await dataClient.integrations.Core.SendEmail({
            to: recipientEmail,
            subject: `Confirmação de inscrição — ${training.title}`,
            body: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
                <h2 style="color:#1e40af">Inscrição confirmada!</h2>
                <p>Olá, <strong>${participantPayload.professional_name || "participante"}</strong>!</p>
                <p>Sua inscrição no treinamento abaixo foi registrada com sucesso.</p>
                <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:16px 0">
                  <p style="margin:4px 0"><strong>Treinamento:</strong> ${training.title}</p>
                  ${trainingDatesText ? `<p style="margin:4px 0"><strong>Data(s):</strong> ${trainingDatesText}</p>` : ""}
                  ${training.time ? `<p style="margin:4px 0"><strong>Horário:</strong> ${training.time}</p>` : ""}
                  ${locationText ? `<p style="margin:4px 0"><strong>Local:</strong> ${locationText}</p>` : ""}
                </div>
                <p style="color:#64748b;font-size:14px">Guarde este e-mail como comprovante de inscrição.</p>
              </div>
            `,
          });
          emailSent = true;
        } catch {
          // E-mail falhou, mas a inscrição foi registrada
        }
      }

      // Sincronização com Google — não pode bloquear a confirmação de inscrição
      try {
        await syncParticipantWithGoogleCalendar(createdParticipant);
      } catch {
        // Inscrição já registrada — falha no Google não impede a confirmação
      }

      return {
        alreadyEnrolled: false,
        warningMessage,
        emailSent,
        recipientEmail,
      };
    },
    onSuccess: (result) => {
      setSubmitted(true);
      if (result?.alreadyEnrolled) {
        setSubmissionFeedback({
          type: "info",
          message:
            "Este CPF já constava inscrito. Sua inscrição já está confirmada neste treinamento.",
        });
        return;
      }
      if (result?.warningMessage) {
        setSubmissionFeedback({
          type: "warning",
          message: result.warningMessage,
        });
        return;
      }
      setSubmissionFeedback({
        type: "success",
        message: "Inscrição confirmada com sucesso!",
      });
    },
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmissionFeedback(null);
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
        ? formatEnrollmentFieldValue(field, trimmed)
        : "";
    });

    const autoGve = getAutoGveByValues(normalizedFormData);
    if (autoGve && gveFieldKey && !normalizedFormData[gveFieldKey]) {
      normalizedFormData[gveFieldKey] = autoGve;
    }

    enrollMutation.mutate(normalizedFormData);
  };

  if (isResolvingToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

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
    const isAlreadyEnrolled = submissionFeedback?.type === "info";
    const hasWarning = submissionFeedback?.type === "warning";
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 50%, #d1fae5 100%)' }}>
        <Card className="max-w-lg w-full shadow-xl border-green-200">
          <CardContent className="pt-8 pb-8 text-center space-y-5">
            <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto shadow-lg">
              <CheckCircle className="h-14 w-14 text-white" />
            </div>
            <div className="space-y-1">
              <h2 className="text-3xl font-bold text-green-700">
                {isAlreadyEnrolled ? "Já Inscrito!" : "Inscrição Confirmada!"}
              </h2>
              <p className="text-slate-600 text-base">
                {submissionFeedback?.message || "Sua inscrição foi registrada com sucesso."}
              </p>
            </div>
            <div className="bg-white border border-green-100 rounded-xl p-5 text-left space-y-3 shadow-sm">
              <p className="text-sm font-semibold text-green-700 uppercase tracking-wide mb-2">Detalhes do Treinamento</p>
              <p className="text-sm text-slate-700">
                <strong>Treinamento:</strong> {training.title}
              </p>
              {trainingDates.length > 0 && (
                <div>
                  <p className="text-sm text-slate-700 font-semibold mb-1">Datas:</p>
                  {trainingDates.map((dateItem, index) => (
                    <p key={index} className="text-sm text-slate-600 pl-3">
                      • {formatDateSafe(dateItem.date)}
                      {dateItem.start_time && dateItem.end_time
                        ? ` — ${dateItem.start_time} às ${dateItem.end_time}`
                        : ""}
                    </p>
                  ))}
                </div>
              )}
              {training.online_link ? (
                <p className="text-sm text-slate-700">
                  <strong>Modalidade:</strong> Treinamento on-line
                </p>
              ) : (
                <p className="text-sm text-slate-700">
                  <strong>Local:</strong> {eventMunicipalityLabel}
                </p>
              )}
            </div>
            {hasWarning && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
                {submissionFeedback.message}
              </p>
            )}
            <p className="text-sm font-medium text-green-600">
              ✅ Guarde esta tela como comprovante de inscrição.
            </p>
            <p className="text-xs text-slate-400">
              Compareça 15 minutos antes do horário previsto.
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
  const dateLabels = trainingDates
    .map((dateItem) => formatDateSafe(dateItem?.date))
    .filter(Boolean);
  const timeLabels = Array.from(
    new Set(
      trainingDates
        .map((dateItem) => {
          if (!dateItem?.start_time || !dateItem?.end_time) return null;
          return `${dateItem.start_time} - ${dateItem.end_time}`;
        })
        .filter(Boolean)
    )
  );

  const WEEKDAY_SHORT = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const WEEKDAY_PLURAL = ["domingos", "segundas-feiras", "terças-feiras", "quartas-feiras", "quintas-feiras", "sextas-feiras", "sábados"];

  const weekdayPattern = (() => {
    if (trainingDates.length < 3) return null;
    const days = trainingDates.map((d) => {
      const dt = parseDateSafe(d.date);
      return Number.isNaN(dt.getTime()) ? null : dt.getDay();
    }).filter((d) => d !== null);
    if (days.length < 3) return null;
    const unique = [...new Set(days)].sort((a, b) => a - b);
    if (!days.every((d) => unique.includes(d))) return null;
    if (unique.length === 1) {
      const d = unique[0];
      const count = days.filter((x) => x === d).length;
      if (count > 1) return (d === 0 || d === 6 ? "Todo " : "Toda ") + WEEKDAY_SHORT[d];
      return (d === 0 || d === 6 ? "No " : "Na ") + WEEKDAY_SHORT[d];
    }
    if (unique.length >= 2 && unique.length <= 4) {
      const labels = unique.map((d) => {
        const count = days.filter((x) => x === d).length;
        return count > 1 ? WEEKDAY_PLURAL[d] : WEEKDAY_SHORT[d];
      });
      const anyPlural = unique.some((d) => days.filter((x) => x === d).length > 1);
      const prefix = anyPlural ? "Às " : "À ";
      const last = labels.pop();
      return prefix + labels.join(", ") + " e " + last;
    }
    return null;
  })();

  const dateRange = trainingDates.length >= 2
    ? { first: formatDateSafe(trainingDates[0]?.date), last: formatDateSafe(trainingDates[trainingDates.length - 1]?.date) }
    : null;

  const manyDates = trainingDates.length > 2;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader className="text-white" style={{ background: "hsl(var(--primary))" }}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl">{training.title}</CardTitle>
                <p className="text-blue-100 text-sm mt-1">
                  Preencha os dados para confirmar sua participacao
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-6 space-y-6">
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              {manyDates ? (
                <>
                  {/* Card de datas — largura total */}
                  <div className="rounded-md border bg-white px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                      <Calendar className="h-4 w-4 text-blue-600" />
                      Datas
                    </div>
                    {weekdayPattern && (
                      <p className="text-base font-semibold text-blue-700 mb-1">{weekdayPattern}</p>
                    )}
                    {dateRange && (
                      <p className="text-xs text-slate-500 mb-3">
                        De {dateRange.first} até {dateRange.last} — {trainingDates.length} encontros
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {dateLabels.map((label, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs text-blue-700 font-medium"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Horário / Local / Coordenador — 3 colunas */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-md border bg-white px-3 py-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <Clock className="h-4 w-4 text-blue-600" />
                        Horário
                      </div>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                        {timeLabels.length > 0 ? timeLabels.join(" • ") : "Horário a definir"}
                      </p>
                    </div>

                    <div className="rounded-md border bg-white px-3 py-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        {training.online_link ? (
                          <Video className="h-4 w-4 text-blue-600" />
                        ) : (
                          <MapPin className="h-4 w-4 text-blue-600" />
                        )}
                        {training.online_link ? "Modalidade" : "Local"}
                      </div>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                        {training.online_link ? "Treinamento on-line" : eventMunicipalityLabel}
                      </p>
                    </div>

                    <div className="rounded-md border bg-white px-3 py-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <User className="h-4 w-4 text-blue-600" />
                        Coordenador
                      </div>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                        {training.coordinator || "-"}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                /* Layout original para ≤2 datas */
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="rounded-md border bg-white px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <Calendar className="h-4 w-4 text-blue-600" />
                      Datas
                    </div>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                      {dateLabels.length > 0 ? dateLabels.join(" • ") : "Data a definir"}
                    </p>
                  </div>

                  <div className="rounded-md border bg-white px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <Clock className="h-4 w-4 text-blue-600" />
                      Horário
                    </div>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                      {timeLabels.length > 0 ? timeLabels.join(" • ") : "Horário a definir"}
                    </p>
                  </div>

                  <div className="rounded-md border bg-white px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      {training.online_link ? (
                        <Video className="h-4 w-4 text-blue-600" />
                      ) : (
                        <MapPin className="h-4 w-4 text-blue-600" />
                      )}
                      {training.online_link ? "Modalidade" : "Local"}
                    </div>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                      {training.online_link ? "Treinamento on-line" : eventMunicipalityLabel}
                    </p>
                  </div>

                  <div className="rounded-md border bg-white px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <User className="h-4 w-4 text-blue-600" />
                      Coordenador
                    </div>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                      {training.coordinator || "-"}
                    </p>
                  </div>
                </div>
              )}

              {training.max_participants && (
                <p className="text-sm text-slate-600">
                  Vagas: {training.participants_count || 0} / {training.max_participants}
                </p>
              )}
            </div>

            {hasPublishedProgram && (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="inscricao" className="gap-2">
                    <User className="h-3.5 w-3.5" />
                    Inscrição
                  </TabsTrigger>
                  <TabsTrigger value="programacao" className="gap-2">
                    <Calendar className="h-3.5 w-3.5" />
                    Programação
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            {hasPublishedProgram && activeTab === "programacao" && (
              <div className="space-y-4">
                {trainingDates
                  .filter(
                    (d) =>
                      Array.isArray(d.sessions) &&
                      d.sessions.some((s) => String(s?.title || s?.activity || "").trim())
                  )
                  .map((dateItem, i) => (
                    <div key={i} className="rounded-lg border bg-white overflow-hidden">
                      <div className="bg-blue-50 px-4 py-3 border-b flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-blue-600" />
                        <span className="font-semibold text-slate-800">
                          {formatDateSafe(dateItem.date)}
                        </span>
                        {dateItem.start_time && (
                          <span className="text-sm text-slate-500 ml-auto">
                            {dateItem.start_time}
                            {dateItem.end_time ? ` – ${dateItem.end_time}` : ""}
                          </span>
                        )}
                      </div>
                      <div className="divide-y">
                        {dateItem.sessions
                          .filter((s) => String(s?.title || s?.activity || "").trim())
                          .map((session, j) => (
                            <div key={j} className="px-4 py-3 flex gap-3">
                              <div className="text-xs text-slate-500 w-28 shrink-0 pt-0.5">
                                {session.start_time && session.end_time
                                  ? `${session.start_time} – ${session.end_time}`
                                  : session.start_time || ""}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-slate-800">
                                  {session.title || session.activity}
                                </p>
                                {(session.speaker_name || session.responsible) && (
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    {session.speaker_name || session.responsible}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {(!hasPublishedProgram || activeTab === "inscricao") && (isFullyBooked || isCancelled) && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  {isCancelled
                    ? "Este treinamento foi cancelado."
                    : "Vagas esgotadas para este treinamento."}
                </AlertDescription>
              </Alert>
            )}

            {(!hasPublishedProgram || activeTab === "inscricao") && enrollMutation.isError && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  {enrollMutation.error?.message || "Erro ao realizar inscricao."}
                </AlertDescription>
              </Alert>
            )}

            {(!hasPublishedProgram || activeTab === "inscricao") && !isFullyBooked && !isCancelled && (
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
                            const fieldSemantic = getEnrollmentFieldSemantic(field);
                            const isMunicipalityField = fieldSemantic === "municipality";
                            const isGveField = fieldSemantic === "gve";
                            const resolvedGve = getAutoGveByValues(formData);
                            const fieldValue =
                              isGveField && resolvedGve
                                ? resolvedGve
                                : formData[fieldKey] || "";

                            const handleFieldChange = (nextValue) => {
                              if (isMunicipalityField) {
                                const gveValue = getGveByMunicipio(nextValue);
                                setFormData((prev) => {
                                  const next = { ...prev, [fieldKey]: nextValue };
                                  if (gveFieldKey) next[gveFieldKey] = gveValue || prev[gveFieldKey];
                                  return next;
                                });
                                if (formErrors[fieldKey]) setFormErrors((prev) => ({ ...prev, [fieldKey]: null }));
                                if (gveValue && gveFieldKey && formErrors[gveFieldKey]) setFormErrors((prev) => ({ ...prev, [gveFieldKey]: null }));
                                return;
                              }
                              setFormData((prev) => ({ ...prev, [fieldKey]: nextValue }));
                              if (formErrors[fieldKey]) setFormErrors((prev) => ({ ...prev, [fieldKey]: null }));
                            };

                            return (
                              <div key={fieldKey} className="space-y-2">
                                <Label htmlFor={fieldKey}>
                                  {field.label || fieldKey}
                                  {field.required ? " *" : ""}
                                </Label>
                                {field.type === "boolean" ? (
                                  <div className="flex gap-6 pt-1">
                                    {["Sim", "Não"].map((option) => (
                                      <label key={option} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                                        <input
                                          type="radio"
                                          name={fieldKey}
                                          value={option}
                                          checked={fieldValue === option}
                                          onChange={() => handleFieldChange(option)}
                                          required={Boolean(field.required) && !fieldValue}
                                          className="accent-blue-600"
                                        />
                                        {option}
                                      </label>
                                    ))}
                                  </div>
                                ) : field.type === "select" && Array.isArray(field.options) && field.options.length > 0 ? (
                                  <select
                                    id={fieldKey}
                                    value={fieldValue}
                                    onChange={(e) => handleFieldChange(e.target.value)}
                                    required={Boolean(field.required)}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    <option value="">{field.placeholder || "Selecione..."}</option>
                                    {field.options.map((opt) => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                ) : (
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
                                    onChange={(e) => handleFieldChange(
                                      formatEnrollmentFieldValue(field, e.target.value, { liveInput: true })
                                    )}
                                    placeholder={field.placeholder || ""}
                                    required={Boolean(field.required)}
                                  />
                                )}
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
                    className="w-full sm:w-auto text-white" style={{ background: "hsl(var(--primary))" }}
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