import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CalendarDays,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Download,
  GripVertical,
  Plus,
  Save,
  Trash2,
  UserCheck,
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
      String(session?.speaker_name || session?.responsible || "").trim()
  );

const normalizeTimeValue = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/^(\d{1,2})(?::?(\d{1,2}))?$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2] || "0");
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const formatTimeDraft = (value) => {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 4);
  if (!digits) return "";
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

export default function EventProgramSection({ training }) {
  const queryClient = useQueryClient();

  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => dataClient.entities.Professional.list("name"),
  });

  const [programDates, setProgramDates] = useState([]);
  const [programStatus, setProgramStatus] = useState(null);
  const [dragState, setDragState] = useState(null);
  const [dragOverState, setDragOverState] = useState(null);
  // Duração padrão por dia (em minutos), indexada por dateIndex
  const [defaultDurations, setDefaultDurations] = useState({});
  const trainingProgramSignature = useMemo(() => {
    const normalizedDates = Array.isArray(training?.dates)
      ? training.dates.map((dateItem) => ({
          date: String(dateItem?.date || "").trim(),
          start_time: String(dateItem?.start_time || "").trim(),
          end_time: String(dateItem?.end_time || "").trim(),
          sessions: (Array.isArray(dateItem?.sessions) ? dateItem.sessions : []).map(
            (session) => ({
              start_time: String(session?.start_time || "").trim(),
              end_time: String(session?.end_time || "").trim(),
              title: String(session?.title || session?.activity || "").trim(),
              speaker_name: String(
                session?.speaker_name || session?.responsible || session?.speaker || ""
              ).trim(),
            })
          ),
        }))
      : [];

    return JSON.stringify({
      date: String(training?.date || "").trim(),
      start_time: String(training?.start_time || "").trim(),
      end_time: String(training?.end_time || "").trim(),
      dates: normalizedDates,
    });
  }, [training?.date, training?.dates, training?.end_time, training?.start_time]);

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
    professional_id: String(session?.professional_id || "").trim(),
    professional_email: String(session?.professional_email || "").trim(),
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
  }, [training?.id, trainingProgramSignature]);

  const groupedProgramRows = useMemo(
    () =>
      programDates
        .map((dateItem) => ({
          dateLabel: formatDateSafe(dateItem?.date, "dd/MM/yyyy") || "-",
          rawDate: dateItem?.date,
          sessions: sortSessionsByStartTime(getTypedSessions(dateItem?.sessions)),
        }))
        .filter((group) => group.sessions.length > 0),
    [programDates]
  );

  const totalTypedSessions = useMemo(
    () =>
      groupedProgramRows.reduce(
        (acc, group) => acc + group.sessions.length,
        0
      ),
    [groupedProgramRows]
  );

  const syncSpeakersFromSessions = (existingSpeakers, dates) => {
    const base = Array.isArray(existingSpeakers) ? existingSpeakers.map((s) => ({ ...s })) : [];
    const seenIds = new Set(base.map((s) => s.professional_id).filter(Boolean));

    dates.forEach((dateItem) => {
      (Array.isArray(dateItem?.sessions) ? dateItem.sessions : []).forEach((session) => {
        const name = String(session.speaker_name || "").trim();
        if (!name) return;
        const nameLower = name.toLowerCase();

        if (session.professional_id) {
          if (seenIds.has(session.professional_id)) return;
          seenIds.add(session.professional_id);
          // Se já existe entrada sem vínculo com o mesmo nome, atualiza em vez de duplicar
          const existingIdx = base.findIndex(
            (s) => !s.professional_id && String(s.name || "").trim().toLowerCase() === nameLower
          );
          if (existingIdx >= 0) {
            base[existingIdx] = {
              ...base[existingIdx],
              name,
              professional_id: session.professional_id,
              email: String(session.professional_email || "").trim() || base[existingIdx].email,
              lecture: String(session.title || "").trim() || base[existingIdx].lecture,
            };
          } else {
            base.push({
              name,
              professional_id: session.professional_id,
              email: String(session.professional_email || "").trim(),
              lecture: String(session.title || "").trim(),
            });
          }
        } else {
          // Sem vínculo: deduplica por nome (ignora se já há entrada vinculada com o mesmo nome)
          const alreadyExists = base.some(
            (s) => String(s.name || "").trim().toLowerCase() === nameLower
          );
          if (!alreadyExists) {
            base.push({
              name,
              professional_id: "",
              email: "",
              lecture: String(session.title || "").trim(),
            });
          }
        }
      });
    });
    return base;
  };

  const saveProgram = useMutation({
    mutationFn: async () => {
      if (!training?.id) throw new Error("Treinamento inválido.");
      const payloadDates = programDates.map((dateItem, dateIndex) => ({
        ...dateItem,
        sessions: getTypedSessions(dateItem?.sessions, dateIndex).map(
          (session) => ({
            start_time:
              normalizeTimeValue(session?.start_time) ||
              String(session?.start_time || "").trim(),
            end_time:
              normalizeTimeValue(session?.end_time) ||
              String(session?.end_time || "").trim(),
            title: String(session?.title || "").trim(),
            speaker_name: String(session?.speaker_name || "").trim(),
            professional_id: String(session?.professional_id || "").trim(),
            professional_email: String(session?.professional_email || "").trim(),
          })
        ),
      }));
      const syncedSpeakers = syncSpeakersFromSessions(training?.speakers, payloadDates);
      await dataClient.entities.Training.update(training.id, {
        dates: payloadDates,
        speakers: syncedSpeakers,
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

  const handleDuplicateSession = (dateIndex, sessionId) => {
    upsertDateSessions(dateIndex, (sessions) => {
      const idx = sessions.findIndex((s) => s.id === sessionId);
      if (idx < 0) return sessions;
      const original = sessions[idx];
      const copy = normalizeSession(
        {
          start_time: original.start_time,
          end_time: original.end_time,
          title: original.title,
          speaker_name: original.speaker_name,
          professional_id: original.professional_id,
          professional_email: original.professional_email,
        },
        idx + dateIndex * 1000 + Date.now()
      );
      const next = [...sessions];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  // Calcula fim = início + duração (prioridade: sessão anterior > duração padrão do dia > 60min)
  const handleStartTimeChange = (dateIndex, sessionId, newStart) => {
    handleUpdateSessionField(dateIndex, sessionId, "start_time", newStart);

    setProgramDates((prev) => {
      const dateItem = prev[dateIndex];
      const sessions = Array.isArray(dateItem?.sessions) ? dateItem.sessions : [];
      const idx = sessions.findIndex((s) => s.id === sessionId);
      if (idx < 0) return prev;
      const session = sessions[idx];

      if (session.end_time) return prev; // não sobrescreve fim já preenchido
      if (!newStart) return prev;

      // 1. Duração da sessão anterior
      let durationMinutes = null;
      const prevSession = sessions[idx - 1];
      if (prevSession?.start_time && prevSession?.end_time) {
        const s = parseTimeToMinutes(prevSession.start_time);
        const e = parseTimeToMinutes(prevSession.end_time);
        if (s !== null && e !== null && e > s) durationMinutes = e - s;
      }
      // 2. Duração padrão configurada para este dia
      if (durationMinutes === null) {
        const configured = Number(defaultDurations[dateIndex]);
        if (Number.isFinite(configured) && configured > 0) durationMinutes = configured;
      }
      // 3. Fallback: 60 min
      if (durationMinutes === null) durationMinutes = 60;

      const startMin = parseTimeToMinutes(newStart);
      if (startMin === null) return prev;
      const endMin = startMin + durationMinutes;
      const endH = String(Math.floor(endMin / 60) % 24).padStart(2, "0");
      const endM = String(endMin % 60).padStart(2, "0");

      return prev.map((item, i) =>
        i !== dateIndex
          ? item
          : {
              ...item,
              sessions: item.sessions.map((s) =>
                s.id === sessionId ? { ...s, end_time: `${endH}:${endM}` } : s
              ),
            }
      );
    });
  };

  const handleUpdateSessionSpeaker = (dateIndex, sessionId, name, professionalId, professionalEmail) => {
    upsertDateSessions(dateIndex, (sessions) =>
      sessions.map((session) =>
        session.id === sessionId
          ? { ...session, speaker_name: name, professional_id: professionalId, professional_email: professionalEmail }
          : session
      )
    );
  };

  const handleDragStart = (e, dateIndex, sessionId) => {
    setDragState({ dateIndex, sessionId });
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, dateIndex, sessionIndex) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverState({ dateIndex, sessionIndex });
  };

  const handleDrop = (e, targetDateIndex, targetSessionIndex) => {
    e.preventDefault();
    if (!dragState) return;
    const { dateIndex: srcDateIndex, sessionId } = dragState;
    setDragState(null);
    setDragOverState(null);
    setProgramDates((prev) => {
      const next = prev.map((dateItem) => ({
        ...dateItem,
        sessions: [...(Array.isArray(dateItem.sessions) ? dateItem.sessions : [])],
      }));
      const srcSession = next[srcDateIndex]?.sessions.find((s) => s.id === sessionId);
      if (!srcSession) return prev;
      next[srcDateIndex].sessions = next[srcDateIndex].sessions.filter((s) => s.id !== sessionId);
      if (!next[targetDateIndex]) return next;
      const insertAt = Math.min(targetSessionIndex, next[targetDateIndex].sessions.length);
      next[targetDateIndex].sessions.splice(insertAt, 0, srcSession);
      return next;
    });
  };

  const handleDragEnd = () => {
    setDragState(null);
    setDragOverState(null);
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
            start_time:
              normalizeTimeValue(session.start_time) || session.start_time,
            end_time:
              normalizeTimeValue(session.end_time) || session.end_time,
            title: session.title,
            speaker_name: session.speaker_name,
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
    if (!groupedProgramRows.length) {
      setProgramStatus({
        type: "error",
        message:
          "Não há programação digitada para exportar. Preencha as aulas primeiro.",
      });
      return;
    }

    const WEEKDAYS_PT = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
    const getWeekdayLabel = (rawDate) => {
      const dt = parseDateSafe(rawDate);
      return dt && !Number.isNaN(dt.getTime()) ? WEEKDAYS_PT[dt.getDay()] : "";
    };

    const dayBlocks = groupedProgramRows
      .map(
        (group) => {
          const weekday = getWeekdayLabel(group.rawDate);
          const dayHeaderText = weekday
            ? `${escapeHtml(group.dateLabel)} — ${escapeHtml(weekday)}`
            : escapeHtml(group.dateLabel);
          return `
        <div class="day-block">
          <div class="day-header">${dayHeaderText}</div>
          <table>
            <thead>
              <tr>
                <th class="col-time">Início</th>
                <th class="col-time">Fim</th>
                <th>Tema / Atividade</th>
                <th class="col-speaker">Palestrante</th>
              </tr>
            </thead>
            <tbody>
              ${group.sessions
                .map(
                  (session) => `
                  <tr>
                    <td>${escapeHtml(normalizeTimeValue(session.start_time) || session.start_time || "-")}</td>
                    <td>${escapeHtml(normalizeTimeValue(session.end_time) || session.end_time || "-")}</td>
                    <td>${escapeHtml(session.title || "-")}</td>
                    <td>${escapeHtml(session.speaker_name || "-")}</td>
                  </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>`;
        }
      )
      .join("");

    const html = `
      <!doctype html>
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:w="urn:schemas-microsoft-com:office:word"
            xmlns="http://www.w3.org/TR/REC-html40"
            lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Programação do evento - ${escapeHtml(training?.title || "-")}</title>
          <xml>
            <w:WordDocument>
              <w:View>Print</w:View>
              <w:Zoom>100</w:Zoom>
            </w:WordDocument>
          </xml>
          <style>
            @page WordSection1 {
              size: 21.0cm 29.7cm;
              margin: 2.5cm 1.5cm 2.5cm 1.5cm;
              mso-page-margin-top: 2.5cm;
              mso-page-margin-bottom: 2.5cm;
              mso-page-margin-left: 1.5cm;
              mso-page-margin-right: 1.5cm;
              mso-paper-source: 0;
            }
            div.WordSection1 { page: WordSection1; }
            * { box-sizing: border-box; }
            body {
              font-family: Arial, Helvetica, sans-serif;
              font-size: 12pt;
              line-height: 1.5;
              color: #111827;
              margin: 0;
            }
            .hero {
              width: 100%;
              border: 1px solid #cbd5e1;
              border-top: 5px solid #1d4ed8;
              padding: 12px 14px;
              margin-bottom: 14pt;
              background: #f8fafc;
            }
            .hero p {
              margin: 0;
              text-align: center;
            }
            .hero .org {
              font-size: 9.5pt;
              font-weight: 700;
              color: #1e3a8a;
              text-transform: uppercase;
              letter-spacing: 0.2px;
            }
            .hero .doc-title {
              margin-top: 6px;
              font-size: 12pt;
              font-weight: 700;
              color: #0f172a;
              text-transform: uppercase;
            }
            .hero .doc-subtitle {
              margin-top: 3px;
              font-size: 10.5pt;
              color: #334155;
            }
            .meta-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 14pt;
              font-size: 10.5pt;
            }
            .meta-table td {
              border: 1px solid #cbd5e1;
              padding: 7px 8px;
              vertical-align: top;
              width: 50%;
              background: #ffffff;
            }
            .day-block {
              width: 100%;
              margin-bottom: 12pt;
              page-break-inside: avoid;
            }
            .day-header {
              background: #1d4ed8;
              color: #ffffff;
              font-weight: 700;
              font-size: 11pt;
              padding: 5px 8px;
              text-transform: uppercase;
              letter-spacing: 0.3px;
              line-height: 1.3;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 11pt;
            }
            th, td {
              border: 1px solid #9ca3af;
              padding: 6px 8px;
              vertical-align: top;
            }
            th {
              background: #dbeafe;
              color: #1e3a8a;
              font-weight: 700;
              text-align: left;
              border-top: none;
            }
            .col-time { width: 64px; white-space: nowrap; }
            .col-speaker { width: 28%; }
            tr:nth-child(even) td { background: #f8fafc; }
          </style>
        </head>
        <body>
          <div class="WordSection1">
          <div class="hero">
            <p class="org">Secretaria de Estado da Saúde • CVE • CCD • São Paulo</p>
            <p class="doc-title">Programação do treinamento</p>
            <p class="doc-subtitle">${escapeHtml(training?.title || "-")}</p>
          </div>

          <table class="meta-table">
            <tr>
              <td><strong>Treinamento:</strong><br/>${escapeHtml(training?.title || "-")}</td>
              <td><strong>Período:</strong><br/>${escapeHtml(trainingPeriodLabel)}</td>
            </tr>
            <tr>
              <td><strong>Local:</strong><br/>${escapeHtml(
                training?.location || (training?.online_link ? "Evento online" : "Não informado")
              )}</td>
              <td><strong>Coordenação:</strong><br/>${escapeHtml(training?.coordinator || "-")}</td>
            </tr>
            <tr>
              <td colspan="2"><strong>Carga horária:</strong> ${escapeHtml(
                training?.duration_hours ? `${training.duration_hours} horas` : "Não informada"
              )}</td>
            </tr>
          </table>

          ${dayBlocks}
          </div>
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
  const trainingPeriodLabel = useMemo(() => {
    if (programDates.length === 0) {
      return formatDateSafe(training?.date, "dd/MM/yyyy") || "Data não informada";
    }
    const sorted = [...programDates].sort(
      (a, b) => parseDateSafe(a?.date).getTime() - parseDateSafe(b?.date).getTime()
    );
    const first = formatDateSafe(sorted[0]?.date, "dd/MM/yyyy") || "-";
    const last = formatDateSafe(sorted[sorted.length - 1]?.date, "dd/MM/yyyy") || "-";
    return first === last ? first : `${first} a ${last}`;
  }, [programDates, training?.date]);

  const totalSessions = useMemo(
    () =>
      programDates.reduce(
        (acc, dateItem) =>
          acc +
          (Array.isArray(dateItem?.sessions) ? dateItem.sessions.length : 0),
        0
      ),
    [programDates]
  );

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border border-slate-200 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 pb-4">
          <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-blue-600" />
            Programação do Evento
          </CardTitle>
          <p className="text-sm text-slate-600">
            {training?.title || "Treinamento sem título"}
          </p>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Treinamento
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {training?.title || "Não informado"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Período
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{trainingPeriodLabel}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Local
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {training?.location || (training?.online_link ? "Evento online" : "Não informado")}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Coordenação
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {training?.coordinator || "-"}
              </p>
            </div>
          </div>

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

            <div className="ml-auto text-xs font-medium text-slate-500">
              {totalTypedSessions} aula{totalTypedSessions !== 1 ? "s" : ""} com conteúdo
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
              <datalist id="professionals-datalist">
                {professionals.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
              {programDates.map((dateItem, dateIndex) => {
                const sessions = Array.isArray(dateItem?.sessions)
                  ? dateItem.sessions
                  : [];
                const dateLabel =
                  formatDateSafe(dateItem?.date, "dd/MM/yyyy") || "Data não definida";
                return (
                  <Card
                    key={`program-date-${dateItem?.date || dateIndex}`}
                    className="rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                  >
                    <CardHeader className="border-b border-slate-100 bg-slate-50/70 pb-3">
                      <CardTitle className="text-sm flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <CalendarDays className="h-4 w-4 text-blue-500 shrink-0" />
                          <span className="font-semibold text-slate-800 truncate">{dateLabel}</span>
                          <span className="hidden sm:inline text-xs font-normal text-slate-400 shrink-0">
                            · {sessions.filter(hasSessionTypedContent).length} aula{sessions.filter(hasSessionTypedContent).length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Duração padrão por dia */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-400 hidden sm:inline whitespace-nowrap">Duração padrão:</span>
                            <select
                              value={defaultDurations[dateIndex] ?? "60"}
                              onChange={(e) =>
                                setDefaultDurations((prev) => ({
                                  ...prev,
                                  [dateIndex]: Number(e.target.value),
                                }))
                              }
                              className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                              title="Duração padrão das aulas deste dia"
                            >
                              <option value="30">30 min</option>
                              <option value="45">45 min</option>
                              <option value="60">1h</option>
                              <option value="90">1h30</option>
                              <option value="120">2h</option>
                              <option value="180">3h</option>
                            </select>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-blue-200 text-blue-700 hover:bg-blue-50"
                            onClick={() => handleAddSession(dateIndex)}
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Adicionar aula</span>
                            <span className="sm:hidden">Adicionar</span>
                          </Button>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-3 px-3 pb-3">
                      {sessions.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => handleAddSession(dateIndex)}
                          className="w-full rounded-xl border-2 border-dashed border-slate-200 py-6 text-sm text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-colors text-center"
                        >
                          + Clique para adicionar a primeira aula
                        </button>
                      ) : (
                        <>
                          {/* ── DESKTOP: tabela ── */}
                          <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-slate-100/70">
                                  <TableHead className="w-8 p-2" />
                                  <TableHead className="w-28">Data</TableHead>
                                  <TableHead className="w-28">Início</TableHead>
                                  <TableHead className="w-28">Fim</TableHead>
                                  <TableHead>Tema / atividade</TableHead>
                                  <TableHead className="min-w-[200px]">Palestrante</TableHead>
                                  <TableHead className="w-10" />
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sessions.map((session, sessionIndex) => (
                                  <TableRow
                                    key={session.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, dateIndex, session.id)}
                                    onDragOver={(e) => handleDragOver(e, dateIndex, sessionIndex)}
                                    onDrop={(e) => handleDrop(e, dateIndex, sessionIndex)}
                                    onDragEnd={handleDragEnd}
                                    className={`align-middle transition-opacity ${
                                      dragState?.sessionId === session.id ? "opacity-40" : ""
                                    } ${
                                      dragOverState?.dateIndex === dateIndex &&
                                      dragOverState?.sessionIndex === sessionIndex
                                        ? "border-t-2 border-blue-400 bg-blue-50/40"
                                        : ""
                                    }`}
                                  >
                                    <TableCell className="p-2 text-slate-300 cursor-grab active:cursor-grabbing">
                                      <GripVertical className="h-4 w-4" />
                                    </TableCell>
                                    {sessionIndex === 0 ? (
                                      <TableCell
                                        rowSpan={sessions.length}
                                        className="font-semibold text-slate-700 align-middle text-center bg-slate-50 text-sm px-3 whitespace-nowrap"
                                      >
                                        {dateLabel}
                                      </TableCell>
                                    ) : null}
                                    <TableCell className="py-1.5 px-2">
                                      <Input
                                        type="time"
                                        value={session.start_time}
                                        onChange={(e) => handleStartTimeChange(dateIndex, session.id, e.target.value)}
                                        className="h-8 text-sm px-2"
                                      />
                                    </TableCell>
                                    <TableCell className="py-1.5 px-2">
                                      <Input
                                        type="time"
                                        value={session.end_time}
                                        onChange={(e) => handleUpdateSessionField(dateIndex, session.id, "end_time", e.target.value)}
                                        className="h-8 text-sm px-2"
                                      />
                                    </TableCell>
                                    <TableCell className="py-1.5 px-2">
                                      <Input
                                        value={session.title}
                                        onChange={(e) => handleUpdateSessionField(dateIndex, session.id, "title", e.target.value)}
                                        placeholder="Tema / atividade"
                                        className="h-8 text-sm"
                                      />
                                    </TableCell>
                                    <TableCell className="py-1.5 px-2">
                                      <div className="relative">
                                        <Input
                                          value={session.speaker_name}
                                          list="professionals-datalist"
                                          onChange={(e) => {
                                            const name = e.target.value;
                                            const matched = professionals.find((p) => p.name === name);
                                            handleUpdateSessionSpeaker(dateIndex, session.id, name, matched?.id || "", matched?.email || "");
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              e.preventDefault();
                                              handleAddSession(dateIndex);
                                            }
                                          }}
                                          placeholder="Nome do palestrante"
                                          className={`h-8 text-sm ${session.professional_id ? "pr-7 border-green-400 focus-visible:ring-green-400" : ""}`}
                                        />
                                        {session.professional_id && (
                                          <UserCheck className="h-3.5 w-3.5 text-green-600 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-1.5 px-1">
                                      <div className="flex items-center gap-0.5">
                                        <button
                                          type="button"
                                          onClick={() => handleDuplicateSession(dateIndex, session.id)}
                                          className="text-slate-300 hover:text-blue-500 transition-colors p-1 rounded"
                                          title="Duplicar aula"
                                        >
                                          <CopyPlus className="h-4 w-4" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveSession(dateIndex, session.id)}
                                          className="text-slate-300 hover:text-red-500 transition-colors p-1 rounded"
                                          title="Remover"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                                {dragState && dragState.dateIndex !== dateIndex && (
                                  <TableRow
                                    onDragOver={(e) => handleDragOver(e, dateIndex, sessions.length)}
                                    onDrop={(e) => handleDrop(e, dateIndex, sessions.length)}
                                    className={`h-8 border-dashed border-2 ${
                                      dragOverState?.dateIndex === dateIndex &&
                                      dragOverState?.sessionIndex === sessions.length
                                        ? "border-blue-400 bg-blue-50"
                                        : "border-slate-200"
                                    }`}
                                  >
                                    <TableCell colSpan={7} className="text-center text-xs text-slate-400">
                                      Solte aqui para mover para este dia
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </div>

                          {/* ── MOBILE: cards ── */}
                          <div className="md:hidden space-y-2">
                            {sessions.map((session, sessionIndex) => (
                              <div
                                key={session.id}
                                className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5"
                              >
                                <div className="flex items-center gap-2">
                                  <GripVertical className="h-4 w-4 text-slate-300 shrink-0" />
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                    Aula {sessionIndex + 1}
                                  </span>
                                  <div className="ml-auto flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleDuplicateSession(dateIndex, session.id)}
                                      className="text-slate-300 hover:text-blue-500 transition-colors p-0.5"
                                      title="Duplicar"
                                    >
                                      <CopyPlus className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveSession(dateIndex, session.id)}
                                      className="text-slate-300 hover:text-red-500 transition-colors p-0.5"
                                      title="Remover"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <div className="flex-1 space-y-1">
                                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Início</label>
                                    <Input
                                      type="time"
                                      value={session.start_time}
                                      onChange={(e) => handleStartTimeChange(dateIndex, session.id, e.target.value)}
                                      className="h-9 text-sm"
                                    />
                                  </div>
                                  <div className="flex-1 space-y-1">
                                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Fim</label>
                                    <Input
                                      type="time"
                                      value={session.end_time}
                                      onChange={(e) => handleUpdateSessionField(dateIndex, session.id, "end_time", e.target.value)}
                                      className="h-9 text-sm"
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Tema / atividade</label>
                                  <Input
                                    value={session.title}
                                    onChange={(e) => handleUpdateSessionField(dateIndex, session.id, "title", e.target.value)}
                                    placeholder="Ex: Introdução ao diagnóstico"
                                    className="h-9 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Palestrante</label>
                                  <div className="relative">
                                    <Input
                                      value={session.speaker_name}
                                      list="professionals-datalist"
                                      onChange={(e) => {
                                        const name = e.target.value;
                                        const matched = professionals.find((p) => p.name === name);
                                        handleUpdateSessionSpeaker(dateIndex, session.id, name, matched?.id || "", matched?.email || "");
                                      }}
                                      placeholder="Nome do palestrante"
                                      className={`h-9 text-sm ${session.professional_id ? "pr-8 border-green-400 focus-visible:ring-green-400" : ""}`}
                                    />
                                    {session.professional_id && (
                                      <UserCheck className="h-3.5 w-3.5 text-green-600 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
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
