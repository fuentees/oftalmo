import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, MapPin, User, Users, GraduationCap, FileText, Video } from "lucide-react";
import { Download, Trash2, Upload } from "lucide-react";
import { parseDateSafe, formatDateSafe } from "@/lib/date";

export default function TrainingDetails({ training, participants = [] }) {
  if (!training) return null;
  const queryClient = useQueryClient();
  const [reportFile, setReportFile] = useState(null);
  const [reportStatus, setReportStatus] = useState(null);
  const [, forceClockTick] = useState(0);
  const REPORT_NAME = "Relatório do Evento";

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => dataClient.auth.me(),
  });

  const { data: reports = [] } = useQuery({
    queryKey: ["trainingReports", training?.id],
    queryFn: () => dataClient.entities.TrainingMaterial.list(),
    select: (data) =>
      (data || [])
        .filter(
          (item) => item.training_id === training?.id && item.name === REPORT_NAME
        )
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    enabled: !!training?.id,
  });

  const currentReport = reports[0] || null;

  const uploadReport = useMutation({
    mutationFn: async (file) => {
      if (!file) throw new Error("Selecione um arquivo de relatório.");
      if (currentReport?.id) {
        await dataClient.entities.TrainingMaterial.delete(currentReport.id);
      }
      const { file_url } = await dataClient.integrations.Core.UploadFile({ file });
      const ext = file.name?.split(".").pop() || "";
      return dataClient.entities.TrainingMaterial.create({
        training_id: training.id,
        training_title: training.title,
        name: REPORT_NAME,
        description: "Relatório do evento",
        file_url,
        file_type: ext,
        uploaded_by: user?.email || "sistema",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainingReports", training?.id] });
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
      queryClient.invalidateQueries({ queryKey: ["trainingReports", training?.id] });
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

  const trainingDates = Array.isArray(training.dates)
    ? training.dates.filter((dateItem) => dateItem?.date)
    : [];

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

  const parseTimeToParts = (value) => {
    const match = String(value ?? "").trim().match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }
    return { hours, minutes };
  };

  const parseTrainingDateTime = (dateValue, timeValue, isEnd) => {
    const parsedDate = parseDateSafe(dateValue);
    if (Number.isNaN(parsedDate.getTime())) return null;
    const parsedTime = parseTimeToParts(timeValue);
    if (parsedTime) {
      parsedDate.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
      return parsedDate;
    }
    if (isEnd) {
      parsedDate.setHours(23, 59, 59, 999);
    } else {
      parsedDate.setHours(0, 0, 0, 0);
    }
    return parsedDate;
  };

  const getTrainingDateBounds = () => {
    const dateItems = Array.isArray(training?.dates) && training.dates.length > 0
      ? training.dates
      : training?.date
      ? [{ date: training.date }]
      : [];

    const starts = [];
    const ends = [];
    dateItems.forEach((item) => {
      const dateValue = item?.date || item;
      const startDateTime = parseTrainingDateTime(dateValue, item?.start_time, false);
      const endDateTime = parseTrainingDateTime(dateValue, item?.end_time, true);
      if (startDateTime) starts.push(startDateTime.getTime());
      if (endDateTime) ends.push(endDateTime.getTime());
    });

    if (!starts.length || !ends.length) return null;
    return {
      start: new Date(Math.min(...starts)),
      end: new Date(Math.max(...ends)),
    };
  };

  const getEffectiveStatus = () => {
    if (training.status === "cancelado") return "cancelado";
    const bounds = getTrainingDateBounds();
    if (!bounds) return training.status || "agendado";
    const now = new Date();
    if (now < bounds.start) return "agendado";
    if (now > bounds.end) return "concluido";
    return "em_andamento";
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      forceClockTick((value) => value + 1);
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  const effectiveStatus = getEffectiveStatus();

  const typeLabels = {
    teorico: "Teórico",
    pratico: "Prático",
    teorico_pratico: "Teórico e Prático",
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
  const approvedCount = activeParticipants.filter((item) => item.approved).length;
  const failedCount = activeParticipants.filter(
    (item) => item.approved === false
  ).length;
  const pendingCount = activeParticipants.filter(
    (item) => item.approved !== true && item.approved !== false
  ).length;
  const canceledCount = trainingParticipants.filter(
    (item) => item.enrollment_status === "cancelado"
  ).length;

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
              <span className="text-slate-500">Categoria:</span>
              <span>{categoryLabels[training.category]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Participantes:</span>
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {training.participants_count || 0}
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