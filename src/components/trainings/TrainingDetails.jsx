import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const parseStoredAnswers = (
  value,
  totalQuestions = TRACOMA_TOTAL_QUESTIONS
) => {
  if (!Array.isArray(value) || value.length !== totalQuestions) return null;
  const parsed = value.map((item) => normalizeBinaryAnswer(item));
  if (parsed.some((item) => item === null)) return null;
  return parsed;
};

export default function TrainingDetails({ training, participants = [] }) {
  const trainingId = String(training?.id || "").trim();
  const isRepadTraining = isRepadronizacaoTraining(training);
  const queryClient = useQueryClient();
  const [reportFile, setReportFile] = useState(null);
  const [reportStatus, setReportStatus] = useState(null);
  const [linkActionStatus, setLinkActionStatus] = useState(null);
  const [generatedAttendanceLinks, setGeneratedAttendanceLinks] = useState({});
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
    ? `${appOrigin}/PublicEnrollment?training=${encodeURIComponent(trainingId)}`
    : "";
  const feedbackLink = trainingId
    ? `${appOrigin}/TrainingFeedback?training=${encodeURIComponent(trainingId)}`
    : "";

  const statusColors = {
    agendado: "bg-blue-100 text-blue-700",
    em_andamento: "bg-amber-100 text-amber-700",
    concluido: "bg-green-100 text-green-700",
    cancelado: "bg-red-100 text-red-700",
  };

  const statusLabels = {
    agendado: "Agendado",
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

  const generateAttendanceLink = useMutation({
    mutationFn: async (dateValue) => {
      const normalizedDate = String(dateValue || "").trim();
      if (!normalizedDate) throw new Error("Data inválida para gerar o link.");
      if (!trainingId) throw new Error("Treinamento inválido.");
      const token =
        Math.random().toString(36).slice(2) + Date.now().toString(36);
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
    },
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

  const approvedCount = isRepadTraining
    ? activeParticipants.filter(
        (item) => repadStatusByParticipant.get(item.id)?.approved
      ).length
    : activeParticipants.filter((item) => item.approved).length;
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

  if (!training) return null;

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
                          disabled={generateAttendanceLink.isPending}
                          onClick={() => {
                            setLinkActionStatus(null);
                            generateAttendanceLink.mutate(dateValue);
                          }}
                        >
                          {isGeneratingThisDate ? "Gerando..." : "Gerar link de presença"}
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

      {/* Event Report */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Relatório do Evento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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