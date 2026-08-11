import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import {
  generateCoordinatorCertificate,
  generateMonitorCertificate,
  generateSpeakerCertificate,
} from "@/components/trainings/CertificateGenerator";
import {
  DEFAULT_CERTIFICATE_EMAIL_TEMPLATE,
  resolveCertificateEmailTemplate,
  interpolateEmailTemplate,
  buildCertificateEmailData,
} from "@/lib/certificateEmailTemplate";
import {
  resolveCertificateTemplate,
  resolveCertificateTemplateByModel,
} from "@/lib/certificateTemplate";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Award, Calendar, FileText, Loader2, Mail, RefreshCw } from "lucide-react";
import { format } from "date-fns";

const ROLE_LABELS = {
  coordenador: "Coordenador",
  monitor: "Monitor",
  palestrante: "Palestrante",
};

const ROLE_GENERATORS = {
  coordenador: generateCoordinatorCertificate,
  monitor: generateMonitorCertificate,
  palestrante: generateSpeakerCertificate,
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

  const resolveTemplateForRecord = async (record, training) => {
    const modelId = record?.certificate_issue_metadata?.template_model_id;
    if (modelId) return resolveCertificateTemplateByModel(modelId);
    return resolveCertificateTemplate(training);
  };

  const buildStaffPayload = (record) => ({
    name: record.professional_name || "",
    email: record.professional_email || "",
    rg: record.professional_rg || "",
    cpf: record.professional_cpf || "",
    document: "",
    professional_id: record.professional_id || "",
    lecture: record.lecture || "",
    certificate_number: record.certificate_number || "",
  });

  const generatePdf = async (record) => {
    const generator = ROLE_GENERATORS[record.role];
    if (!generator) throw new Error("Tipo de certificado desconhecido.");
    const training = resolveTraining(record);
    const templateOverride = await resolveTemplateForRecord(record, training);
    return generator(buildStaffPayload(record), training, templateOverride);
  };

  const setStatus = (id, status) =>
    setStatusById((prev) => ({ ...prev, [id]: status }));

  const handleDownload = async (record) => {
    if (record.certificate_url) {
      const link = document.createElement("a");
      link.href = record.certificate_url;
      link.download = `certificado-${record.professional_name || "profissional"}.pdf`;
      link.click();
      return;
    }
    try {
      const pdf = await generatePdf(record);
      pdf.save(`certificado-${record.professional_name || "profissional"}.pdf`);
    } catch (error) {
      setStatus(record.id, { type: "error", message: error.message || "Erro ao baixar o PDF." });
    }
  };

  const handleRegenerate = async (record) => {
    if (regeneratingId) return;
    setStatus(record.id, null);
    setRegeneratingId(record.id);
    const previewWindow = window.open("", "_blank");
    try {
      const pdf = await generatePdf(record);
      const pdfBlob = pdf.output("blob");
      const safeName = toSafeFileName(record.professional_name || "profissional");
      const fileName = `certificado-${safeName || "profissional"}.pdf`;
      const pdfFile = new File([pdfBlob], fileName, { type: "application/pdf" });
      const { file_url } = await dataClient.integrations.Core.UploadFile({ file: pdfFile });

      await dataClient.entities.TrainingStaffCertificate.update(record.id, {
        certificate_url: file_url,
      });

      const blobUrl = URL.createObjectURL(pdfBlob);
      if (previewWindow) {
        previewWindow.location.href = blobUrl;
        previewWindow.focus();
      } else {
        window.open(blobUrl, "_blank");
      }
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      pdf.save(fileName);

      await queryClient.invalidateQueries({ queryKey: ["training-staff-certificates"] });
      setStatus(record.id, { type: "success", message: "PDF regenerado com sucesso." });
    } catch (error) {
      if (previewWindow) previewWindow.close();
      setStatus(record.id, { type: "error", message: error.message || "Erro ao regenerar o PDF." });
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
      const training = resolveTraining(record);
      const emailTemplate = await resolveCertificateEmailTemplate();
      const pdf = await generatePdf(record);
      const pdfBlob = pdf.output("blob");
      const safeName = toSafeFileName(record.professional_name || "profissional");
      const fileName = `certificado-${safeName || "profissional"}.pdf`;
      const pdfFile = new File([pdfBlob], fileName, { type: "application/pdf" });
      const attachmentBase64 = await blobToBase64(pdfBlob);
      if (!attachmentBase64) throw new Error("Falha ao gerar o anexo.");

      const { file_url } = await dataClient.integrations.Core.UploadFile({ file: pdfFile });

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

      await dataClient.entities.TrainingStaffCertificate.update(record.id, {
        certificate_url: file_url,
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
                      <Button size="sm" variant="outline" onClick={() => handleDownload(record)}>
                        <FileText className="h-4 w-4 mr-1" />
                        Baixar PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRegenerate(record)}
                        disabled={regeneratingId === record.id}
                      >
                        {regeneratingId === record.id ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-1" />
                        )}
                        Regenerar PDF
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
