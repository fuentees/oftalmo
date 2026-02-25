import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { format, addMonths } from "date-fns";
import { generateParticipantCertificate, generateMonitorCertificate, generateSpeakerCertificate } from "./CertificateGenerator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Mail, CheckCircle, Award, Printer } from "lucide-react";
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

export default function CertificateManager({ training, participants = [], onClose }) {
  const [selectedParticipants, setSelectedParticipants] = useState([]);
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

  const tracomaRows = Array.isArray(tracomaResultsQuery.data)
    ? tracomaResultsQuery.data
    : [];
  const useRepadScoreCriteria = isRepadTraining || tracomaRows.length > 0;
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

  const issueMonitorCertificates = useMutation({
    mutationFn: async () => {
      if (!training) {
        throw new Error("Treinamento inválido para emissão de certificados.");
      }
      if (!training.monitors || training.monitors.length === 0) {
        throw new Error("Nenhum monitor cadastrado");
      }

      setProcessing(true);
      const results = [];
      const templateOverride = await resolveCertificateTemplate(training);

      for (const monitor of training.monitors) {
        if (!monitor.name || !monitor.email) continue;

        try {
          // Generate PDF
          const pdf = generateMonitorCertificate(monitor, training, templateOverride);
          const pdfBlob = pdf.output('blob');
          const pdfFileName = `certificado-monitor-${monitor.name}.pdf`;
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
          await dataClient.integrations.Core.UploadFile({ file: pdfFile });

          let warning = null;
          try {
            const emailData = buildCertificateEmailData({
              training,
              nome: monitor.name,
              rg: monitor.rg,
              role: "monitor",
              aula: monitor.lecture || "",
            });
            const emailContent = resolveEmailContent(emailData);
            await dataClient.integrations.Core.SendEmail({
              to: monitor.email,
              subject: emailContent.subject,
              body: emailContent.body,
              attachments: [attachment],
            });
          } catch (error) {
            warning = error.message || "Falha ao enviar e-mail.";
          }

          results.push({ name: monitor.name, status: warning ? 'warning' : 'success', warning });
        } catch (error) {
          results.push({ name: monitor.name, status: 'error', error: error.message });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      setProcessing(false);
      const successCount = results.filter(r => r.status === "success").length;
      const warningCount = results.filter(r => r.status === "warning").length;
      const failCount = results.filter(r => r.status === "error").length;
      const warningMessage = warningCount > 0 ? `, ${warningCount} aviso(s) de e-mail` : "";
      const failMessage = failCount > 0 ? `, ${failCount} falha(s)` : "!";
      setResult({
        success: failCount === 0,
        message: `${successCount} certificado(s) emitido(s)${warningMessage}${failMessage}`,
      });
    },
    onError: (error) => {
      setProcessing(false);
      setResult({ success: false, message: error.message });
    },
  });

  const issueSpeakerCertificates = useMutation({
    mutationFn: async () => {
      if (!training) {
        throw new Error("Treinamento inválido para emissão de certificados.");
      }
      if (!training.speakers || training.speakers.length === 0) {
        throw new Error("Nenhum palestrante cadastrado");
      }

      setProcessing(true);
      const results = [];
      const templateOverride = await resolveCertificateTemplate(training);

      for (const speaker of training.speakers) {
        if (!speaker.name || !speaker.email) continue;

        try {
          const pdf = generateSpeakerCertificate(speaker, training, templateOverride);
          const pdfBlob = pdf.output("blob");
          const pdfFileName = `certificado-palestrante-${speaker.name}.pdf`;
          const pdfFile = new File([pdfBlob], pdfFileName, { type: "application/pdf" });
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

          let warning = null;
          try {
            const emailData = buildCertificateEmailData({
              training,
              nome: speaker.name,
              rg: speaker.rg,
              role: "speaker",
              aula: speaker.lecture || "",
            });
            const emailContent = resolveEmailContent(emailData);
            await dataClient.integrations.Core.SendEmail({
              to: speaker.email,
              subject: emailContent.subject,
              body: emailContent.body,
              attachments: [attachment],
            });
          } catch (error) {
            warning = error.message || "Falha ao enviar e-mail.";
          }

          results.push({ name: speaker.name, status: warning ? "warning" : "success", warning });
        } catch (error) {
          results.push({ name: speaker.name, status: "error", error: error.message });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      setProcessing(false);
      const successCount = results.filter(r => r.status === "success").length;
      const warningCount = results.filter(r => r.status === "warning").length;
      const failCount = results.filter(r => r.status === "error").length;
      const warningMessage = warningCount > 0 ? `, ${warningCount} aviso(s) de e-mail` : "";
      const failMessage = failCount > 0 ? `, ${failCount} falha(s)` : "!";
      setResult({
        success: failCount === 0,
        message: `${successCount} certificado(s) de palestrante emitido(s)${warningMessage}${failMessage}`,
      });
    },
    onError: (error) => {
      setProcessing(false);
      setResult({ success: false, message: error.message });
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
      const templateOverride = await resolveCertificateTemplate(training);

      for (const participant of participantsToIssue) {
        try {
          const repadPerformance = repadPerformanceByParticipantId.get(participant.id);
          const fallbackScore = toNumeric(participant?.grade);
          const fallbackKappa =
            Number.isFinite(fallbackScore) && fallbackScore >= 0
              ? clamp(fallbackScore / 100, 0, 1)
              : null;
          const resolvedScore =
            repadPerformance?.latestScore ??
            (Number.isFinite(fallbackScore) ? clamp(fallbackScore, 0, 100) : null);
          const resolvedKappa = repadPerformance?.latestKappa ?? fallbackKappa;
          const participantWithMetrics =
            useRepadScoreCriteria && (repadPerformance || Number.isFinite(resolvedScore))
              ? {
                  ...participant,
                  certificate_kappa: resolvedKappa,
                  certificate_score: resolvedScore,
                  grade:
                    participant.grade ??
                    (Number.isFinite(resolvedScore)
                      ? formatScore(resolvedScore, 1)
                      : participant.grade),
                }
              : participant;
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
          {eligibleParticipants.length} participante(s) elegível(eis) • {alreadySentCount} certificado(s) já enviado(s)
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

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-10">
                <Checkbox
                  checked={selectedParticipants.length === eligibleParticipants.length && eligibleParticipants.length > 0}
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
                  <TableCell className="font-medium">{participant.professional_name}</TableCell>
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
                      <Badge variant="outline" className="text-slate-600">Pendente</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-between items-center pt-4">
        <div className="flex gap-2">
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
            {selectedParticipants.length === eligibleParticipants.length && eligibleParticipants.length > 0
              ? "Limpar seleção"
              : "Selecionar todos"}
          </Button>
          <Button
            onClick={handleIssueSelected}
            disabled={selectedParticipants.length === 0 || processing}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Award className="h-4 w-4 mr-2" />
            {processing ? "Emitindo..." : `Emitir ${selectedParticipants.length} Certificado(s)`}
          </Button>
          {training.monitors && training.monitors.length > 0 && (
            <Button
              onClick={() => issueMonitorCertificates.mutate()}
              disabled={processing}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Award className="h-4 w-4 mr-2" />
              Emitir Certificados Monitores
            </Button>
          )}
          {training.speakers && training.speakers.length > 0 && (
            <Button
              onClick={() => issueSpeakerCertificates.mutate()}
              disabled={processing}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Award className="h-4 w-4 mr-2" />
              Emitir Certificados Palestrantes
            </Button>
          )}
        </div>
        <Button variant="outline" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  );
}