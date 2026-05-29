import React, { useState } from "react";
import { dataClient } from "@/api/dataClient";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Mail, Loader2, CheckCircle, AlertCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";

function parseLocalDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const d = new Date(text);
  return isNaN(d.getTime()) ? null : d;
}

function getFirstDate(training) {
  const dates = Array.isArray(training.dates) ? training.dates : [];
  const candidates = [];
  const base = parseLocalDate(training.date);
  if (base) candidates.push(base);
  dates.forEach((item) => {
    const v = typeof item === "object" ? item?.date : item;
    const d = parseLocalDate(v);
    if (d) candidates.push(d);
  });
  if (!candidates.length) return null;
  return candidates.reduce((min, d) => (d < min ? d : min));
}

export default function ReminderSender({ training, participants }) {
  const activeParticipants = (participants || []).filter(
    (p) =>
      String(p.enrollment_status || "").toLowerCase() !== "cancelado" &&
      p.professional_email
  );

  const nextDate = getFirstDate(training);
  const daysUntil = nextDate
    ? differenceInDays(nextDate, new Date(new Date().toDateString()))
    : null;

  const defaultBody = [
    `Olá,`,
    ``,
    `Este é um lembrete de que o treinamento **${training.title}** está chegando.`,
    ``,
    nextDate
      ? `📅 Data: ${format(nextDate, "dd/MM/yyyy (EEEE)", { locale: ptBR })}`
      : "",
    training.location ? `📍 Local: ${training.location}` : "",
    training.online_link ? `🔗 Link: ${training.online_link}` : "",
    ``,
    `Qualquer dúvida, entre em contato.`,
    ``,
    `Atenciosamente,`,
    `Equipe de Treinamentos`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const [body, setBody] = useState(defaultBody);
  const [status, setStatus] = useState(null);
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!activeParticipants.length) return;
    setIsSending(true);
    setStatus(null);
    let sent = 0;
    let failed = 0;
    for (const p of activeParticipants) {
      try {
        await dataClient.SendEmail({
          to: p.professional_email,
          subject: `Lembrete: ${training.title}`,
          body: body.replace(/\*\*(.*?)\*\*/g, "$1"),
          html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${body.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</pre>`,
        });
        sent++;
      } catch {
        failed++;
      }
    }
    setIsSending(false);
    setStatus({ sent, failed });
  };

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
        <Mail className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-blue-800">
            Enviar lembrete para inscritos
          </p>
          <p className="text-xs text-blue-600 mt-0.5">
            {activeParticipants.length} participante{activeParticipants.length !== 1 ? "s" : ""} com e-mail cadastrado
            {daysUntil !== null && (
              <span className="ml-2">
                ·{" "}
                <span
                  className={`font-semibold ${
                    daysUntil <= 2 ? "text-red-600" : daysUntil <= 7 ? "text-amber-600" : "text-blue-700"
                  }`}
                >
                  {daysUntil === 0
                    ? "treinamento hoje"
                    : daysUntil === 1
                    ? "amanhã"
                    : `em ${daysUntil} dias`}
                </span>
              </span>
            )}
          </p>
        </div>
        {daysUntil !== null && daysUntil <= 7 && (
          <Badge
            className={`shrink-0 ${
              daysUntil <= 2 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {daysUntil <= 2 ? "Urgente" : "Em breve"}
          </Badge>
        )}
      </div>

      {/* Mensagem */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Mensagem do e-mail
        </Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          className="text-sm font-mono resize-none"
          placeholder="Escreva a mensagem..."
        />
        <p className="text-xs text-slate-400">
          Use **texto** para negrito. O assunto será automaticamente "Lembrete: {training.title}".
        </p>
      </div>

      {/* Status */}
      {status && (
        <Alert className={status.failed > 0 ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}>
          {status.failed > 0 ? (
            <AlertCircle className="h-4 w-4 text-amber-600" />
          ) : (
            <CheckCircle className="h-4 w-4 text-green-600" />
          )}
          <AlertDescription className={status.failed > 0 ? "text-amber-700" : "text-green-700"}>
            {status.sent} e-mail{status.sent !== 1 ? "s" : ""} enviado{status.sent !== 1 ? "s" : ""} com sucesso
            {status.failed > 0 && `, ${status.failed} falhou${status.failed !== 1 ? "ram" : ""}`}.
          </AlertDescription>
        </Alert>
      )}

      {/* Ação */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">
          Para: {activeParticipants.slice(0, 3).map((p) => p.professional_email).join(", ")}
          {activeParticipants.length > 3 && ` +${activeParticipants.length - 3} outros`}
        </p>
        <Button
          onClick={handleSend}
          disabled={isSending || !activeParticipants.length || !body.trim()}
          className="gap-2"
          style={{ background: "hsl(var(--primary))" }}
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {isSending ? "Enviando..." : `Enviar para ${activeParticipants.length}`}
        </Button>
      </div>
    </div>
  );
}
