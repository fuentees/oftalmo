import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { format, addMonths } from "date-fns";
import {
  generateParticipantCertificate,
  generateCoordinatorCertificate,
  generateMonitorCertificate,
  generateSpeakerCertificate,
  generateParticipantCertificateWordBlob,
  generateCoordinatorCertificateWordBlob,
  generateMonitorCertificateWordBlob,
  generateSpeakerCertificateWordBlob,
} from "./CertificateGenerator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Mail, CheckCircle, Award, Printer, Eye, Loader2, ArrowUpDown, ArrowUp, ArrowDown, FileDown, FileText } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DEFAULT_CERTIFICATE_EMAIL_TEMPLATE,
  resolveCertificateEmailTemplate,
  interpolateEmailTemplate,
  buildCertificateEmailData,
} from "@/lib/certificateEmailTemplate";
import {
  DEFAULT_CERTIFICATE_TEMPLATE_MODEL_ID,
  listCertificateTemplateModels,
  resolveCertificateTemplateByModel,
} from "@/lib/certificateTemplate";
import { isRepadronizacaoTraining } from "@/lib/trainingType";
import {
  normalizeParticipantEmail,
  normalizeParticipantRg,
  normalizeParticipantText,
  resolveTrainingParticipantMatch,
} from "@/lib/trainingParticipantMatch";
import {
  TRACOMA_TOTAL_QUESTIONS,
  buildAnswerKeyCollections,
  computeTracomaKappaMetrics,
  normalizeAnswerKeyCode,
  normalizeBinaryAnswer,
} from "@/lib/tracomaExamKappa";

const REPAD_APPROVAL_KAPPA = 0.7;
const toNumeric = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const formatScore = (value, digits = 1) =>
  Number.isFinite(value) ? Number(value).toFixed(digits).replace(".", ",") : "-";
const parseStoredAnswers = (value) => {
  const asArray = Array.isArray(value) ? value : null;
  if (!asArray || asArray.length !== TRACOMA_TOTAL_QUESTIONS) return null;
  const parsed = asArray.map((item) => normalizeBinaryAnswer(item));
  if (parsed.some((item) => item === null)) return null;
  return parsed;
};
const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const CERT_TEMPLATE_SCOPE_GLOBAL = DEFAULT_CERTIFICATE_TEMPLATE_MODEL_ID;
const STAFF_ROLE_LABELS = {
  coordenador: "Coordenador",
  monitor: "Monitor",
  palestrante: "Palestrante",
};
const EMAIL_SPLIT_REGEX = /[;,\n]+/;
const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const normalizeEmailToken = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const bracketMatch = raw.match(/<([^>]+)>/);
  if (bracketMatch?.[1]) {
    return String(bracketMatch[1]).trim().toLowerCase();
  }
  return raw;
};
const toSafeFileName = (value, fallback = "certificado") => {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return normalized || fallback;
};
const downloadBlob = (blob, fileName) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};
const resolveSingleRecipientEmail = (value) => {
  const rawList = Array.isArray(value) ? value.join(",") : String(value || "");
  const candidates = rawList
    .split(EMAIL_SPLIT_REGEX)
    .map((item) => normalizeEmailToken(item))
    .filter(Boolean);
  const uniqueCandidates = Array.from(new Set(candidates));
  const validCandidates = uniqueCandidates.filter((item) =>
    SIMPLE_EMAIL_REGEX.test(item)
  );
  return {
    email: validCandidates[0] || "",
    provided: uniqueCandidates.length > 0,
    hasMultiple: validCandidates.length > 1,
    hasInvalid: uniqueCandidates.some((item) => !SIMPLE_EMAIL_REGEX.test(item)),
  };
};
const normalizeAttendanceRecords = (value) => {
  if (Array.isArray(value)) {
    return value.filter((item) => item && typeof item === "object");
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => item && typeof item === "object");
      }
    } catch {
      return [];
    }
  }
  return [];
};
const resolveAttendancePercentage = ({
  participant,
  attendanceRecords,
  totalTrainingDates,
}) => {
  const parsedPercentage = toNumeric(participant?.attendance_percentage);
  if (Number.isFinite(parsedPercentage)) {
    const normalizedPercentage =
      parsedPercentage > 0 && parsedPercentage <= 1
        ? parsedPercentage * 100
        : parsedPercentage;
    return clamp(normalizedPercentage, 0, 100);
  }
  if (!attendanceRecords.length) return null;
  const presentCount = attendanceRecords.filter(
    (record) =>
      String(record?.status || "")
        .trim()
        .toLowerCase() === "presente"
  ).length;
  const denominator =
    totalTrainingDates > 0 ? totalTrainingDates : attendanceRecords.length;
  if (!denominator) return null;
  return clamp((presentCount / denominator) * 100, 0, 100);
};

const normalizeStaffEntries = (value) => {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((item) => {
      if (typeof item === "string") {
        const name = item.trim();
        if (!name) return null;
        return { name, email: "", rg: "", cpf: "", lecture: "" };
      }
      if (!item || typeof item !== "object") return null;
      const name = String(item?.name || "").trim();
      if (!name) return null;
      return {
        professional_id: String(item?.professional_id || "").trim(),
        name,
        email: String(item?.email || "").trim(),
        rg: String(item?.rg || "").trim(),
        cpf: String(item?.cpf || "").trim(),
        document: String(item?.document || item?.documento || "").trim(),
        lecture: String(item?.lecture || "").trim(),
      };
    })
    .filter(Boolean);
};

const normalizeComparableText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const formatTrainingDateLabel = (value) => {
  if (!value) return "";
  try {
    return format(new Date(`${String(value).slice(0, 10)}T00:00:00`), "dd/MM/yyyy");
  } catch {
    return String(value || "").trim();
  }
};

const formatTimeRange = (start, end) => {
  const startTime = String(start || "").trim();
  const endTime = String(end || "").trim();
  if (startTime && endTime) return `${startTime} - ${endTime}`;
  return startTime || endTime || "";
};

