import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Send, CheckCircle, AlertCircle, Loader2, Video } from "lucide-react";
import { formatDateSafe } from "@/lib/date";

export default function SendLinkButton({ training, participants }) {
  const [showDialog, setShowDialog] = useState(false);
  const [result, setResult] = useState(null);

  const formatDate = (value) => {
    return formatDateSafe(value, "dd/MM/yyyy");
  };

  const sendLink = useMutation({
    mutationFn: async () => {
      if (!training.online_link) {
        throw new Error("Nenhum link configurado neste treinamento");
      }

      const enrolledParticipants = participants.filter(
        p => p.enrollment_status !== "cancelado" && p.professional_email
      );

      if (enrolledParticipants.length === 0) {
        throw new Error("Nenhum participante inscrito com email cadastrado");
      }

      const results = [];
      
      for (const participant of enrolledParticipants) {
        try {
          const datesText = Array.isArray(training.dates) && training.dates.length > 0
            ? training.dates
                .map(d => {
                  const formattedDate = formatDate(d?.date);
                  if (!formattedDate) return null;
                  return `${formattedDate}${d.start_time ? ` às ${d.start_time}` : ""}`;
                })
                .filter(Boolean)
                .join("<br>")
            : "Data a definir";

          await dataClient.integrations.Core.SendEmail({
            to: participant.professional_email,
            subject: `Link de Acesso - ${training.title}`,
            body: `
              <h2>Link de Acesso ao Treinamento Online</h2>
              <p>Olá <strong>${participant.professional_name}</strong>,</p>
              <p>Segue o link de acesso para o treinamento:</p>
              <h3>${training.title}</h3>
              <p><strong>Código:</strong> ${training.code || "-"}</p>
              <p><strong>Datas:</strong><br>${datesText}</p>
              ${training.location ? `<p><strong>Local:</strong> ${training.location}</p>` : ""}
              <br>
              <p><strong>Link de Acesso:</strong></p>
              <p style="background: #f0f0f0; padding: 12px; border-radius: 6px;">
                <a href="${training.online_link}" target="_blank" style="color: #2563eb; font-weight: 600;">
                  ${training.online_link}
                </a>
              </p>
              <br>
              <p><strong>Instrutor:</strong> ${training.instructor}</p>
              ${training.notes ? `<p><strong>Observações:</strong><br>${training.notes}</p>` : ""}
              <br>
              <p style="color: #666; font-size: 14px;">
                ⚠️ Guarde este link com cuidado e acesse no horário do treinamento.<br>
                Em caso de dúvidas, entre em contato com a coordenação.
              </p>
              <br>
              <p>Até breve!<br>Sistema de Gestão</p>
            `
          });

          results.push({ name: participant.professional_name, success: true });
        } catch (error) {
          results.push({ 
            name: participant.professional_name, 
            success: false, 
            error: error.message 
          });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      setResult({
        success: successCount,
        failed: failCount,
        details: results,
      });
    },
    onError: (error) => {
      setResult({ error: error.message });
    },
  });

  const handleSend = () => {
    setResult(null);
    sendLink.mutate();
  };

  if (!training.online_link) {
    return null;
  }

  const enrolledCount = participants.filter(
    p => p.enrollment_status !== "cancelado" && p.professional_email
  ).length;

  return (
    <>
      <Button
        onClick={() => setShowDialog(true)}
        variant="outline"
        className="border-blue-600 text-blue-600 hover:bg-blue-50"
      >
        <Video className="h-4 w-4 mr-2" />
        Enviar Link aos Inscritos ({enrolledCount})
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-blue-600" />
              Enviar Link de Reunião
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg text-sm">
              <p className="font-medium mb-2">{training.title}</p>
              <p className="text-slate-600 break-all">{training.online_link}</p>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                O link será enviado por email para {enrolledCount} participante(s) inscrito(s).
              </AlertDescription>
            </Alert>

            {result && (
              <Alert className={result.error ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}>
                {result.error ? (
                  <>
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800">
                      {result.error}
                    </AlertDescription>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      Link enviado com sucesso para {result.success} participante(s)!
                      {result.failed > 0 && ` ${result.failed} falha(s).`}
                    </AlertDescription>
                  </>
                )}
              </Alert>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Fechar
              </Button>
              <Button
                onClick={handleSend}
                disabled={sendLink.isPending || enrolledCount === 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {sendLink.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Enviar Link
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}