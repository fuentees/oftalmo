import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { format, addMonths } from "date-fns";
import { generateParticipantCertificate, generateMonitorCertificate } from "./CertificateGenerator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Mail, CheckCircle, Award } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function CertificateManager({ training, participants, onClose }) {
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  
  const queryClient = useQueryClient();

  const issueMonitorCertificates = useMutation({
    mutationFn: async () => {
      if (!training.monitors || training.monitors.length === 0) {
        throw new Error("Nenhum monitor cadastrado");
      }

      setProcessing(true);
      const results = [];

      for (const monitor of training.monitors) {
        if (!monitor.name || !monitor.email) continue;

        try {
          // Generate PDF
          const pdf = generateMonitorCertificate(monitor, training);
          const pdfBlob = pdf.output('blob');
          const pdfFile = new File([pdfBlob], `certificado-monitor-${monitor.name}.pdf`, { type: 'application/pdf' });

          // Upload PDF
          const { file_url } = await dataClient.integrations.Core.UploadFile({ file: pdfFile });

          let warning = null;
          try {
            await dataClient.integrations.Core.SendEmail({
              to: monitor.email,
              subject: `Certificado de Monitoria - ${training.title}`,
              body: `
                <h2>Certificado de Monitoria</h2>
                <p>Olá ${monitor.name},</p>
                <p>Segue em anexo seu certificado de monitoria do treinamento <strong>${training.title}</strong>.</p>
                <p>Você pode baixar o certificado através do link: <a href="${file_url}">Baixar Certificado</a></p>
                <br>
                <p>Atenciosamente,<br>Equipe de Treinamentos</p>
              `
            });
          } catch (error) {
            warning = error.message || "Falha ao enviar e-mail.";
          }

          results.push({ name: monitor.name, status: warning ? 'warning' : 'success', warning });
        } catch (error) {
          results.push({ name: monitor.name, status: 'error', error: error.message });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      setProcessing(false);
      const successCount = results.filter(r => r.status === "success").length;
      const warningCount = results.filter(r => r.status === "warning").length;
      const failCount = results.filter(r => r.status === "error").length;
      const warningMessage = warningCount > 0 ? `, ${warningCount} aviso(s) de e-mail` : "";
      const failMessage = failCount > 0 ? `, ${failCount} falha(s)` : "!";
      setResult({
        success: failCount === 0,
        message: `${successCount} certificado(s) emitido(s)${warningMessage}${failMessage}`,
      });
    },
    onError: (error) => {
      setProcessing(false);
      setResult({ success: false, message: error.message });
    },
  });

  const issueCertificates = useMutation({
    mutationFn: async (/** @type {any[]} */ participantIds) => {
      setProcessing(true);
      setResult(null);

      const participantsToIssue = participants.filter((p) =>
        participantIds.includes(p.id)
      );

      const results = [];

      for (const participant of participantsToIssue) {
        try {
          // Generate PDF
          const pdf = generateParticipantCertificate(participant, training);
          const pdfBlob = pdf.output('blob');
          const pdfFile = new File([pdfBlob], `certificado-${participant.professional_name}.pdf`, { type: 'application/pdf' });

          // Upload PDF
          const { file_url } = await dataClient.integrations.Core.UploadFile({ file: pdfFile });

          const warnings = [];

          // Send email to participant (best effort)
          if (participant.professional_email) {
            try {
              await dataClient.integrations.Core.SendEmail({
                to: participant.professional_email,
                subject: `Certificado de Conclusão - ${training.title}`,
                body: `
                  <h2>Certificado de Conclusão</h2>
                  <p>Olá ${participant.professional_name},</p>
                  <p>Parabéns pela conclusão do treinamento <strong>${training.title}</strong>!</p>
                  <p>Segue em anexo seu certificado. Você pode baixar através do link: <a href="${file_url}">Baixar Certificado</a></p>
                  <br>
                  <p>Atenciosamente,<br>Equipe de Treinamentos</p>
                `
              });
            } catch (error) {
              warnings.push(error.message || "Falha ao enviar e-mail ao participante.");
            }
          }

          // Send copy to coordinator if exists (best effort)
          if (training.coordinator_email) {
            try {
              await dataClient.integrations.Core.SendEmail({
                to: training.coordinator_email,
                subject: `Cópia: Certificado emitido - ${participant.professional_name}`,
                body: `
                  <h2>Certificado Emitido</h2>
                  <p>O certificado de <strong>${participant.professional_name}</strong> foi emitido para o treinamento ${training.title}.</p>
                  <p>Link: <a href="${file_url}">Ver Certificado</a></p>
                `
              });
            } catch (error) {
              warnings.push(error.message || "Falha ao enviar e-mail ao coordenador.");
            }
          }

          // Update participant with validity date
          const validityDate = training.validity_months 
            ? addMonths(new Date(), training.validity_months).toISOString().split('T')[0]
            : null;

          await dataClient.entities.TrainingParticipant.update(participant.id, {
            certificate_issued: true,
            certificate_sent_date: new Date().toISOString(),
            certificate_url: file_url,
            validity_date: validityDate,
          });

          results.push({ name: participant.professional_name, success: true, warnings });
        } catch (error) {
          results.push({ name: participant.professional_name, success: false, error: error.message });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      setProcessing(false);
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      const warningCount = results.reduce((acc, r) => acc + (r.warnings?.length || 0), 0);
      const warningMessage = warningCount > 0 ? `, ${warningCount} aviso(s) de e-mail` : "";
      
      setResult({
        success: true,
        message: `${successCount} certificado(s) emitido(s)${failCount > 0 ? `, ${failCount} falha(s)` : '!'}` + warningMessage,
        details: results,
      });
      
      queryClient.invalidateQueries({ queryKey: ["participants"] });
      setSelectedParticipants([]);
    },
    onError: (error) => {
      setProcessing(false);
      setResult({ success: false, message: error.message });
    },
  });

  const toggleParticipant = (id) => {
    setSelectedParticipants((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedParticipants.length === eligibleParticipants.length) {
      setSelectedParticipants([]);
    } else {
      setSelectedParticipants(eligibleParticipants.map(p => p.id));
    }
  };

  const handleIssueSelected = () => {
    if (selectedParticipants.length > 0) {
      issueCertificates.mutate(selectedParticipants);
    }
  };

  // Participantes com presença registrada e frequência satisfatória
  const eligibleParticipants = participants.filter((p) => {
    if (p.enrollment_status === "cancelado") return false;
    const hasRecords =
      Array.isArray(p.attendance_records) && p.attendance_records.length > 0;
    if (!hasRecords) return false;
    const percentage = Number(p.attendance_percentage || 0);
    return p.approved || percentage >= 75;
  });

  const alreadySentCount = eligibleParticipants.filter(p => p.certificate_issued).length;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Award className="h-5 w-5 text-amber-600" />
          Emissão de Certificados
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          {eligibleParticipants.length} participante(s) elegível(eis) • {alreadySentCount} certificado(s) já enviado(s)
        </p>
      </div>

      {result && (
        <Alert className={result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
          <CheckCircle className={`h-4 w-4 ${result.success ? "text-green-600" : "text-red-600"}`} />
          <AlertDescription className={result.success ? "text-green-800" : "text-red-800"}>
            {result.message}
          </AlertDescription>
        </Alert>
      )}

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-10">
                <Checkbox
                  checked={selectedParticipants.length === eligibleParticipants.length && eligibleParticipants.length > 0}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Certificado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eligibleParticipants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                  Nenhum participante elegível para certificado
                </TableCell>
              </TableRow>
            ) : (
              eligibleParticipants.map((participant) => (
                <TableRow key={participant.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedParticipants.includes(participant.id)}
                      onCheckedChange={() => toggleParticipant(participant.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{participant.professional_name}</TableCell>
                  <TableCell>
                    {participant.professional_email ? (
                      <div className="flex items-center gap-1 text-sm">
                        <Mail className="h-3 w-3 text-slate-400" />
                        {participant.professional_email}
                      </div>
                    ) : (
                      <span className="text-red-600 text-sm">Sem email</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-green-100 text-green-700">Aprovado</Badge>
                  </TableCell>
                  <TableCell>
                    {participant.certificate_issued ? (
                      <div className="flex items-center gap-1 text-sm text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        Enviado
                        {participant.certificate_sent_date && (
                          <span className="text-xs text-slate-500">
                            ({format(new Date(participant.certificate_sent_date), "dd/MM/yyyy")})
                          </span>
                        )}
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-slate-600">Pendente</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-between items-center pt-4">
        <div className="flex gap-2">
          <Button
            onClick={handleIssueSelected}
            disabled={selectedParticipants.length === 0 || processing}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Award className="h-4 w-4 mr-2" />
            {processing ? "Emitindo..." : `Emitir ${selectedParticipants.length} Certificado(s)`}
          </Button>
          {training.monitors && training.monitors.length > 0 && (
            <Button
              onClick={() => issueMonitorCertificates.mutate()}
              disabled={processing}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Award className="h-4 w-4 mr-2" />
              Emitir Certificados Monitores
            </Button>
          )}
        </div>
        <Button variant="outline" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  );
}