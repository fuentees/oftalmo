import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CalendarDays, Download, Plus, Save, Trash2 } from "lucide-react";
import { formatDateSafe, parseDateSafe } from "@/lib/date";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sanitizeFileName = (value) =>
  String(value || "treinamento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

export default function EventProgramSection({ training }) {
  const queryClient = useQueryClient();
  const [intervalMinutes, setIntervalMinutes] = useState("30");
  const [programDates, setProgramDates] = useState([]);
  const [programStatus, setProgramStatus] = useState(null);

  const parseTimeToMinutes = (value) => {
    const raw = String(value || "").trim();
    const match = raw.match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (
      !Number.isFinite(hour) ||
      !Number.isFinite(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }
    return hour * 60 + minute;
  };

  const formatMinutesToTime = (value) => {
    const total = Number(value);
    if (!Number.isFinite(total)) return "";
    const safe = Math.max(0, Math.min(24 * 60, total));
    const hour = String(Math.floor(safe / 60)).padStart(2, "0");
    const minute = String(safe % 60).padStart(2, "0");
    return `${hour}:${minute}`;
  };

  const normalizeSession = (session, fallbackIndex = 0) => ({
    id:
      String(session?.id || "").trim() ||
      `session-${Date.now()}-${Math.random().toString(36).slice(2)}-${fallbackIndex}`,
    start_time: String(session?.start_time || "").trim(),
    end_time: String(session?.end_time || "").trim(),
    title: String(session?.title || session?.activity || "").trim(),
    speaker_name: String(
      session?.speaker_name || session?.responsible || session?.speaker || ""
    ).trim(),
    notes: String(session?.notes || "").trim(),
  });

  const buildProgramDatesFromTraining = (trainingItem) => {
    const sourceDates = Array.isArray(trainingItem?.dates)
      ? trainingItem.dates.filter((item) => item?.date)
      : [];
    if (sourceDates.length > 0) {
      return sourceDates
        .map((item, dateIndex) => ({
          ...item,
          date: String(item?.date || "").trim(),
          start_time: String(item?.start_time || "").trim(),
          end_time: String(item?.end_time || "").trim(),
          sessions: (Array.isArray(item?.sessions) ? item.sessions : [])
            .map((session, sessionIndex) =>
              normalizeSession(session, dateIndex * 100 + sessionIndex)
            )
            .sort((a, b) => {
              const startA = parseTimeToMinutes(a.start_time);
              const startB = parseTimeToMinutes(b.start_time);
              if (startA === null && startB === null) return 0;
              if (startA === null) return 1;
              if (startB === null) return -1;
              return startA - startB;
            }),
        }))
        .sort(
          (a, b) => parseDateSafe(a.date).getTime() - parseDateSafe(b.date).getTime()
        );
    }
    if (trainingItem?.date) {
      return [
        {
          date: String(trainingItem.date).trim(),
          start_time: String(trainingItem?.start_time || "").trim(),
          end_time: String(trainingItem?.end_time || "").trim(),
          sessions: [],
        },
      ];
    }
    return [];
  };

  useEffect(() => {
    setProgramDates(buildProgramDatesFromTraining(training));
    setProgramStatus(null);
  }, [training?.id, training?.date, training?.dates]);

  const fallbackResponsible = useMemo(
    () =>
      String(training?.instructor || "").trim() ||
      String(training?.coordinator || "").trim() ||
      "-",
    [training?.coordinator, training?.instructor]
  );

  const sortedDates = useMemo(() => {
    const rows = Array.isArray(training?.dates)
      ? training.dates.filter((item) => item?.date)
      : [];
    return [...rows].sort(
      (a, b) => parseDateSafe(a.date).getTime() - parseDateSafe(b.date).getTime()
    );
  }, [training?.dates]);

  const speakers = useMemo(
    () =>
      (Array.isArray(training?.speakers) ? training.speakers : [])
        .map((item) => ({
          name: String(item?.name || "").trim(),
          lecture: String(item?.lecture || "").trim(),
        }))
        .filter((item) => item.name || item.lecture),
    [training?.speakers]
  );

  const rows = useMemo(() => {
    const result = [];
    if (programDates.length > 0) {
      programDates.forEach((dateItem, index) => {
        const dateSessions = Array.isArray(dateItem?.sessions) ? dateItem.sessions : [];
        if (dateSessions.length > 0) {
          dateSessions.forEach((session, sessionIndex) => {
            result.push({
              date:
                sessionIndex === 0
                  ? formatDateSafe(dateItem?.date, "dd/MM/yyyy") || "-"
                  : "",
              meeting: `${index + 1}º encontro`,
              schedule:
                session?.start_time && session?.end_time
                  ? `${session.start_time} às ${session.end_time}`
                  : "-",
              activity:
                String(session?.title || "").trim() ||
                "Conteúdos programados para o encontro.",
              responsible:
                String(session?.speaker_name || "").trim() || fallbackResponsible,
            });
          });
          return;
        }

        const linkedSpeaker = speakers[index] || null;
        const schedule =
          dateItem?.start_time && dateItem?.end_time
            ? `${dateItem.start_time} às ${dateItem.end_time}`
            : "-";
        result.push({
          date: formatDateSafe(dateItem?.date, "dd/MM/yyyy") || "-",
          meeting: `${index + 1}º encontro`,
          schedule,
          activity:
            linkedSpeaker?.lecture ||
            "Conteúdos programados para o encontro (teoria, discussão e prática).",
          responsible: linkedSpeaker?.name || fallbackResponsible,
        });
      });
    } else if (training?.date) {
      result.push({
        date: formatDateSafe(training.date, "dd/MM/yyyy") || "-",
        meeting: "Encontro único",
        schedule: "-",
        activity: "Conteúdo programado do treinamento.",
        responsible: fallbackResponsible,
      });
    }

    if (speakers.length > result.length) {
      speakers.slice(result.length).forEach((speaker, index) => {
        result.push({
          date: "-",
          meeting: `Tema complementar ${index + 1}`,
          schedule: "-",
          activity:
            speaker.lecture ||
            "Atividade complementar prevista na programação do treinamento.",
          responsible: speaker.name || fallbackResponsible,
        });
      });
    }

    if (result.length === 0) {
      result.push({
        date: "-",
        meeting: "Programação a definir",
        schedule: "-",
        activity:
          "Cadastre datas e palestrantes no treinamento para montar a programação detalhada.",
        responsible: fallbackResponsible,
      });
    }

    return result;
  }, [fallbackResponsible, programDates, speakers, sortedDates, training?.date]);

  const dateRange = useMemo(() => {
    if (programDates.length === 0) {
      return formatDateSafe(training?.date, "dd/MM/yyyy") || "Data a definir";
    }
    const first = formatDateSafe(programDates[0]?.date, "dd/MM/yyyy") || "-";
    const last =
      formatDateSafe(programDates[programDates.length - 1]?.date, "dd/MM/yyyy") || "-";
    return first === last ? first : `${first} a ${last}`;
  }, [programDates, training?.date]);

  const scheduleSummary = useMemo(() => {
    const pairs = programDates
      .map((item) => {
        const start = String(item?.start_time || "").trim();
        const end = String(item?.end_time || "").trim();
        if (!start || !end) return "";
        return `${start} às ${end}`;
      })
      .filter(Boolean);
    const unique = Array.from(new Set(pairs));
    if (!unique.length) return "Horário a definir";
    if (unique.length === 1) return unique[0];
    return unique.join(" | ");
  }, [programDates]);

  const saveProgram = useMutation({
    mutationFn: async () => {
      if (!training?.id) throw new Error("Treinamento inválido.");
      const payloadDates = programDates.map((dateItem) => ({
        ...dateItem,
        sessions: (Array.isArray(dateItem?.sessions) ? dateItem.sessions : []).map(
          (session) => ({
            start_time: String(session?.start_time || "").trim(),
            end_time: String(session?.end_time || "").trim(),
            title: String(session?.title || "").trim(),
            speaker_name: String(session?.speaker_name || "").trim(),
            notes: String(session?.notes || "").trim(),
          })
        ),
      }));
      await dataClient.entities.Training.update(training.id, {
        dates: payloadDates,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      setProgramStatus({
        type: "success",
        message: "Programação salva com sucesso.",
      });
    },
    onError: (error) => {
      setProgramStatus({
        type: "error",
        message: error?.message || "Não foi possível salvar a programação.",
      });
    },
  });

  const upsertDateSessions = (dateIndex, updater) => {
    setProgramDates((prev) =>
      prev.map((item, index) => {
        if (index !== dateIndex) return item;
        const current = Array.isArray(item?.sessions) ? item.sessions : [];
        return {
          ...item,
          sessions: updater(current),
        };
      })
    );
  };

  const handleUpdateSessionField = (dateIndex, sessionId, field, value) => {
    upsertDateSessions(dateIndex, (sessions) =>
      sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              [field]: value,
            }
          : session
      )
    );
  };

  const handleAddSession = (dateIndex) => {
    upsertDateSessions(dateIndex, (sessions) => [
      ...sessions,
      normalizeSession(
        {
          title: "",
          speaker_name: "",
        },
        sessions.length + dateIndex * 1000
      ),
    ]);
  };

  const handleRemoveSession = (dateIndex, sessionId) => {
    upsertDateSessions(dateIndex, (sessions) =>
      sessions.filter((session) => session.id !== sessionId)
    );
  };

  const generateSessionsForDate = (dateItem, dateIndex, interval) => {
    const startMinutes = parseTimeToMinutes(dateItem?.start_time);
    const endMinutes = parseTimeToMinutes(dateItem?.end_time);
    if (
      startMinutes === null ||
      endMinutes === null ||
      !Number.isFinite(interval) ||
      interval <= 0 ||
      endMinutes <= startMinutes
    ) {
      return [];
    }
    const existingByStart = new Map(
      (Array.isArray(dateItem?.sessions) ? dateItem.sessions : [])
        .filter((session) => session?.start_time)
        .map((session) => [String(session.start_time), session])
    );
    const generated = [];
    let cursor = startMinutes;
    let safety = 0;
    while (cursor < endMinutes && safety < 200) {
      const slotEnd = Math.min(cursor + interval, endMinutes);
      const startTime = formatMinutesToTime(cursor);
      const endTime = formatMinutesToTime(slotEnd);
      const previous = existingByStart.get(startTime);
      generated.push(
        normalizeSession(
          {
            ...previous,
            start_time: startTime,
            end_time: endTime,
          },
          dateIndex * 1000 + safety
        )
      );
      cursor = slotEnd;
      safety += 1;
    }
    return generated;
  };

  const handleGenerateByInterval = () => {
    const parsedInterval = Math.trunc(Number(intervalMinutes || 0));
    if (!Number.isFinite(parsedInterval) || parsedInterval <= 0) {
      setProgramStatus({
        type: "error",
        message: "Informe um intervalo válido em minutos (ex.: 20, 30, 60).",
      });
      return;
    }
    setProgramDates((prev) =>
      prev.map((dateItem, dateIndex) => ({
        ...dateItem,
        sessions: generateSessionsForDate(dateItem, dateIndex, parsedInterval),
      }))
    );
    setProgramStatus({
      type: "success",
      message: `Aulas geradas com intervalo de ${parsedInterval} minutos. Ajuste livremente antes de salvar.`,
    });
  };

  const handleDownloadProgramDoc = () => {
    if (!training) return;
    const tableRows = rows
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.date)}</td>
            <td>${escapeHtml(item.meeting)}</td>
            <td>${escapeHtml(item.schedule)}</td>
            <td>${escapeHtml(item.activity)}</td>
            <td>${escapeHtml(item.responsible)}</td>
          </tr>
        `
      )
      .join("");

    const html = `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Programação do evento - ${escapeHtml(training?.title || "-")}</title>
          <style>
            @page { margin: 2.5cm 2cm 2.5cm 3cm; }
            body { font-family: Arial, Helvetica, sans-serif; font-size: 12pt; line-height: 1.5; color: #111827; margin: 0; }
            h1 { margin: 0 0 14pt 0; text-align: center; text-transform: uppercase; font-size: 12pt; }
            p { margin: 0 0 8pt 0; text-align: justify; }
            .meta { margin-bottom: 12pt; }
            table { width: 100%; border-collapse: collapse; margin-top: 8pt; font-size: 11pt; }
            th, td { border: 1px solid #9ca3af; padding: 7px; vertical-align: top; }
            th { background: #f8fafc; text-align: left; }
          </style>
        </head>
        <body>
          <h1>Programação do evento – ${escapeHtml(training?.title || "-")}</h1>
          <div class="meta">
            <p><strong>Período:</strong> ${escapeHtml(dateRange)}</p>
            <p><strong>Horário:</strong> ${escapeHtml(scheduleSummary)}</p>
            <p><strong>Carga horária:</strong> ${escapeHtml(
              training?.duration_hours ? `${training.duration_hours} horas` : "Não informada"
            )}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Encontro</th>
                <th>Horário</th>
                <th>Atividade / Tema</th>
                <th>Responsável</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const blob = new Blob(["\ufeff", html], {
      type: "application/msword;charset=utf-8",
    });
    const fileName = `programacao_evento_${sanitizeFileName(training?.title)}_${sanitizeFileName(
      formatDateSafe(new Date(), "yyyy-MM-dd")
    )}.doc`;
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Programação do Evento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleDownloadProgramDoc}>
              <Download className="h-4 w-4 mr-1" />
              Baixar programação (.doc)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => saveProgram.mutate()}
              disabled={saveProgram.isPending}
            >
              <Save className="h-4 w-4 mr-1" />
              {saveProgram.isPending ? "Salvando..." : "Salvar programação"}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,220px)_auto] gap-3 items-end rounded-md border border-slate-200 p-3 bg-white">
            <div className="space-y-1.5">
              <Label htmlFor="program-interval-minutes">Intervalo de aula (minutos)</Label>
              <Input
                id="program-interval-minutes"
                type="number"
                min="5"
                step="5"
                value={intervalMinutes}
                onChange={(event) => setIntervalMinutes(event.target.value)}
                placeholder="20, 30, 60..."
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={handleGenerateByInterval}>
                Gerar aulas por intervalo
              </Button>
            </div>
          </div>

          {programStatus && (
            <Alert
              className={
                programStatus.type === "error"
                  ? "border-red-200 bg-red-50"
                  : "border-green-200 bg-green-50"
              }
            >
              <AlertDescription
                className={
                  programStatus.type === "error"
                    ? "text-red-800"
                    : "text-green-800"
                }
              >
                {programStatus.message}
              </AlertDescription>
            </Alert>
          )}

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p>
              <strong>Período:</strong> {dateRange}
            </p>
            <p>
              <strong>Horário:</strong> {scheduleSummary}
            </p>
            <p>
              <strong>Carga horária:</strong>{" "}
              {training?.duration_hours ? `${training.duration_hours} horas` : "Não informada"}
            </p>
          </div>

          <div className="space-y-4">
            {programDates.map((dateItem, dateIndex) => {
              const sessions = Array.isArray(dateItem?.sessions) ? dateItem.sessions : [];
              return (
                <Card key={`program-date-${dateItem?.date || dateIndex}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between gap-3">
                      <span>
                        {formatDateSafe(dateItem?.date, "dd/MM/yyyy") || "Data não definida"}
                        <span className="ml-2 text-slate-500 font-normal">
                          ({dateItem?.start_time || "--:--"} às {dateItem?.end_time || "--:--"})
                        </span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleAddSession(dateIndex)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar aula
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {sessions.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Nenhuma aula cadastrada para esta data.
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50">
                              <TableHead className="w-[120px]">Início</TableHead>
                              <TableHead className="w-[120px]">Fim</TableHead>
                              <TableHead>Tema da aula</TableHead>
                              <TableHead>Palestrante</TableHead>
                              <TableHead className="w-[90px]">Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sessions.map((session) => (
                              <TableRow key={session.id}>
                                <TableCell>
                                  <Input
                                    type="time"
                                    value={session.start_time}
                                    onChange={(event) =>
                                      handleUpdateSessionField(
                                        dateIndex,
                                        session.id,
                                        "start_time",
                                        event.target.value
                                      )
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="time"
                                    value={session.end_time}
                                    onChange={(event) =>
                                      handleUpdateSessionField(
                                        dateIndex,
                                        session.id,
                                        "end_time",
                                        event.target.value
                                      )
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={session.title}
                                    onChange={(event) =>
                                      handleUpdateSessionField(
                                        dateIndex,
                                        session.id,
                                        "title",
                                        event.target.value
                                      )
                                    }
                                    placeholder="Ex.: Diagnóstico clínico do tracoma"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={session.speaker_name}
                                    onChange={(event) =>
                                      handleUpdateSessionField(
                                        dateIndex,
                                        session.id,
                                        "speaker_name",
                                        event.target.value
                                      )
                                    }
                                    placeholder="Ex.: Norma Helen Medina"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700"
                                    onClick={() => handleRemoveSession(dateIndex, session.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <p className="text-xs text-slate-500">
            Você pode gerar as aulas por intervalo (20, 30, 60 min etc.) e editar tema e palestrante de cada aula antes de salvar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
