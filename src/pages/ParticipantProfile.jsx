import React, { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { generateParticipantCertificate } from "@/components/trainings/CertificateGenerator";
import {
  DEFAULT_CERTIFICATE_EMAIL_TEMPLATE,
  loadCertificateEmailTemplate,
  interpolateEmailTemplate,
  buildCertificateEmailData,
} from "@/lib/certificateEmailTemplate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  User,
  GraduationCap,
  Calendar,
  Award,
  Clock,
  CheckCircle,
  ArrowLeft,
  FileText,
  RefreshCw,
  Loader2,
  Mail
} from "lucide-react";
import { addMonths, format } from "date-fns";
import { useNavigate } from "react-router-dom";

export default function ParticipantProfile() {
  const navigate = useNavigate();
  const [participantId, setParticipantId] = useState(null);
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [regenStatus, setRegenStatus] = useState(null);
  const [emailStatus, setEmailStatus] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setParticipantId(params.get("id"));
  }, []);

  const { data: participants = [], isLoading: loadingParticipants } = useQuery({
    queryKey: ["participants"],
    queryFn: () => dataClient.entities.TrainingParticipant.list("-enrollment_date"),
  });

  const { data: trainings = [], isLoading: loadingTrainings } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => dataClient.entities.Training.list(),
  });

  const normalizeText = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");

  const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();

  const normalizeRg = (value) =>
    String(value ?? "")
      .replace(/[^0-9a-zA-Z]/g, "")
      .toUpperCase()
      .trim();

  const isSameParticipant = (base, candidate) => {
    if (!base || !candidate) return false;
    const baseName = normalizeText(base.professional_name);
    const baseEmail = normalizeEmail(base.professional_email);
    const baseRg = normalizeRg(base.professional_rg);
    const candName = normalizeText(candidate.professional_name);
    const candEmail = normalizeEmail(candidate.professional_email);
    const candRg = normalizeRg(candidate.professional_rg);

    const nameEmailMatch =
      baseName &&
      candName &&
      baseName === candName &&
      baseEmail &&
      candEmail &&
      baseEmail === candEmail;
    if (nameEmailMatch) return true;

    const rgMatch = baseRg && candRg && baseRg === candRg;
    if (rgMatch) return true;

    let matches = 0;
    if (baseName && candName && baseName === candName) matches += 1;
    if (baseEmail && candEmail && baseEmail === candEmail) matches += 1;
    if (baseRg && candRg && baseRg === candRg) matches += 1;
    return matches >= 2;
  };

  const scoreParticipant = (participant) => {
    if (!participant) return 0;
    const fields = [
      "professional_name",
      "professional_rg",
      "professional_cpf",
      "professional_email",
      "professional_registration",
      "professional_sector",
      "professional_formation",
      "institution",
      "state",
      "health_region",
      "municipality",
      "unit_name",
      "position",
      "work_address",
      "residential_address",
      "commercial_phone",
      "mobile_phone",
    ];
    return fields.reduce((acc, key) => (participant[key] ? acc + 1 : acc), 0);
  };

  const mergeParticipantData = (items) => {
    if (!items.length) return {};
    const sorted = [...items].sort(
      (a, b) => scoreParticipant(b) - scoreParticipant(a)
    );
    const merged = { ...sorted[0] };
    sorted.slice(1).forEach((participant) => {
      Object.entries(participant || {}).forEach(([key, value]) => {
        if (merged[key] === undefined || merged[key] === null || merged[key] === "") {
          if (value !== undefined && value !== null && value !== "") {
            merged[key] = value;
          }
        }
      });
    });
    return merged;
  };

  const toSafeFileName = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
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
        const base64 = result.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Falha ao ler o PDF."));
      reader.readAsDataURL(blob);
    });

  const typeLabels = {
    teorico: "Teórico",
    pratico: "Prático",
    teorico_pratico: "Teórico/Prático",
    repadronizacao: "Repadronização",
  };

  const trainingTypeMaps = useMemo(() => {
    const byId = new Map();
    const byTitle = new Map();
    trainings.forEach((training) => {
      if (training.id) byId.set(training.id, training.type);
      const titleKey = normalizeText(training.title);
      if (titleKey) byTitle.set(titleKey, training.type);
    });
    return { byId, byTitle };
  }, [trainings]);

  const resolveTrainingType = (participation) => {
    if (!participation) return null;
    const byId = trainingTypeMaps.byId;
    const byTitle = trainingTypeMaps.byTitle;
    const typeFromId = byId.get(participation.training_id);
    if (typeFromId) return typeFromId;
    const typeFromTitle = byTitle.get(normalizeText(participation.training_title));
    if (typeFromTitle) return typeFromTitle;
    const title = String(participation.training_title || "").toLowerCase();
    if (title.includes("teorico") || title.includes("teórico")) return "teorico";
    if (title.includes("pratico") || title.includes("prático")) return "pratico";
    if (title.includes("repadronizacao") || title.includes("repadronização")) {
      return "repadronizacao";
    }
    return null;
  };

  const participant = useMemo(
    () => participants.find((p) => p.id === participantId),
    [participants, participantId]
  );

  const allParticipations = useMemo(() => {
    if (!participant) return [];
    return participants.filter((p) => isSameParticipant(participant, p));
  }, [participants, participant]);

  const mergedParticipant = useMemo(
    () => mergeParticipantData(allParticipations),
    [allParticipations]
  );

  const participationsSorted = useMemo(
    () =>
      [...allParticipations].sort((a, b) => {
        const dateA = a.training_date ? new Date(a.training_date).getTime() : 0;
        const dateB = b.training_date ? new Date(b.training_date).getTime() : 0;
        return dateB - dateA;
      }),
    [allParticipations]
  );

  if (!participantId) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Participante não encontrado</p>
      </div>
    );
  }

  if (loadingParticipants || loadingTrainings) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Carregando...</p>
      </div>
    );
  }

  if (!participant) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Participante não encontrado</p>
      </div>
    );
  }

  const approvedCount = allParticipations.filter((p) => p.approved).length;
  const certificatesCount = allParticipations.filter((p) => p.certificate_issued).length;
  const avgAttendance = allParticipations.length > 0
    ? (
        allParticipations.reduce(
          (acc, p) => acc + (p.attendance_percentage || 0),
          0
        ) / allParticipations.length
      ).toFixed(1)
    : 0;

  const resolveTrainingForCertificate = (participation) => {
    if (!participation) return null;
    const byId = trainingTypeMaps.byId;
    let training = null;
    if (participation.training_id) {
      training = trainings.find((item) => item.id === participation.training_id);
    }
    if (!training && participation.training_title) {
      const titleKey = normalizeText(participation.training_title);
      training = trainings.find(
        (item) => normalizeText(item.title) === titleKey
      );
    }

    if (!training) {
      return {
        title: participation.training_title || "Treinamento",
        dates: participation.training_date
          ? [{ date: participation.training_date }]
          : [],
        duration_hours: null,
        coordinator: "",
        instructor: "",
      };
    }

    if (!Array.isArray(training.dates) || training.dates.length === 0) {
      return {
        ...training,
        dates: participation.training_date
          ? [{ date: participation.training_date }]
          : [],
      };
    }

    return training;
  };

  const handleDownloadCertificate = (participation) => {
    if (!participation) return;
    if (participation.certificate_url) {
      const link = document.createElement("a");
      link.href = participation.certificate_url;
      link.download = `certificado-${participation.professional_name || "participante"}.pdf`;
      link.click();
      return;
    }

    const training = resolveTrainingForCertificate(participation);
    if (!training) return;
    const pdf = generateParticipantCertificate(participation, training);
    const fileName = `certificado-${participation.professional_name || "participante"}.pdf`;
    pdf.save(fileName);
  };

  const handleRegenerateCertificate = async (participation) => {
    if (!participation) return;
    if (regeneratingId) return;
    setRegenStatus(null);
    setEmailStatus(null);
    setRegeneratingId(participation.id);
    const previewWindow = window.open("", "_blank");
    try {
      const training = resolveTrainingForCertificate(participation);
      if (!training) {
        throw new Error("Treinamento não encontrado para regenerar.");
      }
      const pdf = generateParticipantCertificate(participation, training);
      const pdfBlob = pdf.output("blob");
      const safeName = toSafeFileName(participation.professional_name || "participante");
      const fileName = `certificado-${safeName || "participante"}.pdf`;
      const pdfFile = new File([pdfBlob], fileName, { type: "application/pdf" });
      const { file_url } = await dataClient.integrations.Core.UploadFile({ file: pdfFile });
      const validityDate = training.validity_months
        ? addMonths(new Date(), training.validity_months).toISOString().split("T")[0]
        : participation.validity_date || null;

      await dataClient.entities.TrainingParticipant.update(participation.id, {
        certificate_url: file_url,
        certificate_issued: true,
        certificate_sent_date: new Date().toISOString(),
        validity_date: validityDate,
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

      await queryClient.invalidateQueries({ queryKey: ["participants"] });
      setRegenStatus({
        type: "success",
        message: "PDF regenerado com sucesso.",
      });
    } catch (error) {
      if (previewWindow) {
        previewWindow.close();
      }
      setRegenStatus({
        type: "error",
        message: error.message || "Erro ao regenerar o PDF.",
      });
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleResendCertificate = async (participation) => {
    if (!participation) return;
    if (sendingId) return;
    setEmailStatus(null);
    setRegenStatus(null);
    if (!participation.professional_email) {
      setEmailStatus({
        type: "error",
        message: "Participante sem e-mail cadastrado.",
      });
      return;
    }

    setSendingId(participation.id);
    try {
      const training = resolveTrainingForCertificate(participation);
      if (!training) {
        throw new Error("Treinamento não encontrado para enviar.");
      }
      const emailTemplate = loadCertificateEmailTemplate();
      const pdf = generateParticipantCertificate(participation, training);
      const pdfBlob = pdf.output("blob");
      const safeName = toSafeFileName(participation.professional_name || "participante");
      const fileName = `certificado-${safeName || "participante"}.pdf`;
      const attachmentBase64 = await blobToBase64(pdfBlob);
      if (!attachmentBase64) {
        throw new Error("Falha ao gerar o anexo.");
      }

      const emailData = buildCertificateEmailData({
        training,
        nome: participation.professional_name,
        rg: participation.professional_rg,
        role: "participant",
      });
      const subject = interpolateEmailTemplate(emailTemplate.subject, emailData).trim() ||
        DEFAULT_CERTIFICATE_EMAIL_TEMPLATE.subject;
      const body = interpolateEmailTemplate(emailTemplate.body, emailData).trim() ||
        DEFAULT_CERTIFICATE_EMAIL_TEMPLATE.body;
      await dataClient.integrations.Core.SendEmail({
        to: participation.professional_email,
        subject,
        body,
        attachments: [
          {
            filename: fileName,
            contentType: "application/pdf",
            content: attachmentBase64,
          },
        ],
      });

      await dataClient.entities.TrainingParticipant.update(participation.id, {
        certificate_sent_date: new Date().toISOString(),
        certificate_issued: true,
      });

      setEmailStatus({
        type: "success",
        message: "E-mail reenviado com sucesso.",
      });
    } catch (error) {
      setEmailStatus({
        type: "error",
        message: error.message || "Erro ao reenviar e-mail.",
      });
    } finally {
      setSendingId(null);
    }
  };

  const renderTrainingCard = (participation) => {
    const hasCertificate = participation.certificate_url || participation.certificate_issued;
    return (
      <Card key={participation.id} className="mb-3">
        <CardContent className="pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h4 className="font-semibold text-slate-900">{participation.training_title}</h4>
              <div className="flex flex-wrap gap-2 mt-2">
                {participation.training_date && (
                  <div className="flex items-center gap-1 text-sm text-slate-600">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(participation.training_date), "dd/MM/yyyy")}
                  </div>
                )}
                {resolveTrainingType(participation) && (
                  <Badge variant="outline" className="text-xs">
                    {typeLabels[resolveTrainingType(participation)] ||
                      resolveTrainingType(participation)}
                  </Badge>
                )}
                {participation.attendance_percentage !== undefined && (
                  <div className="flex items-center gap-1 text-sm text-slate-600">
                    <Clock className="h-3 w-3" />
                    {participation.attendance_percentage}% presença
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {participation.enrollment_status && (
                  <Badge variant="outline" className="text-xs">
                    {participation.enrollment_status}
                  </Badge>
                )}
                {participation.approved && (
                  <Badge className="bg-green-100 text-green-700 text-xs">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Aprovado
                  </Badge>
                )}
                {participation.certificate_issued && (
                  <Badge className="bg-blue-100 text-blue-700 text-xs">
                    <Award className="h-3 w-3 mr-1" />
                    Certificado
                  </Badge>
                )}
              </div>
              {participation.validity_date && (
                <p className="text-xs text-slate-500 mt-2">
                  Válido até: {format(new Date(participation.validity_date), "dd/MM/yyyy")}
                </p>
              )}
            </div>
            {hasCertificate && (
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownloadCertificate(participation)}
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Baixar PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRegenerateCertificate(participation)}
                  disabled={regeneratingId === participation.id}
                >
                  {regeneratingId === participation.id ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Regenerar PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleResendCertificate(participation)}
                  disabled={sendingId === participation.id}
                >
                  {sendingId === participation.id ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4 mr-1" />
                  )}
                  Reenviar por e-mail
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Perfil do Participante</h1>
          <p className="text-slate-500">Histórico completo de treinamentos</p>
        </div>
      </div>

      {/* Informações Básicas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-blue-600" />
            Informações do Participante
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: "Nome", value: mergedParticipant.professional_name },
              { label: "RG", value: mergedParticipant.professional_rg },
              { label: "CPF", value: mergedParticipant.professional_cpf },
              { label: "E-mail", value: mergedParticipant.professional_email },
              { label: "Celular", value: mergedParticipant.mobile_phone },
              { label: "Telefone Comercial", value: mergedParticipant.commercial_phone },
              { label: "Matrícula", value: mergedParticipant.professional_registration },
              { label: "Formação Profissional", value: mergedParticipant.professional_formation },
              { label: "Cargo", value: mergedParticipant.professional_sector },
              { label: "Instituição", value: mergedParticipant.institution },
              { label: "Unidade", value: mergedParticipant.unit_name },
              { label: "Município", value: mergedParticipant.municipality },
              { label: "GVE", value: mergedParticipant.health_region },
              { label: "Estado", value: mergedParticipant.state },
              { label: "Endereço de Trabalho", value: mergedParticipant.work_address },
              { label: "Endereço Residencial", value: mergedParticipant.residential_address },
            ]
              .filter((item) => item.value)
              .map((item) => (
                <div key={item.label}>
                  <p className="text-sm text-slate-500">{item.label}</p>
                  <p className="font-semibold break-words">{item.value}</p>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <GraduationCap className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{allParticipations.length}</p>
                <p className="text-sm text-slate-500">Treinamentos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{approvedCount}</p>
                <p className="text-sm text-slate-500">Aprovações</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-amber-100 flex items-center justify-center">
                <Award className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{certificatesCount}</p>
                <p className="text-sm text-slate-500">Certificados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
                <Clock className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{avgAttendance}%</p>
                <p className="text-sm text-slate-500">Presença Média</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {regenStatus && (
        <Card className={regenStatus.type === "error" ? "border-red-200" : "border-green-200"}>
          <CardContent className="pt-4">
            <p
              className={
                regenStatus.type === "error"
                  ? "text-sm text-red-700"
                  : "text-sm text-green-700"
              }
            >
              {regenStatus.message}
            </p>
          </CardContent>
        </Card>
      )}

      {emailStatus && (
        <Card className={emailStatus.type === "error" ? "border-red-200" : "border-green-200"}>
          <CardContent className="pt-4">
            <p
              className={
                emailStatus.type === "error"
                  ? "text-sm text-red-700"
                  : "text-sm text-green-700"
              }
            >
              {emailStatus.message}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Treinamentos por Tipo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-blue-600" />
            Histórico de Treinamentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {participationsSorted.length === 0 ? (
            <p className="text-center text-slate-500 py-8">
              Nenhum treinamento realizado
            </p>
          ) : (
            participationsSorted.map(renderTrainingCard)
          )}
        </CardContent>
      </Card>
    </div>
  );
}