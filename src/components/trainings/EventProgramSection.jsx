import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CalendarDays,
  ClipboardPaste,
  Copy,
  Download,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
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

const hasSessionTypedContent = (session) =>
  Boolean(
    String(session?.start_time || "").trim() ||
      String(session?.end_time || "").trim() ||
      String(session?.title || session?.activity || "").trim() ||
      String(session?.speaker_name || session?.responsible || "").trim() ||
      String(session?.notes || "").trim()
  );

const formatProgramDescription = (session) => {
  const start = String(session?.start_time || "").trim();
  const end = String(session?.end_time || "").trim();
  const title = String(session?.title || session?.activity || "").trim();
  const speaker = String(
    session?.speaker_name || session?.responsible || session?.speaker || ""
  ).trim();
  const notes = String(session?.notes || "").trim();

  const parts = [];
  if (start && end) {
    parts.push(`${start} às ${end}`);
  } else if (start || end) {
    parts.push(start || end);
  }
  if (title) {
    parts.push(title);
  }
  if (speaker) {
    parts.push(speaker);
  }
  if (notes) {
    parts.push(notes);
  }
  return parts.join(" • ").trim();
};

export default function EventProgramSection({ training }) {
  const queryClient = useQueryClient();
  const [intervalMinutes, setIntervalMinutes] = useState("");
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

  const normalizeImportedSessions = (sessions = [], dateIndex = 0) =>
    (Array.isArray(sessions) ? sessions : [])
      .map((session, sessionIndex) =>
        normalizeSession(
          {
            start_time: session?.start_time,
            end_time: session?.end_time,
            title: session?.title || session?.activity,
            speaker_name:
              session?.speaker_name || session?.responsible || session?.speaker,
            notes: session?.notes,
          },
          dateIndex * 100 + sessionIndex
        )
      );

  const getTypedSessions = (sessions = [], dateIndex = 0) =>
    normalizeImportedSessions(sessions, dateIndex).filter(hasSessionTypedContent);

  const sortSessionsByStartTime = (sessions) =>
    [...sessions].sort((a, b) => {
      const startA = parseTimeToMinutes(a.start_time);
      const startB = parseTimeToMinutes(b.start_time);
      if (startA === null && startB === null) return 0;
      if (startA === null) return 1;
      if (startB === null) return -1;
      return startA - startB;
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
          sessions: sortSessionsByStartTime(
            normalizeImportedSessions(item?.sessions, dateIndex)
          ),
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

  const normalizedProgramRows = useMemo(() => {
    const rows = [];
    programDates.forEach((dateItem) => {
      const dateLabel = formatDateSafe(dateItem?.date, "dd/MM/yyyy") || "-";
      const sessions = sortSessionsByStartTime(
        getTypedSessions(dateItem?.sessions)
      );
      sessions.forEach((session, sessionIndex) => {
        const description = formatProgramDescription(session);
        if (!description) return;
        rows.push({
          date: sessionIndex === 0 ? dateLabel : "",
          description,
        });
      });
    });
    return rows;
  }, [programDates]);

  const totalTypedSessions = useMemo(
    () => normalizedProgramRows.length,
    [normalizedProgramRows]
  );

  const saveProgram = useMutation({
    mutationFn: async () => {
      if (!training?.id) throw new Error("Treinamento inválido.");
      const payloadDates = programDates.map((dateItem, dateIndex) => ({
        ...dateItem,
        sessions: getTypedSessions(dateItem?.sessions, dateIndex).map(
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
          notes: "",
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
      normalizeImportedSessions(dateItem?.sessions, dateIndex)
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
      message: `Aulas geradas com intervalo de ${parsedInterval} minutos.`,
    });
  };

  const handleCopyProgram = async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard?.writeText
    ) {
      setProgramStatus({
        type: "error",
        message:
          "Seu navegador não permite cópia automática. Copie manualmente.",
      });
      return;
    }

    const payload = {
      type: "training-program",
      version: 1,
      copied_at: new Date().toISOString(),
      source_training_title: String(training?.title || "").trim(),
      dates: programDates.map((dateItem, dateIndex) => ({
        date: String(dateItem?.date || "").trim(),
        sessions: getTypedSessions(dateItem?.sessions, dateIndex).map(
          (session) => ({
            start_time: session.start_time,
            end_time: session.end_time,
            title: session.title,
            speaker_name: session.speaker_name,
            notes: session.notes,
          })
        ),
      })),
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setProgramStatus({
        type: "success",
        message: "Programação copiada. Você pode colar em outro evento.",
      });
    } catch {
      setProgramStatus({
        type: "error",
        message: "Não foi possível copiar a programação.",
      });
    }
  };

  const handlePasteProgram = async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard?.readText
    ) {
      setProgramStatus({
        type: "error",
        message:
          "Seu navegador não permite leitura automática da área de transferência.",
      });
      return;
    }

    try {
      const clipboardText = await navigator.clipboard.readText();
      const parsed = JSON.parse(clipboardText || "{}");
      const importedDates = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.dates)
          ? parsed.dates
          : [];

      if (importedDates.length === 0) {
        setProgramStatus({
          type: "error",
          message: "Não encontrei uma programação válida para colar.",
        });
        return;
      }

      setProgramDates((prev) =>
        prev.map((dateItem, dateIndex) => {
          const dateKey = String(dateItem?.date || "").trim();
          const byDate = importedDates.find(
            (item) => String(item?.date || "").trim() === dateKey
          );
          const byIndex = importedDates[dateIndex];
          const source = byDate || byIndex;
          if (!source) return dateItem;
          return {
            ...dateItem,
            sessions: sortSessionsByStartTime(
              normalizeImportedSessions(source?.sessions, dateIndex)
            ),
          };
        })
      );

      setProgramStatus({
        type: "success",
        message:
          "Programação colada com sucesso. Revise e clique em salvar.",
      });
    } catch {
      setProgramStatus({
        type: "error",
        message:
          "Não foi possível colar. Copie uma programação válida em formato JSON.",
      });
    }
  };

  const handleDownloadProgramDoc = () => {
    if (!training) return;
    if (!normalizedProgramRows.length) {
      setProgramStatus({
        type: "error",
        message:
          "Não há programação digitada para exportar. Preencha as aulas primeiro.",
      });
      return;
    }

    const tableRows = normalizedProgramRows
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.date)}</td>
            <td>${escapeHtml(item.description)}</td>
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
            body {
              font-family: Arial, Helvetica, sans-serif;
              font-size: 12pt;
              line-height: 1.5;
              color: #111827;
              margin: 0;
            }
            h1 {
              margin: 0 0 14pt 0;
              text-align: center;
              text-transform: uppercase;
              font-size: 12pt;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 8pt;
              font-size: 11pt;
            }
            th, td {
              border: 1px solid #9ca3af;
              padding: 7px;
              vertical-align: top;
            }
            th {
              background: #f8fafc;
              text-align: left;
            }
          </style>
        </head>
        <body>
          <h1>Programação do evento – ${escapeHtml(training?.title || "-")}</h1>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Programação digitada</th>
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

  const hasProgramDates = programDates.length > 0;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border border-slate-200 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-blue-600" />
            Programação do Evento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
              onClick={() => saveProgram.mutate()}
              disabled={saveProgram.isPending}
            >
              <Save className="mr-1 h-4 w-4" />
              {saveProgram.isPending ? "Salvando..." : "Salvar programação"}
            </Button>

            <Button type="button" variant="outline" size="sm" onClick={handleCopyProgram}>
              <Copy className="mr-1 h-4 w-4" />
              Copiar programação
            </Button>

            <Button type="button" variant="outline" size="sm" onClick={handlePasteProgram}>
              <ClipboardPaste className="mr-1 h-4 w-4" />
              Colar programação
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadProgramDoc}
              disabled={totalTypedSessions === 0}
            >
              <Download className="mr-1 h-4 w-4" />
              Baixar programação (.doc)
            </Button>

            <div className="ml-auto text-xs font-medium text-slate-600">
              {totalTypedSessions} aula(s) digitada(s)
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,220px)_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="program-interval-minutes">Gerar aulas por intervalo (opcional)</Label>
                <Input
                  id="program-interval-minutes"
                  type="number"
                  min="5"
                  step="5"
                  value={intervalMinutes}
                  onChange={(event) => setIntervalMinutes(event.target.value)}
                  placeholder="Ex.: 20, 30, 60"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {[20, 30, 60].map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIntervalMinutes(String(value))}
                  >
                    {value} min
                  </Button>
                ))}
                <Button type="button" size="sm" onClick={handleGenerateByInterval}>
                  Gerar
                </Button>
              </div>
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

          {!hasProgramDates ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              Cadastre ao menos uma data no treinamento para montar a programação.
            </div>
          ) : (
            <div className="space-y-4">
              {programDates.map((dateItem, dateIndex) => {
                const sessions = sortSessionsByStartTime(
                  normalizeImportedSessions(dateItem?.sessions, dateIndex)
                );
                return (
                  <Card
                    key={`program-date-${dateItem?.date || dateIndex}`}
                    className="border border-slate-200 shadow-sm"
                  >
                    <CardHeader className="border-b border-slate-100 bg-slate-50/70 pb-3">
                      <CardTitle className="text-sm flex items-center justify-between gap-3">
                        <span className="font-semibold text-slate-800">
                          {formatDateSafe(dateItem?.date, "dd/MM/yyyy") || "Data não definida"}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-blue-200 text-blue-700 hover:bg-blue-50"
                          onClick={() => handleAddSession(dateIndex)}
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          Adicionar aula
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-4">
                      {sessions.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">
                          Nenhuma aula digitada para esta data.
                        </div>
                      ) : (
                        sessions.map((session) => (
                          <div
                            key={session.id}
                            className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                          >
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
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
                                placeholder="Tema / atividade"
                              />
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
                                placeholder="Palestrante"
                              />
                            </div>
                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                              <Input
                                value={session.notes}
                                onChange={(event) =>
                                  handleUpdateSessionField(
                                    dateIndex,
                                    session.id,
                                    "notes",
                                    event.target.value
                                  )
                                }
                                placeholder="Observação opcional"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleRemoveSession(dateIndex, session.id)}
                              >
                                <Trash2 className="mr-1 h-4 w-4" />
                                Remover aula
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