export default function CertificateManager({ training, participants = [], onClose }) {
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [previewParticipantId, setPreviewParticipantId] = useState("");
  const [sortConfig, setSortConfig] = useState({ field: null, direction: "asc" });
  const [previewTeamRecipientId, setPreviewTeamRecipientId] = useState("");
  const [selectedTemplateScope, setSelectedTemplateScope] = useState(
    CERT_TEMPLATE_SCOPE_GLOBAL
  );
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  
  const queryClient = useQueryClient();
  const certificateEmailTemplateQuery = useQuery({
    queryKey: ["certificateEmailTemplate"],
    queryFn: () => resolveCertificateEmailTemplate(),
    enabled: true,
  });
  const emailTemplate =
    certificateEmailTemplateQuery.data || DEFAULT_CERTIFICATE_EMAIL_TEMPLATE;
  const safeParticipants = Array.isArray(participants) ? participants : [];
  const isRepadTraining = isRepadronizacaoTraining(training);

  const tracomaResultsQuery = useQuery({
    queryKey: ["certificateManagerTracomaResults", training?.id],
    queryFn: () =>
      dataClient.entities.TracomaExamResult.filter(
        { training_id: training?.id },
        "-created_at"
      ),
    enabled: Boolean(training?.id && isRepadTraining),
  });
  const answerKeyRowsQuery = useQuery({
    queryKey: ["certificateManagerTracomaAnswerKeys"],
    queryFn: () => dataClient.entities.TracomaExamAnswerKey.list("question_number"),
    enabled: Boolean(training?.id && isRepadTraining),
  });
  const certificateModelsQuery = useQuery({
    queryKey: ["certificate-template-models"],
    queryFn: () => listCertificateTemplateModels(),
    enabled: true,
  });

  const useRepadScoreCriteria = isRepadTraining;
  const totalTrainingDates = Array.isArray(training?.dates)
    ? training.dates.filter((dateItem) => dateItem?.date).length
    : 0;

  const coordinatorRecipient = useMemo(() => {
    const name = String(training?.coordinator || "").trim();
    const email = String(training?.coordinator_email || "").trim();
    const rg = String(training?.coordinator_rg || "").trim();
    if (!name) return null;
    return {
      id: "coordenador",
      role: "coordenador",
      name,
      email,
      rg,
      lecture: "",
    };
  }, [training?.coordinator, training?.coordinator_email, training?.coordinator_rg]);

  const monitorRecipients = useMemo(
    () =>
      normalizeStaffEntries(training?.monitors).map((item, index) => ({
        id: `monitor-${index}`,
        role: "monitor",
        ...item,
      })),
    [training?.monitors]
  );

  const speakerRecipients = useMemo(
    () =>
      normalizeStaffEntries(training?.speakers).map((item, index) => ({
        id: `palestrante-${index}`,
        role: "palestrante",
        ...item,
      })),
    [training?.speakers]
  );

  const scheduleSessionsByStaff = useMemo(() => {
    const map = new Map();
    const addSession = (session, dateItem) => {
      const name = String(session?.speaker_name || "").trim();
      const email = String(session?.professional_email || "").trim().toLowerCase();
      const professionalId = String(session?.professional_id || "").trim();
      const keys = [
        professionalId ? `id:${professionalId}` : "",
        email ? `email:${email}` : "",
        name ? `name:${normalizeComparableText(name)}` : "",
      ].filter(Boolean);
      if (!keys.length) return;
      const item = {
        title: String(session?.title || "").trim(),
        date: String(dateItem?.date || "").trim(),
        start_time: String(session?.start_time || dateItem?.start_time || "").trim(),
        end_time: String(session?.end_time || dateItem?.end_time || "").trim(),
      };
      keys.forEach((key) => {
        const current = map.get(key) || [];
        current.push(item);
        map.set(key, current);
      });
    };

    (Array.isArray(training?.dates) ? training.dates : []).forEach((dateItem) => {
      (Array.isArray(dateItem?.sessions) ? dateItem.sessions : []).forEach((session) =>
        addSession(session, dateItem)
      );
    });
    return map;
  }, [training?.dates]);

  const enrichStaffRecipient = (recipient) => {
    const professionalId = String(recipient?.professional_id || "").trim();
    const email = String(recipient?.email || "").trim().toLowerCase();
    const name = normalizeComparableText(recipient?.name);
    const sessions =
      (professionalId && scheduleSessionsByStaff.get(`id:${professionalId}`)) ||
      (email && scheduleSessionsByStaff.get(`email:${email}`)) ||
      (name && scheduleSessionsByStaff.get(`name:${name}`)) ||
      [];
    const lectureTitles = Array.from(
      new Set(
        sessions
          .map((session) => session.title)
          .filter(Boolean)
      )
    );
    const dates = Array.from(
      new Set(sessions.map((session) => formatTrainingDateLabel(session.date)).filter(Boolean))
    );
    const times = Array.from(
      new Set(
        sessions
          .map((session) => formatTimeRange(session.start_time, session.end_time))
          .filter(Boolean)
      )
    );
    return {
      ...recipient,
      lecture: String(recipient?.lecture || "").trim() || lectureTitles.join("; "),
      lecture_date: dates.join(", "),
      lecture_time: times.join(", "),
      lecture_details: sessions
        .map((session) =>
          [
            formatTrainingDateLabel(session.date),
            formatTimeRange(session.start_time, session.end_time),
            session.title,
          ]
            .filter(Boolean)
            .join(" - ")
        )
        .filter(Boolean)
        .join("; "),
    };
  };

  const teamRecipients = useMemo(
    () =>
      [
        ...(coordinatorRecipient ? [coordinatorRecipient] : []),
        ...monitorRecipients,
        ...speakerRecipients,
      ].map(enrichStaffRecipient).sort((a, b) => {
        const roleCompare = String(a.role).localeCompare(String(b.role), "pt-BR", {
          sensitivity: "base",
        });
        if (roleCompare !== 0) return roleCompare;
        return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", {
          sensitivity: "base",
        });
      }),
    [coordinatorRecipient, monitorRecipients, speakerRecipients, scheduleSessionsByStaff]
  );
  const answerKeyByCode = useMemo(() => {
    const map = new Map();
    const collections = buildAnswerKeyCollections(
      Array.isArray(answerKeyRowsQuery.data) ? answerKeyRowsQuery.data : [],
      TRACOMA_TOTAL_QUESTIONS
    );
    collections.forEach((item) => {
      if (item?.answers && !item?.error) {
        map.set(item.code, item.answers);
      }
    });
    return map;
  }, [answerKeyRowsQuery.data]);

  const resolveParticipantForCertificate = (identity) => {
    const matched = resolveTrainingParticipantMatch(safeParticipants, identity);
    if (matched) return matched;

    const targetRg = normalizeParticipantRg(identity?.rg || identity?.cpf);
    if (targetRg) {
      const byRg = safeParticipants.find(
        (item) =>
          normalizeParticipantRg(
            item?.professional_rg || item?.professional_cpf
          ) === targetRg
      );
      if (byRg) return byRg;
    }

    const targetEmail = normalizeParticipantEmail(identity?.email);
    if (targetEmail) {
      const byEmail = safeParticipants.find(
        (item) =>
          normalizeParticipantEmail(item?.professional_email) === targetEmail
      );
      if (byEmail) return byEmail;
    }

    const targetName = normalizeParticipantText(identity?.name);
    if (targetName) {
      const byName = safeParticipants.find(
        (item) =>
          normalizeParticipantText(item?.professional_name) === targetName
      );
      if (byName) return byName;
    }

    return null;
  };

  const repadPerformanceByParticipantId = useMemo(() => {
    if (!useRepadScoreCriteria) return new Map();
    const map = new Map();
    const rows = Array.isArray(tracomaResultsQuery.data)
      ? [...tracomaResultsQuery.data]
      : [];
    rows.sort(
      (a, b) =>
        new Date(b?.created_at || 0).getTime() -
        new Date(a?.created_at || 0).getTime()
    );

    rows.forEach((row) => {
      const participant = resolveParticipantForCertificate({
        name: row?.participant_name,
        email: row?.participant_email,
        rg: row?.participant_cpf,
      });
      if (!participant?.id) return;
      if (map.has(participant.id)) return;

      const keyCode = normalizeAnswerKeyCode(row?.answer_key_code || "E2");
      const answerKey = answerKeyByCode.get(keyCode);
      const traineeAnswers = parseStoredAnswers(row?.answers);
      let computed = null;
      if (answerKey && traineeAnswers) {
        try {
          computed = computeTracomaKappaMetrics({
            answerKey,
            traineeAnswers,
          });
        } catch {
          computed = null;
        }
      }

      const sourceKappa = computed?.kappa ?? toNumeric(row?.kappa);
      const kappa = sourceKappa === null ? null : clamp(sourceKappa, 0, 1);
      const score = kappa === null ? null : kappa * 100;
      const statusText = String(
        computed?.aptitudeStatus || row?.aptitude_status || ""
      )
        .trim()
        .toLowerCase();
      const approved =
        statusText === "apto" ||
        (Number.isFinite(kappa) && kappa >= REPAD_APPROVAL_KAPPA);

      map.set(participant.id, {
        hasResult: true,
        approved,
        latestKappa: kappa,
        latestScore: score,
      });
    });

    return map;
  }, [
    answerKeyByCode,
    safeParticipants,
    tracomaResultsQuery.data,
    useRepadScoreCriteria,
  ]);

  const resolveEmailContent = (emailData) => {
    const subject = interpolateEmailTemplate(emailTemplate.subject, emailData).trim();
    const body = interpolateEmailTemplate(emailTemplate.body, emailData).trim();
    return {
      subject: subject || DEFAULT_CERTIFICATE_EMAIL_TEMPLATE.subject,
      body: body || DEFAULT_CERTIFICATE_EMAIL_TEMPLATE.body,
    };
  };

  const certificateModelOptions = useMemo(
    () => certificateModelsQuery.data || [],
    [certificateModelsQuery.data]
  );

  const selectedTemplateModel = useMemo(
    () =>
      certificateModelOptions.find((item) => item.id === selectedTemplateScope) ||
      null,
    [certificateModelOptions, selectedTemplateScope]
  );

  const resolveSelectedTemplateOverride = async () =>
    resolveCertificateTemplateByModel(selectedTemplateScope);

  React.useEffect(() => {
    setSelectedTemplateScope(CERT_TEMPLATE_SCOPE_GLOBAL);
    setPreviewParticipantId("");
    setPreviewTeamRecipientId("");
  }, [training?.id]);

  const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
      if (!blob) {
        resolve("");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          resolve("");
          return;
        }
        const base64 = result.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Falha ao ler anexo."));
      reader.readAsDataURL(blob);
    });

  const buildStaffCertificatePayload = (recipient, fallbackEmail = "") => ({
    name: String(recipient?.name || "").trim(),
    email: fallbackEmail || String(recipient?.email || "").trim(),
    rg: String(recipient?.rg || "").trim(),
    cpf: String(recipient?.cpf || "").trim(),
    document: String(recipient?.document || "").trim(),
    professional_id: String(recipient?.professional_id || "").trim(),
    lecture: String(recipient?.lecture || "").trim(),
  });

  const resolveTeamWordGenerator = (role) => {
    if (role === "coordenador") return generateCoordinatorCertificateWordBlob;
    if (role === "monitor") return generateMonitorCertificateWordBlob;
    if (role === "palestrante") return generateSpeakerCertificateWordBlob;
    return null;
  };

  const buildTeamResultMessage = (results, roleLabel) => {
    const successCount = results.filter((item) => item.status === "success").length;
    const warningCount = results.filter((item) => item.status === "warning").length;
    const failCount = results.filter((item) => item.status === "error").length;
    const warningMessage = warningCount > 0 ? `, ${warningCount} aviso(s)` : "";
    const failMessage = failCount > 0 ? `, ${failCount} falha(s)` : "!";
    return {
      success: failCount === 0,
      message: `${successCount} certificado(s) de ${roleLabel} enviado(s)${warningMessage}${failMessage}`,
      details: results,
    };
  };

  const issueRoleCertificates = async ({
    recipients,
    roleLabel,
    emailRole,
    filePrefix,
    generator,
  }) => {
    if (!training) {
      throw new Error("Treinamento inválido para emissão de certificados.");
    }
    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new Error(`Nenhum ${roleLabel} cadastrado para emissão.`);
    }

    setProcessing(true);
    setResult(null);
    const templateOverride = await resolveSelectedTemplateOverride();
    const results = [];

    for (const recipient of recipients) {
      const recipientName = String(recipient?.name || "").trim();
      if (!recipientName) continue;
      const recipientEmailInfo = resolveSingleRecipientEmail(recipient?.email);
      const recipientEmail = recipientEmailInfo.email;
      const recipientRg = String(recipient?.rg || "").trim();
      const recipientCpf = String(recipient?.cpf || "").trim();
      const recipientDocument = String(recipient?.document || "").trim();
      const recipientLecture = String(recipient?.lecture || "").trim();

      try {
        const pdf = generator(
          buildStaffCertificatePayload(recipient, recipientEmail),
          training,
          templateOverride
        );
        const pdfBlob = pdf.output("blob");
        const safeName = recipientName.replace(/\s+/g, "_");
        const pdfFileName = `${filePrefix}-${safeName}.pdf`;
        const pdfFile = new File([pdfBlob], pdfFileName, {
          type: "application/pdf",
        });
        const attachmentBase64 = await blobToBase64(pdfBlob);
        if (!attachmentBase64) {
          throw new Error("Falha ao gerar anexo do certificado.");
        }
        const attachment = {
          filename: pdfFileName,
          contentType: "application/pdf",
          content: attachmentBase64,
        };

        await dataClient.integrations.Core.UploadFile({ file: pdfFile });

        const warnings = [];
        let emailError = "";
        if (recipientEmailInfo.hasMultiple && recipientEmail) {
          warnings.push(
            `Mais de um e-mail detectado; enviado apenas para ${recipientEmail}.`
          );
        }
        if (recipientEmailInfo.hasInvalid) {
          warnings.push("E-mail(s) inválido(s) foram ignorados.");
        }
        if (recipientEmail) {
          try {
            const emailData = buildCertificateEmailData({
              training,
              nome: recipientName,
              rg: recipientRg || recipientCpf || recipientDocument,
              role: emailRole,
              aula: recipientLecture || recipient?.lecture_details || "",
            });
            const emailContent = resolveEmailContent(emailData);
            await dataClient.integrations.Core.SendEmail({
              to: recipientEmail,
              subject: emailContent.subject,
              body: emailContent.body,
              attachments: [attachment],
            });
          } catch (error) {
            emailError = error.message || "Falha ao enviar e-mail.";
          }
        } else if (recipientEmailInfo.provided) {
          emailError = "E-mail inválido para envio automático.";
        } else {
          emailError = "Sem e-mail cadastrado para envio automático.";
        }

        if (emailError) {
          results.push({
            name: recipientName,
            status: "error",
            error: emailError,
            warning: warnings.join(" "),
          });
        } else {
          results.push({
            name: recipientName,
            status: warnings.length > 0 ? "warning" : "success",
            warning: warnings.join(" "),
          });
        }
      } catch (error) {
        results.push({
          name: recipientName,
          status: "error",
          error: error.message,
        });
      }
    }

    return results;
  };

  const issueCoordinatorCertificates = useMutation({
    mutationFn: async () =>
      issueRoleCertificates({
        recipients: coordinatorRecipient ? [coordinatorRecipient] : [],
        roleLabel: "coordenador",
        emailRole: "coordinator",
        filePrefix: "certificado-coordenador",
        generator: generateCoordinatorCertificate,
      }),
    onSuccess: (results) => {
      setProcessing(false);
      setResult(buildTeamResultMessage(results, "coordenador"));
    },
    onError: (error) => {
      setProcessing(false);
      setResult({ success: false, message: error.message });
    },
  });

  const issueMonitorCertificates = useMutation({
    mutationFn: async () =>
      issueRoleCertificates({
        recipients: monitorRecipients,
        roleLabel: "monitor",
        emailRole: "monitor",
        filePrefix: "certificado-monitor",
        generator: generateMonitorCertificate,
      }),
    onSuccess: (results) => {
      setProcessing(false);
      setResult(buildTeamResultMessage(results, "monitor"));
    },
    onError: (error) => {
      setProcessing(false);
      setResult({ success: false, message: error.message });
    },
  });

  const issueSpeakerCertificates = useMutation({
    mutationFn: async () =>
      issueRoleCertificates({
        recipients: speakerRecipients,
        roleLabel: "palestrante",
        emailRole: "speaker",
        filePrefix: "certificado-palestrante",
        generator: generateSpeakerCertificate,
      }),
    onSuccess: (results) => {
      setProcessing(false);
      setResult(buildTeamResultMessage(results, "palestrante"));
    },
    onError: (error) => {
      setProcessing(false);
      setResult({ success: false, message: error.message });
    },
  });

  const buildParticipantWithCertificateMetrics = (participant) => {
    const repadPerformance = repadPerformanceByParticipantId.get(participant?.id);
    const fallbackScore = toNumeric(participant?.grade);
    const fallbackKappa =
      Number.isFinite(fallbackScore) && fallbackScore >= 0
        ? clamp(fallbackScore / 100, 0, 1)
        : null;
    const resolvedScore =
      repadPerformance?.latestScore ??
      (Number.isFinite(fallbackScore) ? clamp(fallbackScore, 0, 100) : null);
    const resolvedKappa = repadPerformance?.latestKappa ?? fallbackKappa;
    const shouldAttachMetrics =
      useRepadScoreCriteria && (repadPerformance || Number.isFinite(resolvedScore));

    if (!shouldAttachMetrics) return participant;
    return {
      ...participant,
      certificate_kappa: resolvedKappa,
      certificate_score: resolvedScore,
      grade:
        participant.grade ??
        (Number.isFinite(resolvedScore)
          ? formatScore(resolvedScore, 1)
          : participant.grade),
    };
  };

  const previewCertificate = useMutation({
    mutationFn: async () => {
      if (!training) {
        throw new Error("Treinamento inválido para pré-visualização.");
      }
      const selectedParticipantIdFromTable =
        selectedParticipants.length === 1 ? selectedParticipants[0] : "";
      const targetParticipantId = String(
        previewParticipantId || selectedParticipantIdFromTable
      ).trim();
      if (!targetParticipantId) {
        throw new Error(
          "Selecione um participante para visualização na lista de pré-visualização."
        );
      }
      const participant = safeParticipants.find(
        (item) => String(item?.id || "").trim() === targetParticipantId
      );
      if (!participant) {
        throw new Error("Participante selecionado não encontrado.");
      }

      const templateOverride = await resolveSelectedTemplateOverride();
      const participantWithMetrics =
        buildParticipantWithCertificateMetrics(participant);
      const pdf = generateParticipantCertificate(
        participantWithMetrics,
        training,
        templateOverride
      );
      const blob = pdf.output("blob");
      const url = window.URL.createObjectURL(blob);
      const previewWindow = window.open(url, "_blank", "noopener,noreferrer");
      if (!previewWindow) {
        window.URL.revokeObjectURL(url);
        throw new Error(
          "Não foi possível abrir a visualização. Verifique o bloqueador de pop-up."
        );
      }
      window.setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 60000);
      return participant.professional_name || "participante";
    },
    onSuccess: (participantName) => {
      setResult({
        success: true,
        message: `Pré-visualização aberta para ${participantName}.`,
      });
    },
    onError: (error) => {
      setResult({
        success: false,
        message: error?.message || "Não foi possível abrir a pré-visualização.",
      });
    },
  });

  const previewTeamCertificate = useMutation({
    mutationFn: async () => {
      if (!training) {
        throw new Error("Treinamento inválido para pré-visualização.");
      }
      const targetRecipientId = String(previewTeamRecipientId).trim();
      if (!targetRecipientId) {
        throw new Error(
          "Selecione um membro da equipe para visualização na lista de pré-visualização."
        );
      }
      const recipient = teamRecipients.find(
        (item) => String(item?.id || "").trim() === targetRecipientId
      );
      if (!recipient) {
        throw new Error("Membro da equipe selecionado não encontrado.");
      }

      const role = String(recipient?.role || "").trim();
      let generator = null;
      if (role === "coordenador") {
        generator = generateCoordinatorCertificate;
      } else if (role === "monitor") {
        generator = generateMonitorCertificate;
      } else if (role === "palestrante") {
        generator = generateSpeakerCertificate;
      }
      if (!generator) {
        throw new Error("Função de certificado da equipe não suportada.");
      }

      const templateOverride = await resolveSelectedTemplateOverride();
      const pdf = generator(
        buildStaffCertificatePayload(recipient),
        training,
        templateOverride
      );
      const blob = pdf.output("blob");
      const url = window.URL.createObjectURL(blob);
      const previewWindow = window.open(url, "_blank", "noopener,noreferrer");
      if (!previewWindow) {
        window.URL.revokeObjectURL(url);
        throw new Error(
          "Não foi possível abrir a visualização. Verifique o bloqueador de pop-up."
        );
      }
      window.setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 60000);
      return {
        name: String(recipient?.name || "").trim() || "membro da equipe",
        roleLabel: STAFF_ROLE_LABELS[role] || "Equipe",
      };
    },
    onSuccess: (payload) => {
      setResult({
        success: true,
        message: `Pré-visualização aberta para ${payload?.roleLabel || "Equipe"}: ${
          payload?.name || "membro"
        }.`,
      });
    },
    onError: (error) => {
      setResult({
        success: false,
        message: error?.message || "Não foi possível abrir a pré-visualização.",
      });
    },
  });

  const downloadParticipantWordCertificates = useMutation({
    mutationFn: async () => {
      if (!training) {
        throw new Error("Treinamento inválido para baixar certificados em Word.");
      }
      const targetIds =
        selectedParticipants.length > 0
          ? selectedParticipants
          : previewParticipantId
          ? [previewParticipantId]
          : [];
      if (targetIds.length === 0) {
        throw new Error("Selecione ao menos um participante para baixar em Word.");
      }
      const templateOverride = await resolveSelectedTemplateOverride();
      const participantsToDownload = safeParticipants.filter((participant) =>
        targetIds.includes(participant.id)
      );
      if (participantsToDownload.length === 0) {
        throw new Error("Nenhum participante selecionado foi encontrado.");
      }

      participantsToDownload.forEach((participant) => {
        const participantWithMetrics =
          buildParticipantWithCertificateMetrics(participant);
        const blob = generateParticipantCertificateWordBlob(
          participantWithMetrics,
          training,
          templateOverride
        );
        const fileName = `certificado-${toSafeFileName(
          participant.professional_name,
          "participante"
        )}.doc`;
        downloadBlob(blob, fileName);
      });
      return participantsToDownload.length;
    },
    onSuccess: (count) => {
      setResult({
        success: true,
        message: `${count} certificado(s) baixado(s) em Word.`,
      });
    },
    onError: (error) => {
      setResult({
        success: false,
        message: error?.message || "Não foi possível baixar em Word.",
      });
    },
  });

  const downloadTeamWordCertificates = useMutation({
    mutationFn: async ({ onlySelected = false } = {}) => {
      if (!training) {
        throw new Error("Treinamento inválido para baixar certificados em Word.");
      }
      const recipientsToDownload = onlySelected
        ? teamRecipients.filter(
            (recipient) =>
              String(recipient?.id || "").trim() ===
              String(previewTeamRecipientId || "").trim()
          )
        : teamRecipients;
      if (recipientsToDownload.length === 0) {
        throw new Error(
          onlySelected
            ? "Selecione um membro da equipe para baixar em Word."
            : "Nenhum membro da equipe cadastrado para baixar em Word."
        );
      }

      const templateOverride = await resolveSelectedTemplateOverride();
      recipientsToDownload.forEach((recipient) => {
        const role = String(recipient?.role || "").trim();
        const generator = resolveTeamWordGenerator(role);
        if (!generator) return;
        const blob = generator(
          buildStaffCertificatePayload(recipient),
          training,
          templateOverride
        );
        const roleLabel = STAFF_ROLE_LABELS[role] || "equipe";
        const fileName = `certificado-${toSafeFileName(roleLabel)}-${toSafeFileName(
          recipient.name,
          "membro"
        )}.doc`;
        downloadBlob(blob, fileName);
      });
      return recipientsToDownload.length;
    },
    onSuccess: (count) => {
      setResult({
        success: true,
        message: `${count} certificado(s) da equipe baixado(s) em Word.`,
      });
    },
    onError: (error) => {
      setResult({
        success: false,
        message: error?.message || "Não foi possível baixar certificados da equipe em Word.",
      });
    },
  });

  const issueCertificates = useMutation({
    mutationFn: async (/** @type {any[]} */ participantIds) => {
      if (!training) {
        throw new Error("Treinamento inválido para emissão de certificados.");
      }
      setProcessing(true);
      setResult(null);

      const participantsToIssue = safeParticipants.filter((p) =>
        participantIds.includes(p.id)
      );

      const results = [];
      const templateOverride = await resolveSelectedTemplateOverride();

      for (const participant of participantsToIssue) {
        try {
          const participantWithMetrics =
            buildParticipantWithCertificateMetrics(participant);
          // Generate PDF
          const pdf = generateParticipantCertificate(
            participantWithMetrics,
            training,
            templateOverride
          );
          const pdfBlob = pdf.output('blob');
          const pdfFileName = `certificado-${participant.professional_name}.pdf`;
          const pdfFile = new File([pdfBlob], pdfFileName, { type: 'application/pdf' });
          const attachmentBase64 = await blobToBase64(pdfBlob);
          if (!attachmentBase64) {
            throw new Error("Falha ao gerar anexo do certificado.");
          }
          const attachment = {
            filename: pdfFileName,
            contentType: "application/pdf",
            content: attachmentBase64,
          };

          // Upload PDF
          const { file_url } = await dataClient.integrations.Core.UploadFile({ file: pdfFile });

          const warnings = [];
          let emailError = "";
          let emailSent = false;
          const participantEmailInfo = resolveSingleRecipientEmail(
            participant.professional_email
          );
          const participantEmail = participantEmailInfo.email;
          if (participantEmailInfo.hasMultiple && participantEmail) {
            warnings.push(
              `Mais de um e-mail detectado; enviado apenas para ${participantEmail}.`
            );
          }
          if (participantEmailInfo.hasInvalid) {
            warnings.push("E-mail(s) inválido(s) foram ignorados.");
          }

          // Send email to participant
          if (participantEmail) {
            try {
              const emailData = buildCertificateEmailData({
                training,
                nome: participant.professional_name,
                rg: participant.professional_rg || participant.professional_cpf,
                role: "participant",
              });
              const emailContent = resolveEmailContent(emailData);
              await dataClient.integrations.Core.SendEmail({
                to: participantEmail,
                subject: emailContent.subject,
                body: emailContent.body,
                attachments: [attachment],
              });
              emailSent = true;
            } catch (error) {
              emailError =
                error.message || "Falha ao enviar e-mail ao participante.";
            }
          } else if (participantEmailInfo.provided) {
            emailError = "E-mail do participante inválido para envio.";
          } else {
            emailError = "Participante sem e-mail cadastrado para envio.";
          }

          // Update participant with validity date
          const validityDate = training.validity_months
            ? format(addMonths(new Date(), training.validity_months), "yyyy-MM-dd")
            : null;
          /** @type {any} */
          const participantUpdatePayload = {
            certificate_url: file_url,
            validity_date: validityDate,
            ...(useRepadScoreCriteria &&
            Number.isFinite(participantWithMetrics?.certificate_score)
              ? { grade: formatScore(participantWithMetrics.certificate_score, 1) }
              : {}),
          };
          if (emailSent) {
            participantUpdatePayload.certificate_issued = true;
            participantUpdatePayload.certificate_sent_date = new Date().toISOString();
          }

          await dataClient.entities.TrainingParticipant.update(
            participant.id,
            participantUpdatePayload
          );

          if (!emailSent) {
            results.push({
              name: participant.professional_name,
              success: false,
              error:
                emailError ||
                "Certificado gerado, mas não foi possível enviar e-mail.",
              warnings,
            });
            continue;
          }

          results.push({
            name: participant.professional_name,
            success: true,
            warnings,
          });
        } catch (error) {
          results.push({
            id: participant.id,
            name: participant.professional_name,
            success: false,
            error: error.message,
          });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      setProcessing(false);
      const successCount = results.filter((r) => r.success).length;
      const failedResults = results.filter((r) => !r.success);
      const failCount = failedResults.length;
      const warningCount = results.reduce(
        (acc, r) => acc + (r.warnings?.length || 0),
        0
      );
      const warningMessage = warningCount > 0 ? `, ${warningCount} aviso(s) de e-mail` : "";

      setResult({
        success: failCount === 0,
        message:
          `${successCount} certificado(s) enviado(s)` +
          (failCount > 0 ? `, ${failCount} falha(s)` : "!") +
          warningMessage,
        details: results,
        failedIds: failedResults.map((r) => r.id).filter(Boolean),
      });

      queryClient.invalidateQueries({ queryKey: ["participants"] });
      setSelectedParticipants([]);
    },
    onError: (error) => {
      setProcessing(false);
      setResult({ success: false, message: error.message });
    },
  });

  const toggleParticipant = (id) => {
    setSelectedParticipants((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleIssueSelected = () => {
    if (selectedParticipants.length > 0) {
      issueCertificates.mutate(selectedParticipants);
    }
  };

  // Em repadronização, certificado depende de nota (kappa x100).
  // Nos demais treinamentos, mantém regra por frequência.
  const eligibleParticipants = safeParticipants.filter((p) => {
    if (p.enrollment_status === "cancelado") return false;
    if (useRepadScoreCriteria) {
      const status = repadPerformanceByParticipantId.get(p.id);
      if (status?.hasResult) {
        return Boolean(status?.approved);
      }
      const gradeValue = toNumeric(p?.grade);
      return (
        p?.approved === true &&
        Number.isFinite(gradeValue) &&
        gradeValue >= REPAD_APPROVAL_KAPPA * 100
      );
    }
    const attendanceRecords = normalizeAttendanceRecords(p.attendance_records);
    const percentage = resolveAttendancePercentage({
      participant: p,
      attendanceRecords,
      totalTrainingDates,
    });
    if (Number.isFinite(percentage)) {
      return percentage >= 75;
    }
    return p.approved === true && attendanceRecords.length > 0;
  });

  const alreadySentCount = eligibleParticipants.filter(p => p.certificate_issued).length;
  const pendingEligibleParticipants = eligibleParticipants.filter(p => !p.certificate_issued);
  const eligibleMissingDocumentCount = eligibleParticipants.filter(
    (participant) => !participant?.professional_rg && !participant?.professional_cpf
  ).length;
  const eligibleMissingEmailCount = eligibleParticipants.filter(
    (participant) => !resolveSingleRecipientEmail(participant?.professional_email).email
  ).length;
  const teamMissingDocumentCount = teamRecipients.filter(
    (member) => !member?.rg && !member?.cpf && !member?.document
  ).length;
  const teamMissingLectureCount = teamRecipients.filter(
    (member) => member?.role === "palestrante" && !member?.lecture
  ).length;
  const teamMissingScheduleCount = teamRecipients.filter(
    (member) => member?.role === "palestrante" && (!member?.lecture_date || !member?.lecture_time)
  ).length;

  const toggleAll = () => {
    const pendingIds = pendingEligibleParticipants.map(p => p.id);
    const allPendingSelected = pendingIds.length > 0 &&
      pendingIds.every(id => selectedParticipants.some(sid => sid === id));
    if (allPendingSelected) {
      setSelectedParticipants([]);
    } else {
      setSelectedParticipants(pendingIds);
    }
  };
  const printableEligibleParticipants = useMemo(
    () =>
      [...eligibleParticipants].sort((a, b) =>
        String(a?.professional_name || "").localeCompare(
          String(b?.professional_name || ""),
          "pt-BR",
          { sensitivity: "base" }
        )
      ),
    [eligibleParticipants]
  );
  const sortedEligibleParticipants = useMemo(() => {
    const { field: sortField, direction: sortDir } = sortConfig;
    if (!sortField) return eligibleParticipants;
    return [...eligibleParticipants].sort((a, b) => {
      const valA = String(a[sortField] || "");
      const valB = String(b[sortField] || "");
      const cmp = valA.localeCompare(valB, "pt-BR", { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [eligibleParticipants, sortConfig]);

  const handleSort = (field) => {
    setSortConfig((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field, direction: "asc" }
    );
  };

  const SortIcon = ({ field }) => {
    if (sortConfig.field !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40 inline" />;
    return sortConfig.direction === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 inline" />
      : <ArrowDown className="h-3 w-3 ml-1 inline" />;
  };

  const previewParticipantOptions = useMemo(
    () =>
      printableEligibleParticipants.map((participant) => ({
        id: String(participant?.id || "").trim(),
        label: String(participant?.professional_name || "Participante sem nome"),
      })),
    [printableEligibleParticipants]
  );
  const previewTeamRecipientOptions = useMemo(
    () =>
      teamRecipients.map((member) => ({
        id: String(member?.id || "").trim(),
        label: `${STAFF_ROLE_LABELS[member?.role] || "Equipe"} - ${
          member?.name || "Sem nome"
        }`,
      })),
    [teamRecipients]
  );
  const coordinatorCount = coordinatorRecipient ? 1 : 0;
  const monitorCount = monitorRecipients.length;
  const speakerCount = speakerRecipients.length;
  const totalTeamCount = teamRecipients.length;

  const selectedTemplateDescription = useMemo(() => {
    if (selectedTemplateModel?.isDefault) {
      return "Modelo padrão global (todos os treinamentos).";
    }
    if (selectedTemplateModel?.name) {
      return `Modelo personalizado: ${selectedTemplateModel.name}.`;
    }
    return "Modelo padrão global (todos os treinamentos).";
  }, [selectedTemplateModel]);

  React.useEffect(() => {
    if (!previewParticipantId) return;
    const exists = previewParticipantOptions.some(
      (item) => item.id === String(previewParticipantId).trim()
    );
    if (!exists) {
      setPreviewParticipantId("");
    }
  }, [previewParticipantId, previewParticipantOptions]);

  React.useEffect(() => {
    if (!previewTeamRecipientId) return;
    const exists = previewTeamRecipientOptions.some(
      (item) => item.id === String(previewTeamRecipientId).trim()
    );
    if (!exists) {
      setPreviewTeamRecipientId("");
    }
  }, [previewTeamRecipientId, previewTeamRecipientOptions]);

  const handlePrintApprovedParticipants = () => {
    if (!training) return;
    if (printableEligibleParticipants.length === 0) {
      setResult({
        success: false,
        message: "Não há aprovados para imprimir neste treinamento.",
      });
      return;
    }

    const printWindow = window.open("", "_blank", "width=1180,height=820");
    if (!printWindow) {
      setResult({
        success: false,
        message:
          "Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-up.",
      });
      return;
    }

    const generatedAt = format(new Date(), "dd/MM/yyyy HH:mm");
    const rowsHtml = printableEligibleParticipants
      .map(
        (participant, index) => `
          <tr>
            <td class="idx">${index + 1}</td>
            <td>${escapeHtml(participant.professional_name || "-")}</td>
            <td>${escapeHtml(
              participant.professional_rg || participant.professional_cpf || "-"
            )}</td>
            <td>${escapeHtml(participant.municipality || "-")}</td>
            <td>${escapeHtml(participant.health_region || "-")}</td>
            <td>${escapeHtml(participant.professional_email || "-")}</td>
          </tr>
        `
      )
      .join("");

    const printableHtml = `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Aprovados para certificado - ${escapeHtml(training.title || "Treinamento")}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 24px;
              font-family: "Inter", "Segoe UI", Arial, sans-serif;
              color: #0f172a;
              background: #f8fafc;
            }
            .wrap {
              border: 1px solid #bfdbfe;
              border-radius: 14px;
              overflow: hidden;
              background: #fff;
            }
            .head {
              background: linear-gradient(120deg, #2563eb, #06b6d4);
              color: #fff;
              padding: 20px 24px;
            }
            .head h1 {
              margin: 0;
              font-size: 22px;
              line-height: 1.2;
            }
            .head p {
              margin: 8px 0 0 0;
              font-size: 13px;
              opacity: .95;
            }
            .meta {
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
              padding: 14px 24px 0 24px;
            }
            .chip {
              font-size: 12px;
              border-radius: 999px;
              border: 1px solid #bfdbfe;
              background: #eff6ff;
              color: #1d4ed8;
              padding: 4px 10px;
            }
            table {
              width: calc(100% - 48px);
              margin: 14px 24px 24px 24px;
              border-collapse: collapse;
            }
            thead th {
              background: #eff6ff;
              color: #1e40af;
              border: 1px solid #bfdbfe;
              font-size: 12px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: .02em;
              padding: 10px 8px;
            }
            tbody td {
              border: 1px solid #dbeafe;
              font-size: 12px;
              padding: 8px;
            }
            tbody tr:nth-child(even) td {
              background: #f8fbff;
            }
            .idx {
              width: 44px;
              text-align: center;
            }
            .foot {
              padding: 0 24px 18px 24px;
              font-size: 11px;
              color: #475569;
            }
            @media print {
              body { padding: 0; background: #fff; }
              .wrap { border: none; border-radius: 0; }
              .meta { padding: 10px 0 0 0; }
              table { width: 100%; margin: 12px 0 0 0; }
              .foot { padding: 0; margin-top: 12px; }
            }
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="head">
              <h1>Aprovados para emissão de certificado</h1>
              <p>Treinamento: ${escapeHtml(training.title || "-")} • Gerado em: ${escapeHtml(generatedAt)}</p>
            </div>
            <div class="meta">
              <span class="chip">Total de aprovados: ${printableEligibleParticipants.length}</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th class="idx">#</th>
                  <th>Nome</th>
                  <th>Documento</th>
                  <th>Município</th>
                  <th>GVE</th>
                  <th>E-mail</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
            <div class="foot">
              Relatório gerado automaticamente pela página de certificados.
            </div>
          </div>
          <script>
            window.onload = function() {
              window.focus();
              window.print();
            };
            window.onafterprint = function() {
              window.close();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(printableHtml);
    printWindow.document.close();
  };

  const handleExportApprovedCSV = () => {
    if (printableEligibleParticipants.length === 0) return;
    const headers = ["Nome", "RG/CPF", "Município", "GVE", "Email", "Certificado emitido", "Data de envio"];
    const rows = printableEligibleParticipants.map((p) => [
      p.professional_name || "",
      p.professional_rg || p.professional_cpf || "",
      p.municipality || "",
      p.health_region || "",
      p.professional_email || "",
      p.certificate_issued ? "Sim" : "Não",
      p.certificate_sent_date ? format(new Date(p.certificate_sent_date), "dd/MM/yyyy") : "",
    ]);
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const bom = "﻿";
    const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const trainingTitle = String(training?.title || "treinamento").replace(/[^a-z0-9]/gi, "_");
    link.download = `aprovados_${trainingTitle}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!training) {
    return (
      <div className="space-y-4">
        <Alert className="border-amber-200 bg-amber-50">
          <AlertDescription className="text-amber-800">
            Treinamento indisponível no momento. Feche e abra novamente a emissão de certificados.
          </AlertDescription>
        </Alert>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Award className="h-5 w-5 text-amber-600" />
          Emissão de Certificados
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          {eligibleParticipants.length} participante(s) elegível(eis) •{" "}
          {alreadySentCount} certificado(s) de participantes já enviado(s)
        </p>
        <p className="text-sm text-slate-500 mt-1">
          Equipe cadastrada: {coordinatorCount} coordenador(es), {monitorCount} monitor(es),{" "}
          {speakerCount} palestrante(s)
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Ao emitir, cada certificado é enviado somente para o e-mail do registro correspondente.
        </p>
        <p className="text-xs text-slate-500 mt-1">
          {useRepadScoreCriteria
            ? "Critério de aprovação: nota da última prova (Kappa x100 >= 70)."
            : "Critério de aprovação: frequência mínima de 75%."}
        </p>
      </div>

      {useRepadScoreCriteria && tracomaResultsQuery.isLoading && (
        <Alert className="border-blue-200 bg-blue-50">
          <AlertDescription className="text-blue-800">
            Carregando notas de repadronização para validar aprovados...
          </AlertDescription>
        </Alert>
      )}

      {useRepadScoreCriteria && tracomaResultsQuery.isError && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertDescription className="text-amber-800">
            Não foi possível carregar as notas de repadronização. Atualize a página para tentar novamente.
          </AlertDescription>
        </Alert>
      )}

      {result && (
        <Alert className={result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
          <CheckCircle className={`h-4 w-4 ${result.success ? "text-green-600" : "text-red-600"}`} />
          <AlertDescription className={`flex items-center justify-between gap-4 ${result.success ? "text-green-800" : "text-red-800"}`}>
            <span>{result.message}</span>
            {Array.isArray(result.failedIds) && result.failedIds.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 border-red-300 text-red-700 hover:bg-red-100"
                disabled={processing}
                onClick={() => issueCertificates.mutate(result.failedIds)}
              >
                <Loader2 className="h-3 w-3 mr-1" />
                Tentar novamente ({result.failedIds.length})
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {(() => {
        if (!Array.isArray(result?.details)) return null;
        const detailItems = result.details
          .filter((item) => {
            if (!item || typeof item !== "object") return false;
            if (item.success === false || item.status === "error") return true;
            if (Array.isArray(item.warnings) && item.warnings.length > 0) return true;
            if (typeof item.warning === "string" && item.warning.trim()) return true;
            return false;
          })
          .slice(0, 12);
        if (detailItems.length === 0) return null;

        return (
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-600">
              Detalhes do envio
            </p>
            <ul className="space-y-1 text-xs text-slate-700">
              {detailItems.map((item, index) => {
                const messages = [];
                if (typeof item.error === "string" && item.error.trim()) {
                  messages.push(item.error.trim());
                }
                if (Array.isArray(item.warnings) && item.warnings.length > 0) {
                  messages.push(item.warnings.filter(Boolean).join(" "));
                }
                if (typeof item.warning === "string" && item.warning.trim()) {
                  messages.push(item.warning.trim());
                }
                const resolvedMessage =
                  messages.filter(Boolean).join(" ") || "Falha no envio.";
                return (
                  <li key={`${item.name || "registro"}-${index}`}>
                    <span className="font-medium">{item.name || "Registro"}:</span>{" "}
                    <span>{resolvedMessage}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })()}

      <Tabs defaultValue="participants" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="participants">
            Participantes ({eligibleParticipants.length})
          </TabsTrigger>
          <TabsTrigger value="team">
            Equipe ({totalTeamCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="participants" className="space-y-4">
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="certificate-template-scope-participants">
                  Modelo do certificado
                </Label>
                <Select
                  value={selectedTemplateScope}
                  onValueChange={setSelectedTemplateScope}
                >
                  <SelectTrigger id="certificate-template-scope-participants">
                    <SelectValue placeholder="Selecione o modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    {certificateModelOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                        {option.isDefault ? " (padrão)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-600">{selectedTemplateDescription}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="certificate-preview-participant">
                  Participante para visualização
                </Label>
                <Select
                  value={previewParticipantId || "__none__"}
                  onValueChange={(value) =>
                    setPreviewParticipantId(value === "__none__" ? "" : value)
                  }
                >
                  <SelectTrigger id="certificate-preview-participant">
                    <SelectValue placeholder="Selecione o participante" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione um participante</SelectItem>
                    {previewParticipantOptions.map((participant) => (
                      <SelectItem key={participant.id} value={participant.id}>
                        {participant.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-600">
                  Dica: a visualização usa exatamente o mesmo modelo aplicado no envio.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => previewCertificate.mutate()}
                disabled={
                  processing ||
                  previewCertificate.isPending ||
                  previewParticipantOptions.length === 0
                }
                className="text-white" style={{ background: "hsl(var(--primary))" }}
              >
                {previewCertificate.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4 mr-2" />
                )}
                {previewCertificate.isPending
                  ? "Abrindo visualização..."
                  : "Visualizar certificado"}
              </Button>
              <span className="text-xs text-slate-600">
                Fluxo recomendado: selecione o modelo, visualize e depois emita.
              </span>
            </div>
          </div>

          {(eligibleMissingDocumentCount > 0 || eligibleMissingEmailCount > 0) && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertDescription className="text-amber-800">
                Atenção antes de emitir: {eligibleMissingDocumentCount} participante(s) sem documento
                e {eligibleMissingEmailCount} participante(s) sem e-mail válido. O Word/PDF pode ser
                baixado mesmo sem e-mail, mas o envio automático depende de e-mail válido.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handlePrintApprovedParticipants}
              disabled={printableEligibleParticipants.length === 0 || processing}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700"
            >
              <Printer className="h-4 w-4 mr-2" />
              Imprimir aprovados ({printableEligibleParticipants.length})
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleExportApprovedCSV}
              disabled={printableEligibleParticipants.length === 0 || processing}
            >
              <FileDown className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => downloadParticipantWordCertificates.mutate()}
              disabled={
                processing ||
                downloadParticipantWordCertificates.isPending ||
                (selectedParticipants.length === 0 && !previewParticipantId)
              }
            >
              {downloadParticipantWordCertificates.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Baixar Word
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={toggleAll}
              disabled={pendingEligibleParticipants.length === 0 || processing}
            >
              {pendingEligibleParticipants.length > 0 &&
              pendingEligibleParticipants.every(p => selectedParticipants.includes(p.id))
                ? "Limpar seleção"
                : "Selecionar pendentes"}
            </Button>
            <Button
              onClick={handleIssueSelected}
              disabled={selectedParticipants.length === 0 || processing}
              className="text-white" style={{ background: "hsl(var(--primary))" }}
            >
              <Award className="h-4 w-4 mr-2" />
              {processing
                ? "Emitindo..."
                : `Emitir ${selectedParticipants.length} Certificado(s)`}
            </Button>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        pendingEligibleParticipants.length > 0 &&
                        pendingEligibleParticipants.every(p => selectedParticipants.includes(p.id))
                      }
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none hover:bg-slate-100"
                    onClick={() => handleSort("professional_name")}
                  >
                    Nome <SortIcon field="professional_name" />
                  </TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead
                    className="cursor-pointer select-none hover:bg-slate-100"
                    onClick={() => handleSort("municipality")}
                  >
                    Município <SortIcon field="municipality" />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none hover:bg-slate-100"
                    onClick={() => handleSort("health_region")}
                  >
                    GVE <SortIcon field="health_region" />
                  </TableHead>
                  <TableHead>Email</TableHead>
                  {useRepadScoreCriteria && <TableHead>Nota (Kappa x100)</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead>Certificado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEligibleParticipants.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={useRepadScoreCriteria ? 9 : 8}
                      className="text-center py-8 text-slate-500"
                    >
                      Nenhum participante elegível para certificado
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedEligibleParticipants.map((participant) => (
                    <TableRow key={participant.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedParticipants.includes(participant.id)}
                          onCheckedChange={() => toggleParticipant(participant.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {participant.professional_name}
                      </TableCell>
                      <TableCell>
                        {participant.professional_rg || participant.professional_cpf || "-"}
                      </TableCell>
                      <TableCell>{participant.municipality || "-"}</TableCell>
                      <TableCell>{participant.health_region || "-"}</TableCell>
                      <TableCell>
                        {participant.professional_email ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="h-3 w-3 text-slate-400" />
                            {participant.professional_email}
                          </div>
                        ) : (
                          <span className="text-red-600 text-sm">Sem email</span>
                        )}
                      </TableCell>
                      {useRepadScoreCriteria && (
                        <TableCell>
                          {(() => {
                            const metrics = repadPerformanceByParticipantId.get(participant.id);
                            if (Number.isFinite(metrics?.latestScore)) {
                              return `${formatScore(metrics.latestScore, 1)}%`;
                            }
                            const gradeValue = toNumeric(participant?.grade);
                            if (!Number.isFinite(gradeValue)) return "-";
                            return `${formatScore(gradeValue, 1)}%`;
                          })()}
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge className="bg-green-100 text-green-700">
                          {useRepadScoreCriteria ? "Aprovado por nota" : "Aprovado"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {participant.certificate_issued ? (
                          <div className="flex items-center gap-1 text-sm text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            Enviado
                            {participant.certificate_sent_date && (
                              <span className="text-xs text-slate-500">
                                ({format(new Date(participant.certificate_sent_date), "dd/MM/yyyy")})
                              </span>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-slate-600">
                            Pendente
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="team" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-md border bg-slate-50 p-3 text-center">
              <p className="text-xs text-slate-500">Coordenador</p>
              <p className="text-xl font-semibold text-indigo-700">{coordinatorCount}</p>
            </div>
            <div className="rounded-md border bg-slate-50 p-3 text-center">
              <p className="text-xs text-slate-500">Monitores</p>
              <p className="text-xl font-semibold text-purple-700">{monitorCount}</p>
            </div>
            <div className="rounded-md border bg-slate-50 p-3 text-center">
              <p className="text-xs text-slate-500">Palestrantes</p>
              <p className="text-xl font-semibold text-emerald-700">{speakerCount}</p>
            </div>
            <div className="rounded-md border bg-slate-50 p-3 text-center">
              <p className="text-xs text-slate-500">Total equipe</p>
              <p className="text-xl font-semibold text-slate-800">{totalTeamCount}</p>
            </div>
          </div>

          <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="certificate-template-scope-team">Modelo do certificado</Label>
                <Select
                  value={selectedTemplateScope}
                  onValueChange={setSelectedTemplateScope}
                >
                  <SelectTrigger id="certificate-template-scope-team">
                    <SelectValue placeholder="Selecione o modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    {certificateModelOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                        {option.isDefault ? " (padrão)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-600">{selectedTemplateDescription}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="certificate-preview-team-member">
                  Membro da equipe para visualização
                </Label>
                <Select
                  value={previewTeamRecipientId || "__none__"}
                  onValueChange={(value) =>
                    setPreviewTeamRecipientId(value === "__none__" ? "" : value)
                  }
                >
                  <SelectTrigger id="certificate-preview-team-member">
                    <SelectValue placeholder="Selecione o membro da equipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione um membro da equipe</SelectItem>
                    {previewTeamRecipientOptions.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-600">
                  Dica: a visualização usa exatamente o mesmo modelo aplicado no envio.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => previewTeamCertificate.mutate()}
                disabled={
                  processing ||
                  previewTeamCertificate.isPending ||
                  previewTeamRecipientOptions.length === 0
                }
                className="text-white" style={{ background: "hsl(var(--primary))" }}
              >
                {previewTeamCertificate.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4 mr-2" />
                )}
                {previewTeamCertificate.isPending
                  ? "Abrindo visualização..."
                  : "Visualizar certificado da equipe"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  downloadTeamWordCertificates.mutate({ onlySelected: true })
                }
                disabled={
                  processing ||
                  downloadTeamWordCertificates.isPending ||
                  !previewTeamRecipientId
                }
              >
                {downloadTeamWordCertificates.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                Baixar Word selecionado
              </Button>
              <span className="text-xs text-slate-600">
                Fluxo recomendado: selecione o modelo, visualize e depois emita para a equipe.
              </span>
            </div>
          </div>

          {(teamMissingDocumentCount > 0 ||
            teamMissingLectureCount > 0 ||
            teamMissingScheduleCount > 0) && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertDescription className="text-amber-800">
                Revise a equipe: {teamMissingDocumentCount} membro(s) sem documento,{" "}
                {teamMissingLectureCount} palestrante(s) sem aula/tema e{" "}
                {teamMissingScheduleCount} palestrante(s) sem dia ou horário vinculados.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => issueCoordinatorCertificates.mutate()}
              disabled={!coordinatorRecipient || processing}
              className="text-white" style={{ background: "hsl(var(--primary))" }}
            >
              <Award className="h-4 w-4 mr-2" />
              Emitir certificado do coordenador
            </Button>
            <Button
              onClick={() => issueMonitorCertificates.mutate()}
              disabled={monitorRecipients.length === 0 || processing}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Award className="h-4 w-4 mr-2" />
              Emitir certificados de monitores
            </Button>
            <Button
              onClick={() => issueSpeakerCertificates.mutate()}
              disabled={speakerRecipients.length === 0 || processing}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Award className="h-4 w-4 mr-2" />
              Emitir certificados de palestrantes
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => downloadTeamWordCertificates.mutate({ onlySelected: false })}
              disabled={
                processing ||
                downloadTeamWordCertificates.isPending ||
                teamRecipients.length === 0
              }
            >
              {downloadTeamWordCertificates.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Baixar Word da equipe
            </Button>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Função</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Aula/Tema</TableHead>
                  <TableHead>Dia/Horário</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamRecipients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                      Nenhum membro de equipe cadastrado para emissão.
                    </TableCell>
                  </TableRow>
                ) : (
                  teamRecipients.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <Badge variant="outline">{STAFF_ROLE_LABELS[member.role]}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{member.name}</TableCell>
                      <TableCell>{member.rg || member.cpf || member.document || "-"}</TableCell>
                      <TableCell>
                        {member.email ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="h-3 w-3 text-slate-400" />
                            {member.email}
                          </div>
                        ) : (
                          <span className="text-amber-700 text-sm">Sem e-mail</span>
                        )}
                      </TableCell>
                      <TableCell>{member.lecture || "-"}</TableCell>
                      <TableCell>
                        {[member.lecture_date, member.lecture_time].filter(Boolean).join(" - ") || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            member.email
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }
                        >
                          {member.email ? "Pronto para envio" : "Gerar sem envio"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Fechar
        </Button>
      </div>

    </div>
  );
}
