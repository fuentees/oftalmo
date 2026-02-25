import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { format, addMonths } from "date-fns";
import {
  generateParticipantCertificate,
  generateCoordinatorCertificate,
  generateMonitorCertificate,
  generateSpeakerCertificate,
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
import { Mail, CheckCircle, Award, Printer, Eye, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DEFAULT_CERTIFICATE_EMAIL_TEMPLATE,
  loadCertificateEmailTemplate,
  interpolateEmailTemplate,
  buildCertificateEmailData,
} from "@/lib/certificateEmailTemplate";
import { resolveCertificateTemplate } from "@/lib/certificateTemplate";
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
const CERT_TEMPLATE_SCOPE_CURRENT = "__current_training__";
const CERT_TEMPLATE_SCOPE_GLOBAL = "__global_template__";
const STAFF_ROLE_LABELS = {
  coordenador: "Coordenador",
  monitor: "Monitor",
  palestrante: "Palestrante",
};
const normalizeTemplateTitleKey = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

const normalizeStaffEntries = (value) => {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((item) => {
      if (typeof item === "string") {
        const name = item.trim();
        if (!name) return null;
        return { name, email: "", rg: "", lecture: "" };
      }
      if (!item || typeof item !== "object") return null;
      const name = String(item?.name || "").trim();
      if (!name) return null;
      return {
        name,
        email: String(item?.email || "").trim(),
        rg: String(item?.rg || "").trim(),
        lecture: String(item?.lecture || "").trim(),
      };
    })
    .filter(Boolean);
};

export default function CertificateManager({ training, participants = [], onClose }) {
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [previewParticipantId, setPreviewParticipantId] = useState("");
  const [selectedTemplateScope, setSelectedTemplateScope] = useState(
    CERT_TEMPLATE_SCOPE_CURRENT
  );
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  
  const queryClient = useQueryClient();
  const emailTemplate = loadCertificateEmailTemplate();
  const safeParticipants = Array.isArray(participants) ? participants : [];
  const isRepadTraining = isRepadronizacaoTraining(training);

  const tracomaResultsQuery = useQuery({
    queryKey: ["certificateManagerTracomaResults", training?.id],
    queryFn: () =>
      dataClient.entities.TracomaExamResult.filter(
        { training_id: training?.id },
        "-created_at"
      ),
    enabled: Boolean(training?.id),
  });
  const answerKeyRowsQuery = useQuery({
    queryKey: ["certificateManagerTracomaAnswerKeys"],
    queryFn: () => dataClient.entities.TracomaExamAnswerKey.list("question_number"),
    enabled: Boolean(training?.id),
  });
  const trainingsQuery = useQuery({
    queryKey: ["trainings"],
    queryFn: () => dataClient.entities.Training.list("-date"),
    enabled: true,
  });

  const tracomaRows = Array.isArray(tracomaResultsQuery.data)
    ? tracomaResultsQuery.data
    : [];
  const useRepadScoreCriteria = isRepadTraining || tracomaRows.length > 0;

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

  const teamRecipients = useMemo(
    () =>
      [
        ...(coordinatorRecipient ? [coordinatorRecipient] : []),
        ...monitorRecipients,
        ...speakerRecipients,
      ].sort((a, b) => {
        const roleCompare = String(a.role).localeCompare(String(b.role), "pt-BR", {
          sensitivity: "base",
        });
        if (roleCompare !== 0) return roleCompare;
        return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", {
          sensitivity: "base",
        });
      }),
    [coordinatorRecipient, monitorRecipients, speakerRecipients]
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

  const allTrainings = Array.isArray(trainingsQuery.data)
    ? trainingsQuery.data
    : [];
  const templateTrainingOptions = useMemo(() => {
    const groupedByTitle = new Map();
    allTrainings.forEach((item) => {
      const id = String(item?.id || "").trim();
      if (!id) return;
      const title = String(item?.title || "").trim() || "Treinamento sem título";
      const titleKey = normalizeTemplateTitleKey(title) || id;
      const existing = groupedByTitle.get(titleKey);
      if (existing) {
        if (!existing.trainingIds.includes(id)) {
          existing.trainingIds.push(id);
        }
        return;
      }
      groupedByTitle.set(titleKey, {
        id,
        title,
        trainingIds: [id],
      });
    });

    return Array.from(groupedByTitle.values()).sort((a, b) =>
      a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" })
    );
  }, [allTrainings]);

  const selectedTemplateTraining = useMemo(
    () =>
      selectedTemplateScope === CERT_TEMPLATE_SCOPE_GLOBAL ||
      selectedTemplateScope === CERT_TEMPLATE_SCOPE_CURRENT
        ? null
        : templateTrainingOptions.find((item) => item.id === selectedTemplateScope) ||
          null,
    [selectedTemplateScope, templateTrainingOptions]
  );

  const resolveTemplateScope = () => {
    if (selectedTemplateScope === CERT_TEMPLATE_SCOPE_GLOBAL) {
      return null;
    }
    if (selectedTemplateScope === CERT_TEMPLATE_SCOPE_CURRENT) {
      return training;
    }
    const scopedIds = selectedTemplateTraining?.trainingIds?.filter(Boolean) || [];
    if (scopedIds.length > 0) {
      return {
        id: selectedTemplateTraining?.id || scopedIds[0],
        trainingIds: scopedIds,
      };
    }
    return selectedTemplateTraining?.id || training;
  };

  const resolveSelectedTemplateOverride = async () =>
    resolveCertificateTemplate(resolveTemplateScope());

  React.useEffect(() => {
    setSelectedTemplateScope(CERT_TEMPLATE_SCOPE_CURRENT);
    setPreviewParticipantId("");
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

  const buildTeamResultMessage = (results, roleLabel) => {
    const successCount = results.filter((item) => item.status === "success").length;
    const warningCount = results.filter((item) => item.status === "warning").length;
    const failCount = results.filter((item) => item.status === "error").length;
    const warningMessage = warningCount > 0 ? `, ${warningCount} aviso(s)` : "";
    const failMessage = failCount > 0 ? `, ${failCount} falha(s)` : "!";
    return {
      success: failCount === 0,
      message: `${successCount} certificado(s) de ${roleLabel} emitido(s)${warningMessage}${failMessage}`,
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
      const recipientEmail = String(recipient?.email || "").trim();
      const recipientRg = String(recipient?.rg || "").trim();
      const recipientLecture = String(recipient?.lecture || "").trim();

      try {
        const pdf = generator(
          {
            name: recipientName,
            email: recipientEmail,
            rg: recipientRg,
            lecture: recipientLecture,
          },
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
        if (recipientEmail) {
          try {
            const emailData = buildCertificateEmailData({
              training,
              nome: recipientName,
              rg: recipientRg,
              role: emailRole,
              aula: recipientLecture,
            });
            const emailContent = resolveEmailContent(emailData);
            await dataClient.integrations.Core.SendEmail({
              to: recipientEmail,
              subject: emailContent.subject,
              body: emailContent.body,
              attachments: [attachment],
            });
          } catch (error) {
            warnings.push(error.message || "Falha ao enviar e-mail.");
          }
        } else {
          warnings.push("Sem e-mail cadastrado para envio automático.");
        }

        results.push({
          name: recipientName,
          status: warnings.length > 0 ? "warning" : "success",
          warning: warnings.join(" "),
        });
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

          // Send email to participant (best effort)
          if (participant.professional_email) {
            try {
              const emailData = buildCertificateEmailData({
                training,
                nome: participant.professional_name,
                rg: participant.professional_rg,
                role: "participant",
              });
              const emailContent = resolveEmailContent(emailData);
              await dataClient.integrations.Core.SendEmail({
                to: participant.professional_email,
                subject: emailContent.subject,
                body: emailContent.body,
                attachments: [attachment],
              });
            } catch (error) {
              warnings.push(error.message || "Falha ao enviar e-mail ao participante.");
            }
          }

          // Send copy to coordinator if exists (best effort)
          if (training.coordinator_email) {
            try {
              await dataClient.integrations.Core.SendEmail({
                to: training.coordinator_email,
                subject: `Cópia: Certificado emitido - ${participant.professional_name}`,
                body: `
                  <h2>Certificado Emitido</h2>
                  <p>O certificado de <strong>${participant.professional_name}</strong> foi emitido para o treinamento ${training.title}.</p>
                  <p>Segue o PDF do certificado em anexo.</p>
                `,
                attachments: [attachment],
              });
            } catch (error) {
              warnings.push(error.message || "Falha ao enviar e-mail ao coordenador.");
            }
          }

          // Update participant with validity date
          const validityDate = training.validity_months 
            ? format(addMonths(new Date(), training.validity_months), "yyyy-MM-dd")
            : null;

          await dataClient.entities.TrainingParticipant.update(participant.id, {
            certificate_issued: true,
            certificate_sent_date: new Date().toISOString(),
            certificate_url: file_url,
            validity_date: validityDate,
            ...(useRepadScoreCriteria && Number.isFinite(participantWithMetrics?.certificate_score)
              ? { grade: formatScore(participantWithMetrics.certificate_score, 1) }
              : {}),
          });

          results.push({ name: participant.professional_name, success: true, warnings });
        } catch (error) {
          results.push({ name: participant.professional_name, success: false, error: error.message });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      setProcessing(false);
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      const warningCount = results.reduce((acc, r) => acc + (r.warnings?.length || 0), 0);
      const warningMessage = warningCount > 0 ? `, ${warningCount} aviso(s) de e-mail` : "";
      
      setResult({
        success: true,
        message: `${successCount} certificado(s) emitido(s)${failCount > 0 ? `, ${failCount} falha(s)` : '!'}` + warningMessage,
        details: results,
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

  const toggleAll = () => {
    if (selectedParticipants.length === eligibleParticipants.length) {
      setSelectedParticipants([]);
    } else {
      setSelectedParticipants(eligibleParticipants.map(p => p.id));
    }
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
    const hasRecords =
      Array.isArray(p.attendance_records) && p.attendance_records.length > 0;
    if (!hasRecords) return false;
    const percentage = Number(p.attendance_percentage || 0);
    return p.approved || percentage >= 75;
  });

  const alreadySentCount = eligibleParticipants.filter(p => p.certificate_issued).length;
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
  const previewParticipantOptions = useMemo(
    () =>
      printableEligibleParticipants.map((participant) => ({
        id: String(participant?.id || "").trim(),
        label: String(participant?.professional_name || "Participante sem nome"),
      })),
    [printableEligibleParticipants]
  );
  const coordinatorCount = coordinatorRecipient ? 1 : 0;
  const monitorCount = monitorRecipients.length;
  const speakerCount = speakerRecipients.length;
  const totalTeamCount = teamRecipients.length;

  const selectedTemplateDescription = useMemo(() => {
    if (selectedTemplateScope === CERT_TEMPLATE_SCOPE_GLOBAL) {
      return "Modelo padrão global (todos os treinamentos).";
    }
    if (selectedTemplateScope === CERT_TEMPLATE_SCOPE_CURRENT) {
      return "Modelo deste treinamento.";
    }
    if (!selectedTemplateTraining) {
      return "Modelo de outro treinamento.";
    }
    const groupsCount = selectedTemplateTraining.trainingIds?.length || 0;
    return groupsCount > 1
      ? `Modelo compartilhado: ${selectedTemplateTraining.title} (${groupsCount} turmas).`
      : `Modelo: ${selectedTemplateTraining.title}.`;
  }, [selectedTemplateScope, selectedTemplateTraining]);

  React.useEffect(() => {
    if (!previewParticipantId) return;
    const exists = previewParticipantOptions.some(
      (item) => item.id === String(previewParticipantId).trim()
    );
    if (!exists) {
      setPreviewParticipantId("");
    }
  }, [previewParticipantId, previewParticipantOptions]);

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
                  <th>RG</th>
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
          Ao emitir, o certificado é enviado por e-mail automaticamente para quem tem e-mail cadastrado.
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
          <AlertDescription className={result.success ? "text-green-800" : "text-red-800"}>
            {result.message}
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="certificate-template-scope">Modelo do certificado</Label>
            <Select
              value={selectedTemplateScope}
              onValueChange={setSelectedTemplateScope}
            >
              <SelectTrigger id="certificate-template-scope">
                <SelectValue placeholder="Selecione o modelo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CERT_TEMPLATE_SCOPE_CURRENT}>
                  Modelo deste treinamento
                </SelectItem>
                <SelectItem value={CERT_TEMPLATE_SCOPE_GLOBAL}>
                  Modelo padrão global
                </SelectItem>
                {templateTrainingOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.title}
                    {option.trainingIds?.length > 1
                      ? ` (${option.trainingIds.length} turmas)`
                      : ""}
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
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
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
              onClick={toggleAll}
              disabled={eligibleParticipants.length === 0 || processing}
            >
              {selectedParticipants.length === eligibleParticipants.length &&
              eligibleParticipants.length > 0
                ? "Limpar seleção"
                : "Selecionar todos"}
            </Button>
            <Button
              onClick={handleIssueSelected}
              disabled={selectedParticipants.length === 0 || processing}
              className="bg-blue-600 hover:bg-blue-700"
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
                        selectedParticipants.length === eligibleParticipants.length &&
                        eligibleParticipants.length > 0
                      }
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>RG</TableHead>
                  <TableHead>Município</TableHead>
                  <TableHead>GVE</TableHead>
                  <TableHead>Email</TableHead>
                  {useRepadScoreCriteria && <TableHead>Nota (Kappa x100)</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead>Certificado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eligibleParticipants.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={useRepadScoreCriteria ? 9 : 8}
                      className="text-center py-8 text-slate-500"
                    >
                      Nenhum participante elegível para certificado
                    </TableCell>
                  </TableRow>
                ) : (
                  eligibleParticipants.map((participant) => (
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

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => issueCoordinatorCertificates.mutate()}
              disabled={!coordinatorRecipient || processing}
              className="bg-indigo-600 hover:bg-indigo-700"
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
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Função</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>RG</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Aula/Tema</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamRecipients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">
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
                      <TableCell>{member.rg || "-"}</TableCell>
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