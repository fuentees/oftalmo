import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CalendarDays, Download, FileText } from "lucide-react";
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
    if (sortedDates.length > 0) {
      sortedDates.forEach((dateItem, index) => {
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
  }, [fallbackResponsible, sortedDates, speakers, training?.date]);

  const dateRange = useMemo(() => {
    if (sortedDates.length === 0) {
      return formatDateSafe(training?.date, "dd/MM/yyyy") || "Data a definir";
    }
    const first = formatDateSafe(sortedDates[0]?.date, "dd/MM/yyyy") || "-";
    const last =
      formatDateSafe(sortedDates[sortedDates.length - 1]?.date, "dd/MM/yyyy") || "-";
    return first === last ? first : `${first} a ${last}`;
  }, [sortedDates, training?.date]);

  const scheduleSummary = useMemo(() => {
    const pairs = sortedDates
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
  }, [sortedDates]);

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
          </div>

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

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Data</TableHead>
                  <TableHead>Encontro</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Atividade / Tema</TableHead>
                  <TableHead>Responsável</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item, index) => (
                  <TableRow key={`event-program-row-${index}`}>
                    <TableCell>{item.date}</TableCell>
                    <TableCell>{item.meeting}</TableCell>
                    <TableCell>{item.schedule}</TableCell>
                    <TableCell>{item.activity}</TableCell>
                    <TableCell>{item.responsible}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-slate-500">
            A programação usa as datas, horários, palestrantes e responsáveis cadastrados no treinamento.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
