import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { downloadCertificate, getCertificateBlob } from "@/lib/certificateArchive";
import {
  DEFAULT_CERTIFICATE_EMAIL_TEMPLATE,
  resolveCertificateEmailTemplate,
  interpolateEmailTemplate,
  buildCertificateEmailData,
} from "@/lib/certificateEmailTemplate";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Award, Calendar, FileText, Loader2, Mail } from "lucide-react";
import { format } from "date-fns";

const ROLE_LABELS = {
  coordenador: "Coordenador",
  monitor: "Monitor",
  palestrante: "Palestrante",
};

const ROLE_EMAIL_KEYS = {
  coordenador: "coordinator",
  monitor: "monitor",
  palestrante: "speaker",
};

const toSafeFileName = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    if (!blob) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        resolve("");
        return;
      }
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = () => reject(new Error("Falha ao ler o PDF."));
    reader.readAsDataURL(blob);
  });

export default function StaffCertificatesPanel({ certificates = [], trainings = [] }) {
  const queryClient = useQueryClient();
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [statusById, setStatusById] = useState({});

  const resolveTraining = (record) =>
    (trainings || []).find((t) => t.id === record.training_id) || {
      title: record.training_title || "Treinamento",
    };

  const setStatus = (id, status) =>
    setStatusById((prev) => ({ ...prev, [id]: status }));

  const handleDownload = async (record) => {
    if (regeneratingId) return;
    setRegeneratingId(record.id);
    setStatus(record.id, null);
    try {
      await downloadCertificate(record);
      setStatus(record.id, { type: "success", message: "Segunda via baixada com os dados da emissão original." });
    } catch (error) {
      setStatus(record.id, { type: "error", message: error.message });
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleResend = async (record) => {
    if (sendingId) return;
    setStatus(record.id, null);
    if (!record.professional_email) {
      setStatus(record.id, { type: "error", message: "Sem e-mail cadastrado para envio." });
      return;
    }
    setSendingId(record.id);
    try {
      const training = record.certificate_issue_metadata?.snapshot?.training || resolveTraining(record);
      const emailTemplate = await resolveCertificateEmailTemplate();
      const pdfBlob = await getCertificateBlob(record);
      const safeName = toSafeFileName(record.professional_name || "profissional");
      const fileName = `certificado-${safeName || "profissional"}.pdf`;
      const attachmentBase64 = await blobToBase64(pdfBlob);
      if (!attachmentBase64) throw new Error("Falha ao gerar o anexo.");


      const emailData = buildCertificateEmailData({
        training,
        nome: record.professional_name,
        rg: record.professional_rg || record.professional_cpf,
        role: ROLE_EMAIL_KEYS[record.role] || "speaker",
        aula: record.lecture || "",
        numero_certificado: record.certificate_number,
      });
      const subject =
        interpolateEmailTemplate(emailTemplate.subject, emailData).trim() ||
        DEFAULT_CERTIFICATE_EMAIL_TEMPLATE.subject;
      const body =
        interpolateEmailTemplate(emailTemplate.body, emailData).trim() ||
        DEFAULT_CERTIFICATE_EMAIL_TEMPLATE.body;
      await dataClient.integrations.Core.SendEmail({
        to: record.professional_email,
        subject,
        body,
        attachments: [{ filename: fileName, contentType: "application/pdf", content: attachmentBase64 }],
      });


      await queryClient.invalidateQueries({ queryKey: ["training-staff-certificates"] });
      setStatus(record.id, { type: "success", message: "E-mail reenviado com sucesso." });
    } catch (error) {
      setStatus(record.id, { type: "error", message: error.message || "Erro ao reenviar e-mail." });
    } finally {
      setSendingId(null);
    }
  };

  if (certificates.length === 0) return null;

  const sorted = [...certificates].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-slate-600 flex items-center gap-1.5">
        <Award className="h-4 w-4" />
        Certificados de equipe (coordenação, monitoria e palestra)
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        {sorted.map((record) => {
          const status = statusById[record.id];
          return (
            <Card key={record.id} className="hover:shadow-lg transition-all">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Award className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 mb-1 line-clamp-2">
                      {record.training_title || "Treinamento"}
                    </h3>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <Badge variant="outline">
                        {ROLE_LABELS[record.role] || record.role}
                      </Badge>
                      {record.lecture && (
                        <Badge variant="outline" className="max-w-full truncate">
                          {record.lecture}
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-1.5 text-sm text-slate-600">
                      {record.created_at && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          <span>
                            Emitido: {format(new Date(record.created_at), "dd/MM/yyyy")}
                          </span>
                        </div>
                      )}
                      {record.certificate_number && (
                        <div className="flex items-center gap-2">
                          <Award className="h-3 w-3" />
                          <span className="font-mono text-xs">{record.certificate_number}</span>
                        </div>
                      )}
                    </div>

                    {status && (
                      <p
                        className={`mt-2 text-xs ${
                          status.type === "error" ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {status.message}
                      </p>
                    )}

                    <div className="mt-3 flex flex-col gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleDownload(record)} disabled={regeneratingId !== null}>
                        <FileText className="h-4 w-4 mr-1" />
                        {regeneratingId === record.id ? "Baixando..." : "Baixar segunda via"}
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResend(record)}
                        disabled={sendingId === record.id}
                      >
                        {sendingId === record.id ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Mail className="h-4 w-4 mr-1" />
                        )}
                        Reenviar por e-mail
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
