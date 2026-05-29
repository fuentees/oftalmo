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
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Download,
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

const DURATION_SUGGESTIONS = [10, 15, 20, 25, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240];

const formatDurationLabel = (minutes) => {
  if (!minutes || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
};

function DurationInput({ value, onChange, inputClassName = "h-8" }) {
  const [draft, setDraft] = React.useState(value != null ? String(value) : "");

  React.useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);

  const commit = (raw) => {
    const n = parseInt(raw, 10);
    onChange(Number.isFinite(n) && n > 0 ? n : null);
  };

  return (
    <div className="relative flex items-center w-full">
      <input
        type="number"
        min="1"
        max="480"
        step="5"
        list="duration-datalist"
        value={draft}
        placeholder="min"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(draft); } }}
        className={`${inputClassName} w-full rounded-md border border-input bg-background pl-2 pr-12 text-sm focus:outline-none focus:ring-1 focus:ring-primary`}
      />
      <span className="absolute right-2 text-[11px] font-semibold text-slate-400 pointer-events-none select-none whitespace-nowrap">
        {value ? formatDurationLabel(value) : "min"}
      </span>
      <datalist id="duration-datalist">
        {DURATION_SUGGESTIONS.map((m) => (
          <option key={m} value={m}>{formatDurationLabel(m)}</option>
        ))}
      </datalist>
    </div>
  );
}

