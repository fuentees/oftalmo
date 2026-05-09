import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Calendar,
  MapPin,
  User,
  Users,
  GraduationCap,
  FileText,
  Video,
  Copy,
  Link2,
  QrCode,
  Printer,
} from "lucide-react";
import { Download, Trash2, Upload } from "lucide-react";
import { formatDateSafe, parseDateSafe } from "@/lib/date";
import { getEffectiveTrainingStatus } from "@/lib/statusRules";
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
import { buildPublicEnrollmentUrl } from "@/lib/enrollmentLinks";
import * as QRCodeLib from "qrcode";

const parseStoredAnswers = (
  value,
  totalQuestions = TRACOMA_TOTAL_QUESTIONS
) => {
  if (!Array.isArray(value) || value.length !== totalQuestions) return null;
  const parsed = value.map((item) => normalizeBinaryAnswer(item));
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

const REPORT_RATING_QUESTION_DEFINITIONS = [
  { key: "duration", label: "Duração do curso", matcher: "A - DURAÇÃO DO CURSO" },
  {
    key: "topic_time",
    label: "Tempo destinado a cada assunto",
    matcher: "B - TEMPO DESTINADO A CADA ASSUNTO",
  },
  {
    key: "didactics",
    label: "Didática aplicada a cada assunto",
    matcher: "C - DIDÁTICA APLICADA A CADA ASSUNTO",
  },
  {
    key: "location",
    label: "Local do treinamento",
    matcher: "D - LOCAL DO TREINAMENTO",
  },
  {
    key: "material",
    label: "Material utilizado",
    matcher: "E - MATERIAL UTILIZADO",
  },
];

const REPORT_TEXT_QUESTION_DEFINITIONS = [
  {
    key: "virtual_opinion",
    label: "Opinião sobre reunião virtual",
    matcher: "OPINIAO SOBRE REALIZAR A REUNIAO DE FORMA VIRTUAL",
  },
  {
    key: "important_topics",
    label: "Assuntos considerados mais e menos importantes",
    matcher:
      "2 - QUAL ASSUNTO VOCÊ CONSIDERA MAIS IMPORTANTE E O MENOS IMPORTANTE",
  },
  {
    key: "comments",
    label: "Comentários e sugestões",
    matcher: "3 - COMENTÁRIOS/SUGESTÕES",
  },
];

const REPORT_RATING_BUCKET_LABELS = {
  otimo: "Ótimo",
  bom: "Bom",
  regular: "Regular",
  fraco: "Fraco",
  insuficiente: "Insuficiente",
};

const DEFAULT_REPORT_OBJECTIVES = [
  "Capacitar profissionais para desenvolver ações básicas relacionadas ao tema do treinamento.",
  "Fortalecer a vigilância epidemiológica e o planejamento das atividades no território.",
  "Estimular práticas de promoção e prevenção alinhadas às necessidades dos serviços de saúde.",
];

const normalizeComparableText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeRatingBucket = (value) => {
  const text = normalizeComparableText(value);
  if (!text) return null;
  if (text.includes("otimo") || text.startsWith("5")) return "otimo";
  if (text.includes("bom") || text.startsWith("4")) return "bom";
  if (text.includes("regular") || text.startsWith("3")) return "regular";
  if (text.includes("fraco") || text.startsWith("2")) return "fraco";
  if (text.includes("insuficiente") || text.startsWith("1")) return "insuficiente";
  return null;
};

const formatPercentage = (value) => {
  if (!Number.isFinite(value)) return "0,0";
  return value.toFixed(1).replace(".", ",");
};

const sanitizeFileName = (value) =>
  String(value || "treinamento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

const pluralizeProfessionals = (count) => (count === 1 ? "profissional" : "profissionais");

export default function TrainingDetails({
  training,
  participants = [],
  showReportSection = true,
  reportOnly = false,
}) {
  const trainingId = String(training?.id || "").trim();
  const isRepadTraining = isRepadronizacaoTraining(training);
  const queryClient = useQueryClient();
  const [reportFile, setReportFile] = useState(null);
  const [reportStatus, setReportStatus] = useState(null);
  const [linkActionStatus, setLinkActionStatus] = useState(null);
  const [generatedAttendanceLinks, setGeneratedAttendanceLinks] = useState({});
  const [attendanceQrDialogOpen, setAttendanceQrDialogOpen] = useState(false);
  const [attendanceQrPreview, setAttendanceQrPreview] = useState(null);
  const [qrLoadingDate, setQrLoadingDate] = useState("");
  const [, forceClockTick] = useState(0);
  const REPORT_NAME = "Relatório do Evento";

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => dataClient.auth.me(),
  });

  const { data: reports = [] } = useQuery({
    queryKey: ["trainingReports", trainingId],
    queryFn: () => dataClient.entities.TrainingMaterial.list(),
    select: (data) =>
      (data || [])
        .filter(
          (item) => item.training_id === trainingId && item.name === REPORT_NAME
        )
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    enabled: !!trainingId,
  });

  const { data: tracomaResults = [] } = useQuery({
    queryKey: ["trainingTracomaSummary", trainingId],
    queryFn: () =>
      dataClient.entities.TracomaExamResult.filter(
        { training_id: trainingId },
        "-created_at"
      ),
    enabled: Boolean(trainingId && isRepadTraining),
  });

  const { data: tracomaAnswerKeys = [] } = useQuery({
    queryKey: ["trainingTracomaSummaryAnswerKeys"],
    queryFn: () => dataClient.entities.TracomaExamAnswerKey.list("question_number"),
    enabled: Boolean(trainingId && isRepadTraining),
  });

  const { data: feedbackResponses = [] } = useQuery({
    queryKey: ["training-report-feedback", trainingId],
    queryFn: () =>
      dataClient.entities.TrainingFeedback.filter(
        { training_id: trainingId },
        "-created_at"
      ),
    enabled: Boolean(trainingId),
  });

  const currentReport = reports[0] || null;

  const uploadReport = useMutation({
    mutationFn: async (file) => {
      if (!file) throw new Error("Selecione um arquivo de relatório.");
      if (!trainingId) throw new Error("Treinamento inválido.");
      if (currentReport?.id) {
        await dataClient.entities.TrainingMaterial.delete(currentReport.id);
      }
      const { file_url } = await dataClient.integrations.Core.UploadFile({ file });
      const ext = file.name?.split(".").pop() || "";
      return dataClient.entities.TrainingMaterial.create({
        training_id: trainingId,
        training_title: training?.title,
        name: REPORT_NAME,
        description: "Relatório do evento",
        file_url,
        file_type: ext,
        uploaded_by: user?.email || "sistema",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainingReports", trainingId] });
      setReportFile(null);
      setReportStatus({ type: "success", message: "Relatório enviado." });
    },
    onError: (error) => {
      setReportStatus({
        type: "error",
        message: error.message || "Erro ao enviar relatório.",
      });
    },
  });

  const deleteReport = useMutation({
    mutationFn: (id) => dataClient.entities.TrainingMaterial.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainingReports", trainingId] });
      setReportStatus({ type: "success", message: "Relatório removido." });
    },
    onError: (error) => {
      setReportStatus({
        type: "error",
        message: error.message || "Erro ao remover relatório.",
      });
    },
  });

  const formatDate = (value, pattern = "dd/MM/yyyy") => {
    const formatted = formatDateSafe(value, pattern);
    return formatted || "-";
  };

  const appOrigin =
    typeof window !== "undefined" ? window.location.origin : "";

  const trainingDates = Array.isArray(training?.dates)
    ? training.dates.filter((dateItem) => dateItem?.date)
    : [];
  const sortedTrainingDates = useMemo(
    () =>
      [...trainingDates].sort(
        (a, b) =>
          parseDateSafe(a?.date).getTime() - parseDateSafe(b?.date).getTime()
      ),
    [trainingDates]
  );
  const attendanceDateValues = useMemo(() => {
    if (sortedTrainingDates.length > 0) {
      return sortedTrainingDates
        .map((item) => String(item?.date || "").trim())
        .filter(Boolean);
    }
    const fallbackDate = String(training?.date || "").trim();
    return fallbackDate ? [fallbackDate] : [];
  }, [sortedTrainingDates, training?.date]);
  const enrollmentLink = trainingId
    ? buildPublicEnrollmentUrl(appOrigin, trainingId, training?.code)
    : "";
  const feedbackLink = trainingId
    ? `${appOrigin}/TrainingFeedback?training=${encodeURIComponent(trainingId)}`
    : "";

  const statusColors = {
    agendado: "bg-blue-100 text-blue-700",
    confirmado: "bg-emerald-100 text-emerald-700",
    em_andamento: "bg-amber-100 text-amber-700",
    concluido: "bg-green-100 text-green-700",
    cancelado: "bg-red-100 text-red-700",
  };

  const statusLabels = {
    agendado: "Agendado",
    confirmado: "Confirmado",
    em_andamento: "Em andamento",
    concluido: "Concluído",
    cancelado: "Cancelado",
  };

  const getEffectiveStatus = () => getEffectiveTrainingStatus(training);

  useEffect(() => {
    if (!trainingId) return;
    const timer = window.setInterval(() => {
      forceClockTick((value) => value + 1);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [trainingId]);

  const effectiveStatus = getEffectiveStatus();

  const typeLabels = {
    teorico: "Teórico",
    pratico: "Prático",
    teorico_pratico: "Teórico e Prático",
    repadronizacao: "Repadronização",
  };

  const categoryLabels = {
    NR: "NR (Norma Regulamentadora)",
    tecnico: "Técnico",
    comportamental: "Comportamental",
    integracao: "Integração",
    reciclagem: "Reciclagem",
    outros: "Outros",
  };

  const trainingParticipants = Array.isArray(participants) ? participants : [];
  const activeParticipants = trainingParticipants.filter(
    (item) => item.enrollment_status !== "cancelado"
  );
  const totalParticipants = activeParticipants.length;
  const answerKeyByCode = useMemo(() => {
    const map = new Map();
    const collections = buildAnswerKeyCollections(
      Array.isArray(tracomaAnswerKeys) ? tracomaAnswerKeys : [],
      TRACOMA_TOTAL_QUESTIONS
    );
    collections.forEach((item) => {
      if (item?.answers && !item?.error) {
        map.set(item.code, item.answers);
      }
    });
    return map;
  }, [tracomaAnswerKeys]);
  const availableExamKeyCodes = useMemo(
    () => Array.from(answerKeyByCode.keys()).sort((a, b) => a.localeCompare(b)),
    [answerKeyByCode]
  );
  const defaultExamKeyCode = useMemo(() => {
    if (!isRepadTraining) return "";
    if (availableExamKeyCodes.includes("E2")) return "E2";
    return availableExamKeyCodes[0] || "";
  }, [availableExamKeyCodes, isRepadTraining]);
  const examLink =
    isRepadTraining && trainingId
      ? `${appOrigin}/TracomaExaminerTest?training=${encodeURIComponent(
          trainingId
        )}${
          defaultExamKeyCode
            ? `&key=${encodeURIComponent(defaultExamKeyCode)}`
            : ""
        }`
      : "";

  const copyLinkToClipboard = async (label, link) => {
    if (!link) {
      setLinkActionStatus({
        type: "error",
        message: `Não foi possível gerar o link de ${label}.`,
      });
      return;
    }
    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard?.writeText
    ) {
      setLinkActionStatus({
        type: "error",
        message:
          "Seu navegador não permite cópia automática. Copie o link manualmente.",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setLinkActionStatus({
        type: "success",
        message: `Link de ${label} copiado com sucesso.`,
      });
    } catch {
      setLinkActionStatus({
        type: "error",
        message: `Não foi possível copiar o link de ${label}.`,
      });
    }
  };

  const createAttendanceLinkForDate = async (dateValue) => {
    const normalizedDate = String(dateValue || "").trim();
    if (!normalizedDate) throw new Error("Data inválida para gerar o link.");
    if (!trainingId) throw new Error("Treinamento inválido.");
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 6);

    await dataClient.entities.AttendanceLink.create({
      training_id: training.id,
      training_title: training.title,
      date: normalizedDate,
      token,
      expires_at: expiresAt.toISOString(),
      is_active: true,
      check_ins_count: 0,
    });

    return {
      date: normalizedDate,
      link: `${appOrigin}/CheckIn?token=${token}`,
    };
  };

  const handleOpenAttendanceQr = async (dateValue) => {
    const normalizedDate = String(dateValue || "").trim();
    if (!normalizedDate) return;
    setQrLoadingDate(normalizedDate);
    setLinkActionStatus(null);
    try {
      let attendanceLink = generatedAttendanceLinks[normalizedDate];
      if (!attendanceLink) {
        const generated = await createAttendanceLinkForDate(normalizedDate);
        attendanceLink = generated.link;
        setGeneratedAttendanceLinks((prev) => ({
          ...prev,
          [normalizedDate]: attendanceLink,
        }));
      }

      const qrDataUrl = await QRCodeLib.toDataURL(attendanceLink, {
        width: 320,
        margin: 1,
      });

      setAttendanceQrPreview({
        date: normalizedDate,
        link: attendanceLink,
        qrDataUrl,
      });
      setAttendanceQrDialogOpen(true);
      setLinkActionStatus({
        type: "success",
        message: `QR Code de presença (${formatDate(normalizedDate)}) pronto para uso.`,
      });
    } catch (error) {
      setLinkActionStatus({
        type: "error",
        message: error?.message || "Não foi possível gerar o QR Code de presença.",
      });
    } finally {
      setQrLoadingDate("");
    }
  };

  const handlePrintAttendanceQr = () => {
    if (!attendanceQrPreview?.qrDataUrl || !attendanceQrPreview?.link) return;
    const printWindow = window.open("", "_blank", "width=540,height=760");
    if (!printWindow) {
      setLinkActionStatus({
        type: "error",
        message:
          "Não foi possível abrir a janela de impressão do QR Code. Verifique o bloqueador de pop-up.",
      });
      return;
    }

    const printableHtml = `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>QR Code de presença - ${escapeHtml(formatDate(attendanceQrPreview.date))}</title>
          <style>
            body {
              margin: 0;
              padding: 20px;
              font-family: Arial, Helvetica, sans-serif;
              color: #0f172a;
            }
            .card {
              border: 1px solid #cbd5e1;
              border-radius: 12px;
              padding: 18px;
              max-width: 420px;
              margin: 0 auto;
              text-align: center;
            }
            h1 {
              font-size: 19px;
              margin: 0 0 8px 0;
            }
            .meta {
              font-size: 12px;
              color: #475569;
              margin-bottom: 16px;
            }
            img {
              width: 260px;
              height: 260px;
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              padding: 8px;
              background: #fff;
            }
            .url {
              margin-top: 14px;
              font-size: 10px;
              color: #334155;
              word-break: break-all;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>QR Code de presença</h1>
            <div class="meta">
              <div><strong>Treinamento:</strong> ${escapeHtml(training?.title || "-")}</div>
              <div><strong>Data:</strong> ${escapeHtml(formatDate(attendanceQrPreview.date))}</div>
            </div>
            <img src="${attendanceQrPreview.qrDataUrl}" alt="QR Code de presença" />
            <div class="url">${escapeHtml(attendanceQrPreview.link)}</div>
          </div>
          <script>
            window.onload = function() {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(printableHtml);
    printWindow.document.close();
  };

  const generateAttendanceLink = useMutation({
    mutationFn: createAttendanceLinkForDate,
    onSuccess: async ({ date, link }) => {
      setGeneratedAttendanceLinks((prev) => ({
        ...prev,
        [date]: link,
      }));
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        try {
          await navigator.clipboard.writeText(link);
          setLinkActionStatus({
            type: "success",
            message: `Link de presença (${formatDate(date)}) gerado e copiado.`,
          });
          return;
        } catch {
          // Se falhar a cópia automática, mantém sucesso de geração.
        }
      }
      setLinkActionStatus({
        type: "success",
        message: `Link de presença (${formatDate(date)}) gerado com sucesso.`,
      });
    },
    onError: (error) => {
      setLinkActionStatus({
        type: "error",
        message:
          error?.message || "Não foi possível gerar o link de presença.",
      });
    },
  });

  const repadStatusByParticipant = useMemo(() => {
    if (!isRepadTraining) return new Map();
    const map = new Map();
    const rows = Array.isArray(tracomaResults) ? [...tracomaResults] : [];
    const resolveParticipantForSummary = (identity) => {
      const matched = resolveTrainingParticipantMatch(activeParticipants, identity);
      if (matched) return matched;

      const targetRg = normalizeParticipantRg(identity?.rg || identity?.cpf);
      if (targetRg) {
        const byRg = activeParticipants.find(
          (item) =>
            normalizeParticipantRg(item?.professional_rg || item?.professional_cpf) ===
            targetRg
        );
        if (byRg) return byRg;
      }

      const targetEmail = normalizeParticipantEmail(identity?.email);
      if (targetEmail) {
        const byEmail = activeParticipants.find(
          (item) => normalizeParticipantEmail(item?.professional_email) === targetEmail
        );
        if (byEmail) return byEmail;
      }

      const targetName = normalizeParticipantText(identity?.name);
      if (targetName) {
        const byName = activeParticipants.find(
          (item) => normalizeParticipantText(item?.professional_name) === targetName
        );
        if (byName) return byName;
      }

      return null;
    };
    rows.sort(
      (a, b) =>
        new Date(b?.created_at || 0).getTime() -
        new Date(a?.created_at || 0).getTime()
    );
    rows.forEach((result) => {
      const participant = resolveParticipantForSummary({
        name: result?.participant_name,
        email: result?.participant_email,
        rg: result?.participant_cpf,
      });
      if (!participant?.id) return;
      if (map.has(participant.id)) return;

      let kappaValue = Number(result?.kappa);
      if (!Number.isFinite(kappaValue)) kappaValue = null;
      const keyCode = normalizeAnswerKeyCode(result?.answer_key_code || "E2");
      const answerKey = answerKeyByCode.get(keyCode);
      const traineeAnswers = parseStoredAnswers(result?.answers);
      let statusText = String(result?.aptitude_status || "")
        .trim()
        .toLowerCase();
      if (answerKey && traineeAnswers) {
        try {
          const computed = computeTracomaKappaMetrics({
            answerKey,
            traineeAnswers,
          });
          kappaValue = Number(computed?.kappa);
          statusText = String(computed?.aptitudeStatus || statusText)
            .trim()
            .toLowerCase();
        } catch {
          // Mantém o valor salvo quando não for possível recalcular.
        }
      }
      const approvedByKappa =
        Number.isFinite(kappaValue) && Math.max(0, Math.min(1, kappaValue)) >= 0.7;
      const approved = statusText === "apto" || approvedByKappa;
      map.set(participant.id, {
        hasResult: true,
        approved,
      });
    });
    return map;
  }, [activeParticipants, answerKeyByCode, isRepadTraining, tracomaResults]);

  const failedCount = isRepadTraining
    ? activeParticipants.filter((item) => {
        const status = repadStatusByParticipant.get(item.id);
        return status?.hasResult && !status?.approved;
      }).length
    : activeParticipants.filter((item) => item.approved === false).length;
  const pendingCount = isRepadTraining
    ? activeParticipants.filter(
        (item) => !repadStatusByParticipant.get(item.id)?.hasResult
      ).length
    : activeParticipants.filter(
        (item) => item.approved !== true && item.approved !== false
      ).length;
  const canceledCount = trainingParticipants.filter(
    (item) => item.enrollment_status === "cancelado"
  ).length;

  const isAttendanceApprovedParticipant = (participant) => {
    const raw = Number(participant?.attendance_percentage);
    if (!Number.isFinite(raw)) return false;
    const normalized = raw > 0 && raw <= 1 ? raw * 100 : raw;
    return normalized >= 75;
  };

  const isApprovedParticipant = (participant) => {
    if (!participant) return false;
    if (isRepadTraining) {
      const status = repadStatusByParticipant.get(participant.id);
      return Boolean(status?.approved);
    }
    if (participant.approved === true) return true;
    return isAttendanceApprovedParticipant(participant);
  };

  const approvedParticipants = useMemo(
    () => activeParticipants.filter((participant) => isApprovedParticipant(participant)),
    [activeParticipants, isRepadTraining, repadStatusByParticipant]
  );
  const approvedCount = approvedParticipants.length;

  const approvedParticipantDistributionByGve = useMemo(() => {
    const groups = new Map();
    approvedParticipants.forEach((participant) => {
      const gve = String(participant?.health_region || "").trim() || "Não informado";
      const municipality = String(participant?.municipality || "").trim();
      if (!groups.has(gve)) {
        groups.set(gve, {
          gve,
          count: 0,
          municipalities: new Set(),
        });
      }
      const entry = groups.get(gve);
      entry.count += 1;
      if (municipality) {
        entry.municipalities.add(municipality);
      }
    });
    return Array.from(groups.values())
      .map((item) => ({
        ...item,
        municipalitiesList: Array.from(item.municipalities).sort((a, b) =>
          a.localeCompare(b, "pt-BR", { sensitivity: "base" })
        ),
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.gve.localeCompare(b.gve, "pt-BR", { sensitivity: "base" });
      });
  }, [approvedParticipants]);

  const trainingObjectives = useMemo(() => {
    const raw = String(training?.description || "").trim();
    if (!raw) return DEFAULT_REPORT_OBJECTIVES;
    let items = raw
      .split(/\r?\n|•|;/)
      .map((item) => item.trim())
      .filter((item) => item.length > 10);
    if (items.length <= 1) {
      items = raw
        .split(/[.!?]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 10);
    }
    if (items.length === 0) return DEFAULT_REPORT_OBJECTIVES;
    return Array.from(new Set(items)).slice(0, 6);
  }, [training?.description]);

  const trainingDateRangeLabel = useMemo(() => {
    const dates = sortedTrainingDates
      .map((item) => item?.date)
      .filter(Boolean);
    if (dates.length === 0 && training?.date) {
      return formatDate(training.date);
    }
    if (dates.length === 0) return "Data a definir";
    const first = dates[0];
    const last = dates[dates.length - 1];
    const firstLabel = formatDate(first);
    const lastLabel = formatDate(last);
    if (firstLabel === lastLabel) return firstLabel;
    return `${firstLabel} a ${lastLabel}`;
  }, [sortedTrainingDates, training?.date]);

  const trainingHoursSummary = useMemo(() => {
    const hourPairs = sortedTrainingDates
      .map((item) => {
        const start = String(item?.start_time || "").trim();
        const end = String(item?.end_time || "").trim();
        if (!start || !end) return "";
        return `${start} às ${end}`;
      })
      .filter(Boolean);
    if (hourPairs.length === 0) return "Horário a definir";
    const uniquePairs = Array.from(new Set(hourPairs));
    if (uniquePairs.length === 1) return uniquePairs[0];
    return uniquePairs.join(" | ");
  }, [sortedTrainingDates]);

  const reportProgramGroups = useMemo(
    () =>
      sortedTrainingDates
        .map((dateItem) => {
          const dateLabel = formatDate(dateItem?.date);
          const sessions = (Array.isArray(dateItem?.sessions)
            ? dateItem.sessions
            : []
          )
            .map((session) => ({
              start_time: String(session?.start_time || "").trim() || "-",
              end_time: String(session?.end_time || "").trim() || "-",
              title: String(session?.title || session?.activity || "").trim() || "-",
              speaker:
                String(
                  session?.speaker_name || session?.responsible || session?.speaker || ""
                ).trim() || "-",
            }))
            .filter(
              (session) =>
                session.start_time !== "-" ||
                session.end_time !== "-" ||
                session.title !== "-" ||
                session.speaker !== "-"
            )
            .sort((a, b) =>
              String(a.start_time || "").localeCompare(String(b.start_time || ""))
            );
          return {
            dateLabel,
            sessions,
          };
        })
        .filter((group) => group.sessions.length > 0),
    [formatDate, sortedTrainingDates]
  );

  const feedbackReportInsights = useMemo(() => {
    const ratingMap = new Map(
      REPORT_RATING_QUESTION_DEFINITIONS.map((definition) => [
        definition.key,
        {
          ...definition,
          total: 0,
          buckets: {
            otimo: 0,
            bom: 0,
            regular: 0,
            fraco: 0,
            insuficiente: 0,
          },
          justifications: [],
        },
      ])
    );

    const textCollections = new Map(
      REPORT_TEXT_QUESTION_DEFINITIONS.map((definition) => [definition.key, []])
    );
    const generalComments = [];

    (Array.isArray(feedbackResponses) ? feedbackResponses : []).forEach((response) => {
      const responseComment = String(response?.comments || "").trim();
      if (responseComment) {
        generalComments.push(responseComment);
      }
      const answers = Array.isArray(response?.answers) ? response.answers : [];
      answers.forEach((answer) => {
        const questionText = normalizeComparableText(answer?.question);
        const answerText = String(answer?.value || "").trim();
        if (!questionText || !answerText) return;

        REPORT_RATING_QUESTION_DEFINITIONS.forEach((definition) => {
          const matcher = normalizeComparableText(definition.matcher);
          if (!questionText.includes(matcher)) return;
          const entry = ratingMap.get(definition.key);
          const bucket = normalizeRatingBucket(answerText);
          if (!entry || !bucket) return;
          entry.total += 1;
          entry.buckets[bucket] += 1;
        });

        if (questionText.includes(normalizeComparableText("A - JUSTIFIQUE"))) {
          ratingMap.get("duration")?.justifications.push(answerText);
        } else if (questionText.includes(normalizeComparableText("B - JUSTIFIQUE"))) {
          ratingMap.get("topic_time")?.justifications.push(answerText);
        } else if (questionText.includes(normalizeComparableText("C - JUSTIFIQUE"))) {
          ratingMap.get("didactics")?.justifications.push(answerText);
        } else if (questionText.includes(normalizeComparableText("D - JUSTIFIQUE"))) {
          ratingMap.get("location")?.justifications.push(answerText);
        } else if (questionText.includes(normalizeComparableText("E - JUSTIFIQUE"))) {
          ratingMap.get("material")?.justifications.push(answerText);
        }

        REPORT_TEXT_QUESTION_DEFINITIONS.forEach((definition) => {
          const matcher = normalizeComparableText(definition.matcher);
          if (!questionText.includes(matcher)) return;
          textCollections.get(definition.key)?.push(answerText);
        });
      });
    });

    const ratingSummary = REPORT_RATING_QUESTION_DEFINITIONS.map((definition) => {
      const entry = ratingMap.get(definition.key);
      return {
        ...entry,
        percentages: Object.entries(entry.buckets).reduce((acc, [bucket, count]) => {
          acc[bucket] =
            entry.total > 0 ? formatPercentage((count / entry.total) * 100) : "0,0";
          return acc;
        }, {}),
      };
    });

    const uniqueOrdered = (values = []) => {
      const seen = new Set();
      const result = [];
      values.forEach((item) => {
        const text = String(item || "").trim();
        if (!text) return;
        const key = normalizeComparableText(text);
        if (!key || seen.has(key)) return;
        seen.add(key);
        result.push(text);
      });
      return result;
    };

    const virtualOpinions = uniqueOrdered(textCollections.get("virtual_opinion") || []);
    const importantTopics = uniqueOrdered(textCollections.get("important_topics") || []);
    const comments = uniqueOrdered([
      ...(textCollections.get("comments") || []),
      ...generalComments,
    ]);

    return {
      totalResponses: Array.isArray(feedbackResponses) ? feedbackResponses.length : 0,
      ratingSummary,
      virtualOpinions: virtualOpinions.slice(0, 12),
      importantTopics: importantTopics.slice(0, 12),
      comments: comments.slice(0, 18),
    };
  }, [feedbackResponses]);

  const handleDownloadReportTemplate = () => {
    if (!training) return;
    const monitorNames = Array.isArray(training?.monitors)
      ? training.monitors
          .map((item) => String(item?.name || "").trim())
          .filter(Boolean)
      : [];
    const approvedParticipantsCount = approvedParticipants.length;
    const monitorSummary =
      monitorNames.length > 0
        ? `Participaram como monitores ${monitorNames.length} ${pluralizeProfessionals(
            monitorNames.length
          )}: ${monitorNames.join(", ")}.`
        : "Não há monitores registrados no sistema.";
    const participantDistributionListHtml =
      approvedParticipantDistributionByGve.length > 0
        ? approvedParticipantDistributionByGve
            .map((item) => {
              const municipalities = item.municipalitiesList.length
                ? ` – municípios ${item.municipalitiesList.join(", ")}`
                : "";
              return `<li>${item.count} ${pluralizeProfessionals(
                item.count
              )} (${escapeHtml(item.gve)}${escapeHtml(municipalities)})</li>`;
            })
            .join("")
        : "<li>Sem distribuição regional registrada para aprovados.</li>";

    const ratingSummaryParagraphsHtml = feedbackReportInsights.ratingSummary
      .map((item) => {
        const labels = Object.keys(REPORT_RATING_BUCKET_LABELS)
          .map((bucket) => {
            const count = item.buckets[bucket] || 0;
            if (!count) return "";
            return `${item.percentages[bucket]}% classificaram como “${REPORT_RATING_BUCKET_LABELS[
              bucket
            ].toLowerCase()}”`;
          })
          .filter(Boolean);
        const distributionText = (() => {
          if (item.total <= 0) return "sem respostas registradas para este item";
          if (labels.length === 1) return labels[0];
          if (labels.length === 2) return `${labels[0]} e ${labels[1]}`;
          return `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
        })();
        const sampledJustifications = item.justifications
          .slice(0, 3)
          .map((value) => `“${escapeHtml(value)}”`)
          .join("; ");
        return `
          <p>
            <strong>${escapeHtml(item.label)}:</strong>
            ${escapeHtml(distributionText)}.
            ${
              sampledJustifications
                ? ` Alguns participantes relataram: ${sampledJustifications}.`
                : ""
            }
          </p>
        `;
      })
      .join("");

    const virtualOpinionsHtml =
      feedbackReportInsights.virtualOpinions.length > 0
        ? feedbackReportInsights.virtualOpinions
            .map((item) => `<li>${escapeHtml(item)}</li>`)
            .join("")
        : "<li>Sem respostas específicas para esta pergunta.</li>";

    const importantTopicsHtml =
      feedbackReportInsights.importantTopics.length > 0
        ? feedbackReportInsights.importantTopics
            .map((item) => `<li>${escapeHtml(item)}</li>`)
            .join("")
        : "<li>Sem respostas abertas registradas.</li>";

    const commentsHtml =
      feedbackReportInsights.comments.length > 0
        ? feedbackReportInsights.comments
            .map((item) => `<li>${escapeHtml(item)}</li>`)
            .join("")
        : "<li>Sem comentários registrados.</li>";

    const objectivesHtml = trainingObjectives
      .map((objective) => `<li>${escapeHtml(objective)};</li>`)
      .join("");

    const approvedParticipantsRowsHtml =
      approvedParticipants.length > 0
        ? [...approvedParticipants]
            .sort((a, b) =>
              String(a?.professional_name || "").localeCompare(
                String(b?.professional_name || ""),
                "pt-BR",
                { sensitivity: "base" }
              )
            )
            .map(
              (participant, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${escapeHtml(participant?.professional_name || "-")}</td>
                  <td>${escapeHtml(
                    participant?.professional_rg || participant?.professional_cpf || "-"
                  )}</td>
                  <td>${escapeHtml(participant?.municipality || "-")}</td>
                  <td>${escapeHtml(participant?.health_region || "-")}</td>
                  <td>${escapeHtml(participant?.unit_name || "-")}</td>
                  <td>${escapeHtml(participant?.professional_email || "-")}</td>
                </tr>
              `
            )
            .join("")
        : `
          <tr>
            <td colspan="7">Sem treinandos aprovados para listar neste anexo.</td>
          </tr>
        `;

    const programRowsHtml =
      reportProgramGroups.length > 0
        ? reportProgramGroups
            .map((group) =>
              group.sessions
                .map(
                  (session, sessionIndex) => `
                    <tr>
                      ${
                        sessionIndex === 0
                          ? `<td rowspan="${group.sessions.length}">${escapeHtml(
                              group.dateLabel
                            )}</td>`
                          : ""
                      }
                      <td>${escapeHtml(session.start_time)}</td>
                      <td>${escapeHtml(session.end_time)}</td>
                      <td>${escapeHtml(session.title)}</td>
                      <td>${escapeHtml(session.speaker)}</td>
                    </tr>
                  `
                )
                .join("")
            )
            .join("")
        : `
          <tr>
            <td colspan="5">Sem programação cadastrada.</td>
          </tr>
        `;

    const reportHtml = `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Relatório do treinamento - ${escapeHtml(training.title || "-")}</title>
          <style>
            @page WordSectionMain {
              margin: 3cm 2cm 2cm 3cm;
              size: 595.3pt 841.9pt;
              mso-page-orientation: portrait;
            }
            @page WordSectionAnnexLandscape {
              margin: 3cm 2cm 2cm 3cm;
              size: 841.9pt 595.3pt;
              mso-page-orientation: landscape;
            }
            div.WordSectionMain { page: WordSectionMain; }
            div.WordSectionAnnexLandscape { page: WordSectionAnnexLandscape; }
            body {
              font-family: Arial, Helvetica, sans-serif;
              margin: 0;
              color: #111827;
              line-height: 1.5;
              font-size: 12pt;
            }
            .brand-line { text-align: right; font-size: 10pt; margin-bottom: 12pt; font-weight: 700; color: #475569; }
            h1 { font-size: 12pt; margin: 0 0 14pt 0; text-transform: uppercase; text-align: center; line-height: 1.4; font-weight: 700; }
            h2 { font-size: 12pt; margin: 14pt 0 6pt 0; font-weight: 700; }
            p { margin: 0 0 8pt 0; text-align: justify; text-indent: 1.25cm; }
            ul { margin: 0 0 10pt 22px; padding: 0; }
            li { margin: 0 0 4px 0; text-align: justify; }
            .meta p { margin-bottom: 3pt; }
            .meta p,
            .brand-line,
            .annex-title,
            h1,
            h2,
            .signature { text-indent: 0; }
            .signature { margin-top: 22pt; text-align: right; }
            .annex-title { margin-top: 20px; font-weight: 700; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11pt; }
            th, td { border: 1px solid #9ca3af; padding: 7px; vertical-align: top; }
            th { background: #f8fafc; text-align: left; }
          </style>
        </head>
        <body>
          <div class="WordSectionMain">
          <div class="brand-line">CVE • CCD • SÃO PAULO</div>
          <h1>Relatório do treinamento ${
            training?.online_link ? "online" : ""
          } – “${escapeHtml(training.title || "-")}”.</h1>

          <div class="meta">
            <p><strong>Data:</strong> ${escapeHtml(trainingDateRangeLabel)}</p>
            <p><strong>Horário:</strong> ${escapeHtml(trainingHoursSummary)}</p>
            <p><strong>Carga horária:</strong> ${escapeHtml(
              training?.duration_hours ? `${training.duration_hours} horas` : "Não informada"
            )}</p>
          </div>

          <h2>Objetivos do treinamento</h2>
          <ul>${objectivesHtml}</ul>

          <h2>Monitores</h2>
          <p>${escapeHtml(monitorSummary)}</p>

          <h2>Participantes</h2>
          <p>
            Considerando somente os treinandos aprovados, participaram ${approvedParticipantsCount}
            ${pluralizeProfessionals(approvedParticipantsCount)}.
            ${
              totalParticipants > 0
                ? ` O total geral de inscritos ativos no treinamento foi ${totalParticipants}.`
                : ""
            }
          </p>
          <ul>${participantDistributionListHtml}</ul>
          <p>Lista de participantes: Anexo I.</p>

          <h2>Operacionalização</h2>
          <p>
            O treinamento foi realizado de forma ${
              training?.online_link ? "online" : "presencial"
            }, com acompanhamento da coordenação e equipe técnica. Houve condução dos conteúdos planejados para os encontros e adaptações pontuais para manter a integralidade das atividades propostas.
          </p>
          <p>
            Ao final do treinamento, os participantes foram orientados a aplicar os conhecimentos no território de atuação, conforme os objetivos do curso e as possibilidades locais.
          </p>

          <h2>Avaliação dos treinandos sobre o treinamento</h2>
          <p>
            A avaliação foi realizada ao final das atividades, com ${feedbackReportInsights.totalResponses}
            resposta(s) registradas no sistema.
          </p>
          <p>
            Os trechos entre aspas abaixo reproduzem respostas reais digitadas pelos participantes.
          </p>
          ${ratingSummaryParagraphsHtml}

          <h2>Qual sua opinião sobre realizar a reunião de forma virtual?</h2>
          <ul>${virtualOpinionsHtml}</ul>

          <h2>Assuntos considerados mais e menos importantes</h2>
          <ul>${importantTopicsHtml}</ul>

          <h2>Comentários e sugestões</h2>
          <ul>${commentsHtml}</ul>

          <h2>Conclusão</h2>
          <p>
            O treinamento foi executado conforme planejamento do período, com participação ativa dos inscritos e avaliação geral positiva.
            Recomenda-se manter a continuidade das ações formativas e o acompanhamento dos planos apresentados pelos participantes.
          </p>

          <p class="signature">
            ${escapeHtml(formatDateSafe(new Date(), "dd/MM/yyyy") || "-")} <br/>
            Centro de Oftalmologia Sanitária
          </p>
          </div>

          <div style="mso-element:section-break-next-page;"></div>

          <div class="WordSectionAnnexLandscape">
          <p class="annex-title">Anexo I – Lista de participantes aprovados</p>
          <table>
            <thead>
              <tr>
                <th>Nº</th>
                <th>Nome</th>
                <th>RG/CPF</th>
                <th>Município</th>
                <th>GVE</th>
                <th>Unidade</th>
                <th>E-mail</th>
              </tr>
            </thead>
            <tbody>
              ${approvedParticipantsRowsHtml}
            </tbody>
          </table>
          </div>

          <div style="mso-element:section-break-next-page;"></div>

          <div class="WordSectionMain">
          <p class="annex-title">Anexo II – Programa do treinamento</p>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Tema</th>
                <th>Palestrante</th>
              </tr>
            </thead>
            <tbody>
              ${programRowsHtml}
            </tbody>
          </table>
          </div>
        </body>
      </html>
    `;

    const blob = new Blob(["\ufeff", reportHtml], {
      type: "application/msword;charset=utf-8",
    });
    const fileName = `relatorio_treinamento_${sanitizeFileName(training?.title)}_${sanitizeFileName(
      formatDateSafe(new Date(), "yyyy-MM-dd")
    )}.doc`;
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);

    setReportStatus({
      type: "success",
      message:
        "Modelo de relatório gerado com dados atualizados. Você pode editar livremente no Word.",
    });
  };

  if (!training) return null;

  const reportCard = (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Relatório do Evento
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={handleDownloadReportTemplate}
          >
            <Download className="h-4 w-4 mr-1" />
            Gerar modelo Word automático
          </Button>
        </div>

        {currentReport ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">
              {currentReport.file_type
                ? `Relatório (${currentReport.file_type.toUpperCase()})`
                : "Relatório anexado"}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(currentReport.file_url, "_blank")}
            >
              <Download className="h-4 w-4 mr-1" />
              Baixar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600"
              onClick={() => deleteReport.mutate(currentReport.id)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Remover
            </Button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Nenhum relatório enviado.</p>
        )}

        <div className="grid gap-2">
          <Input
            type="file"
            onChange={(e) => setReportFile(e.target.files?.[0] || null)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!reportFile || uploadReport.isPending}
            onClick={() => uploadReport.mutate(reportFile)}
            className="w-full sm:w-auto"
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploadReport.isPending ? "Enviando..." : "Enviar relatório"}
          </Button>
        </div>

        {reportStatus && (
          <p
            className={
              reportStatus.type === "error"
                ? "text-sm text-red-700"
                : "text-sm text-green-700"
            }
          >
            {reportStatus.message}
          </p>
        )}
      </CardContent>
    </Card>
  );

  if (reportOnly) {
    return <div className="space-y-6">{showReportSection ? reportCard : null}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Training Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-lg bg-purple-50 flex items-center justify-center">
                <GraduationCap className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="font-semibold text-lg">{training.title}</p>
                {training.code && <p className="text-sm text-slate-500">{training.code}</p>}
              </div>
            </div>

            <div className="space-y-2 text-sm">
              {trainingDates.length > 0 ? (
                <div>
                  <p className="text-slate-500 font-medium mb-1">Datas e Horários:</p>
                  {trainingDates.map((dateItem, index) => (
                    <div key={index} className="flex items-start gap-2 pl-2 mb-1">
                      <Calendar className="h-4 w-4 text-slate-400 mt-0.5" />
                      <div>
                        <div>{formatDate(dateItem.date)}</div>
                        {dateItem.start_time && dateItem.end_time && (
                          <div className="text-slate-500 text-xs">
                            {dateItem.start_time} - {dateItem.end_time}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {training.duration_hours && (
                    <p className="text-slate-500 text-xs pl-6">Carga horária total: {training.duration_hours}h</p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  <span>Data a definir</span>
                </div>
              )}
              {training.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  <span>{training.location}</span>
                </div>
              )}
              {training.online_link && (
                <div className="flex items-start gap-2">
                  <Video className="h-4 w-4 text-blue-600 mt-0.5" />
                  <a 
                    href={training.online_link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline break-all text-sm"
                  >
                    Link da Reunião Online
                  </a>
                </div>
              )}
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-slate-400" />
                <span>Coordenador: {training.coordinator || "-"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Detalhes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Status:</span>
              <Badge className={statusColors[effectiveStatus]}>
                {statusLabels[effectiveStatus]}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tipo:</span>
              <Badge variant="outline">{typeLabels[training.type]}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Critério de aprovação:</span>
              <span>
                {isRepadTraining ? "Nota (Kappa x100)" : "Frequência (>= 75%)"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Categoria:</span>
              <span>{categoryLabels[training.category]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Participantes:</span>
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {totalParticipants}
                {training.max_participants && <span className="text-slate-400">/{training.max_participants}</span>}
              </span>
            </div>
            {training.validity_months && (
              <div className="flex justify-between">
                <span className="text-slate-500">Validade:</span>
                <span>{training.validity_months} meses</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">
            Resumo de Participantes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center text-sm">
            <div>
              <p className="text-2xl font-semibold text-slate-900">
                {totalParticipants}
              </p>
              <p className="text-slate-500">Inscritos</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-green-700">
                {approvedCount}
              </p>
              <p className="text-slate-500">Aprovados</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-red-700">
                {failedCount}
              </p>
              <p className="text-slate-500">Reprovados</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-amber-700">
                {pendingCount}
              </p>
              <p className="text-slate-500">Pendentes</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-slate-500">
                {canceledCount}
              </p>
              <p className="text-slate-500">Cancelados</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Links rápidos do treinamento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copyLinkToClipboard("inscrição", enrollmentLink)}
            >
              <Copy className="h-3.5 w-3.5 mr-1" />
              Gerar link de inscrição
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copyLinkToClipboard("avaliação", feedbackLink)}
            >
              <Copy className="h-3.5 w-3.5 mr-1" />
              Gerar link de avaliação
            </Button>
            {isRepadTraining && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copyLinkToClipboard("prova", examLink)}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                Gerar link da prova
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">
              Presença por dia (check-in)
            </p>
            {attendanceDateValues.length === 0 ? (
              <p className="text-sm text-slate-500">
                Cadastre datas no treinamento para gerar links de presença.
              </p>
            ) : (
              <div className="space-y-2">
                {attendanceDateValues.map((dateValue) => {
                  const lastGeneratedLink = generatedAttendanceLinks[dateValue];
                  const isGeneratingThisDate =
                    generateAttendanceLink.isPending &&
                    generateAttendanceLink.variables === dateValue;
                  const isGeneratingQrThisDate = qrLoadingDate === dateValue;
                  return (
                    <div
                      key={`attendance-link-${dateValue}`}
                      className="flex flex-col gap-2 rounded-md border bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="text-sm text-slate-700">
                        {formatDate(dateValue)}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            generateAttendanceLink.isPending ||
                            Boolean(qrLoadingDate)
                          }
                          onClick={() => {
                            setLinkActionStatus(null);
                            generateAttendanceLink.mutate(dateValue);
                          }}
                        >
                          {isGeneratingThisDate ? "Gerando..." : "Gerar link de presença"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            generateAttendanceLink.isPending ||
                            Boolean(qrLoadingDate)
                          }
                          onClick={() => {
                            handleOpenAttendanceQr(dateValue);
                          }}
                        >
                          <QrCode className="h-3.5 w-3.5 mr-1" />
                          {isGeneratingQrThisDate
                            ? "Gerando QR..."
                            : "QR Code de presença"}
                        </Button>
                        {lastGeneratedLink && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              copyLinkToClipboard(
                                `presença de ${formatDate(dateValue)}`,
                                lastGeneratedLink
                              )
                            }
                          >
                            <Copy className="h-3.5 w-3.5 mr-1" />
                            Copiar último link
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {linkActionStatus && (
            <p
              className={
                linkActionStatus.type === "error"
                  ? "text-sm text-red-700"
                  : "text-sm text-green-700"
              }
            >
              {linkActionStatus.message}
            </p>
          )}

          <Dialog
            open={attendanceQrDialogOpen}
            onOpenChange={(open) => {
              setAttendanceQrDialogOpen(open);
              if (!open) {
                setAttendanceQrPreview(null);
              }
            }}
          >
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <QrCode className="h-4 w-4" />
                  QR Code de presença
                </DialogTitle>
              </DialogHeader>
              {attendanceQrPreview ? (
                <div className="space-y-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <p>
                      <strong>Treinamento:</strong> {training?.title || "-"}
                    </p>
                    <p>
                      <strong>Data:</strong> {formatDate(attendanceQrPreview.date)}
                    </p>
                  </div>
                  <div className="flex justify-center">
                    <img
                      src={attendanceQrPreview.qrDataUrl}
                      alt={`QR Code de presença ${formatDate(attendanceQrPreview.date)}`}
                      className="h-64 w-64 rounded-lg border border-slate-200 bg-white p-2"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">Link do check-in</p>
                    <Input readOnly value={attendanceQrPreview.link} />
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        copyLinkToClipboard(
                          `presença de ${formatDate(attendanceQrPreview.date)}`,
                          attendanceQrPreview.link
                        )
                      }
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Copiar link
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handlePrintAttendanceQr}
                    >
                      <Printer className="h-3.5 w-3.5 mr-1" />
                      Imprimir QR
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Nenhum QR Code disponível no momento.
                </p>
              )}
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* Description */}
      {training.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Descrição/Conteúdo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-700 whitespace-pre-wrap">{training.description}</p>
          </CardContent>
        </Card>
      )}

      {showReportSection && reportCard}
      {training.speakers && training.speakers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Palestrantes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {training.speakers.map((speaker, index) => (
              <div key={index} className="flex flex-col border-b border-slate-100 pb-2 last:border-none">
                <span className="font-medium text-slate-800">{speaker.name}</span>
                <span className="text-slate-500">
                  {speaker.lecture || "Tema não informado"}
                </span>
                {(speaker.email || speaker.rg) && (
                  <span className="text-xs text-slate-400">
                    {speaker.email ? speaker.email : ""}{speaker.email && speaker.rg ? " • " : ""}
                    {speaker.rg ? `RG: ${speaker.rg}` : ""}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {/* Notes */}
      {training.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-700">{training.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}