export default function EventProgramSection({ training }) {
  const queryClient = useQueryClient();

  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => dataClient.entities.Professional.list("name"),
  });

  const [programDates, setProgramDates] = useState([]);
  const [programStatus, setProgramStatus] = useState(null);
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

  const minutesToTimeString = (totalMinutes) => {
    const h = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
    const m = String(totalMinutes % 60).padStart(2, "0");
    return `${h}:${m}`;
  };

  // Dado o horário de início do dia e a lista de sessões com duration_minutes,
  // devolve as sessões com start_time e end_time calculados.
  const computeSessionTimes = (sessions, dayStartTime) => {
    let cursor = parseTimeToMinutes(dayStartTime) ?? 0;
    return sessions.map((s) => {
      const dur = s.duration_minutes ?? 0;
      const start = minutesToTimeString(cursor);
      cursor += dur;
      const end = dur > 0 ? minutesToTimeString(cursor) : "";
      return { ...s, start_time: start, end_time: end };
    });
  };

  const deriveDuration = (start, end) => {
    const s = parseTimeToMinutes(start);
    const e = parseTimeToMinutes(end);
    if (s === null || e === null || e <= s) return null;
    return e - s;
  };

  const normalizeSession = (session, fallbackIndex = 0) => {
    const start = String(session?.start_time || "").trim();
    const end = String(session?.end_time || "").trim();
    // Lê duration_minutes salvo ou deriva de start/end
    let durationMinutes = null;
    const saved = Number(session?.duration_minutes);
    if (Number.isFinite(saved) && saved > 0) {
      durationMinutes = saved;
    } else {
      durationMinutes = deriveDuration(start, end);
    }
    return {
      id:
        String(session?.id || "").trim() ||
        `session-${Date.now()}-${Math.random().toString(36).slice(2)}-${fallbackIndex}`,
      start_time: start,
      end_time: end,
      duration_minutes: durationMinutes,
      title: String(session?.title || session?.activity || "").trim(),
      speaker_name: String(
        session?.speaker_name || session?.responsible || session?.speaker || ""
      ).trim(),
      professional_id: String(session?.professional_id || "").trim(),
      professional_email: String(session?.professional_email || "").trim(),
    };
  };

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
      const payloadDates = programDates.map((dateItem, dateIndex) => {
        const typed = getTypedSessions(dateItem?.sessions, dateIndex);
        // Computa start/end a partir do início do dia + durações encadeadas
        const withTimes = computeSessionTimes(typed, dateItem?.start_time || "");
        return {
          ...dateItem,
          sessions: withTimes.map((session) => ({
            start_time: session.start_time,
            end_time: session.end_time,
            duration_minutes: session.duration_minutes ?? null,
            title: String(session.title || "").trim(),
            speaker_name: String(session.speaker_name || "").trim(),
            professional_id: String(session.professional_id || "").trim(),
            professional_email: String(session.professional_email || "").trim(),
          })),
        };
      });
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
    upsertDateSessions(dateIndex, (sessions) => {
      const prev = sessions[sessions.length - 1];
      const inheritedDuration = prev?.duration_minutes ?? null;
      return [
        ...sessions,
        normalizeSession(
          { duration_minutes: inheritedDuration },
          sessions.length + dateIndex * 1000
        ),
      ];
    });
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

  // Horário de início do dia mudou
  const handleDayStartTimeChange = (dateIndex, newStartTime) => {
    setProgramDates((prev) =>
      prev.map((item, i) =>
        i === dateIndex ? { ...item, start_time: newStartTime } : item
      )
    );
  };

  // Duração de uma sessão mudou — apenas guarda o valor; os horários são computados no render
  const handleDurationChange = (dateIndex, sessionId, newDurationMinutes) => {
    upsertDateSessions(dateIndex, (sessions) =>
      sessions.map((s) =>
        s.id === sessionId ? { ...s, duration_minutes: newDurationMinutes } : s
      )
    );
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

  const handleMoveSession = (dateIndex, sessionId, direction) => {
    setProgramDates((prev) => {
      const sessions = Array.isArray(prev[dateIndex]?.sessions) ? [...prev[dateIndex].sessions] : [];
      const idx = sessions.findIndex((s) => s.id === sessionId);
      if (idx < 0) return prev;

      const isFirst = idx === 0;
      const isLast = idx === sessions.length - 1;

      // Movimento dentro do mesmo dia
      if (direction === "up" && !isFirst) {
        const next = [...sessions];
        [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
        return prev.map((item, i) => i === dateIndex ? { ...item, sessions: next } : item);
      }
      if (direction === "down" && !isLast) {
        const next = [...sessions];
        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
        return prev.map((item, i) => i === dateIndex ? { ...item, sessions: next } : item);
      }

      // ↑ no primeiro item → move para o final do dia anterior
      if (direction === "up" && isFirst && dateIndex > 0) {
        const session = sessions[idx];
        const daySessions = sessions.filter((_, i) => i !== idx);
        const prevSessions = [
          ...(Array.isArray(prev[dateIndex - 1]?.sessions) ? prev[dateIndex - 1].sessions : []),
          session,
        ];
        return prev.map((item, i) => {
          if (i === dateIndex) return { ...item, sessions: daySessions };
          if (i === dateIndex - 1) return { ...item, sessions: prevSessions };
          return item;
        });
      }

      // ↓ no último item → move para o início do dia seguinte
      if (direction === "down" && isLast && dateIndex < prev.length - 1) {
        const session = sessions[idx];
        const daySessions = sessions.filter((_, i) => i !== idx);
        const nextSessions = [
          session,
          ...(Array.isArray(prev[dateIndex + 1]?.sessions) ? prev[dateIndex + 1].sessions : []),
        ];
        return prev.map((item, i) => {
          if (i === dateIndex) return { ...item, sessions: daySessions };
          if (i === dateIndex + 1) return { ...item, sessions: nextSessions };
          return item;
        });
      }

      return prev;
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
                          {/* Início do dia */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-500 font-medium hidden sm:inline whitespace-nowrap">Início:</span>
                            <Input
                              type="time"
                              value={dateItem?.start_time || ""}
                              onChange={(e) => handleDayStartTimeChange(dateIndex, e.target.value)}
                              className="h-7 w-28 text-xs px-2 border-slate-300 font-semibold"
                              title="Horário de início do treinamento neste dia"
                            />
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
                          {(() => {
                            const computed = computeSessionTimes(sessions, dateItem?.start_time || "");
                            return (
                          <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-slate-100/70">
                                  <TableHead className="w-14 p-2 text-center">Ordem</TableHead>
                                  <TableHead className="w-28">Data</TableHead>
                                  <TableHead className="w-32">Duração</TableHead>
                                  <TableHead className="w-36">Horário</TableHead>
                                  <TableHead>Tema / atividade</TableHead>
                                  <TableHead className="min-w-[200px]">Palestrante</TableHead>
                                  <TableHead className="w-20" />
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {computed.map((session, sessionIndex) => (
                                  <TableRow
                                    key={session.id}
                                    className="align-middle"
                                  >
                                    <TableCell className="p-1 text-center">
                                      <div className="flex flex-col items-center gap-0.5">
                                        <button
                                          type="button"
                                          onClick={() => handleMoveSession(dateIndex, session.id, "up")}
                                          disabled={sessionIndex === 0 && dateIndex === 0}
                                          className="p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                          title={sessionIndex === 0 && dateIndex > 0 ? "Mover para o dia anterior" : "Mover para cima"}
                                        >
                                          <ArrowUp className="h-3.5 w-3.5" />
                                        </button>
                                        <span className="text-[10px] font-bold text-slate-400 leading-none">
                                          {sessionIndex + 1}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleMoveSession(dateIndex, session.id, "down")}
                                          disabled={sessionIndex === computed.length - 1 && dateIndex === programDates.length - 1}
                                          className="p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                          title={sessionIndex === computed.length - 1 && dateIndex < programDates.length - 1 ? "Mover para o próximo dia" : "Mover para baixo"}
                                        >
                                          <ArrowDown className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </TableCell>
                                    {sessionIndex === 0 ? (
                                      <TableCell
                                        rowSpan={computed.length}
                                        className="font-semibold text-slate-700 align-middle text-center bg-slate-50 text-sm px-3 whitespace-nowrap"
                                      >
                                        {dateLabel}
                                      </TableCell>
                                    ) : null}
                                    {/* Duração — único campo editável de tempo */}
                                    <TableCell className="py-1.5 px-2">
                                      <DurationInput
                                        value={session.duration_minutes}
                                        onChange={(v) => handleDurationChange(dateIndex, session.id, v)}
                                      />
                                    </TableCell>
                                    {/* Horário calculado automaticamente */}
                                    <TableCell className="py-1.5 px-3">
                                      {session.start_time && session.end_time ? (
                                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg whitespace-nowrap">
                                          {session.start_time}
                                          <span className="text-slate-400 font-normal">→</span>
                                          {session.end_time}
                                        </span>
                                      ) : (
                                        <span className="text-xs text-slate-400 italic">
                                          {session.start_time || "—"}
                                        </span>
                                      )}
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
                              </TableBody>
                            </Table>
                          </div>
                            );
                          })()}

                          {/* ── MOBILE: cards ── */}
                          <div className="md:hidden space-y-2">
                            {computeSessionTimes(sessions, dateItem?.start_time || "").map((session, sessionIndex) => (
                              <div
                                key={session.id}
                                className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleMoveSession(dateIndex, session.id, "up")}
                                      disabled={sessionIndex === 0 && dateIndex === 0}
                                      className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                      title={sessionIndex === 0 && dateIndex > 0 ? "Mover para o dia anterior" : "Mover para cima"}
                                    >
                                      <ArrowUp className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleMoveSession(dateIndex, session.id, "down")}
                                      disabled={sessionIndex === sessions.length - 1 && dateIndex === programDates.length - 1}
                                      className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                      title={sessionIndex === sessions.length - 1 && dateIndex < programDates.length - 1 ? "Mover para o próximo dia" : "Mover para baixo"}
                                    >
                                      <ArrowDown className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                    Aula {sessionIndex + 1}
                                  </span>
                                  {session.start_time && session.end_time && (
                                    <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                                      {session.start_time} → {session.end_time}
                                    </span>
                                  )}
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
                                <div className="space-y-1">
                                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Duração</label>
                                  <DurationInput
                                    value={session.duration_minutes}
                                    onChange={(v) => handleDurationChange(dateIndex, session.id, v)}
                                    inputClassName="h-9"
                                  />
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
