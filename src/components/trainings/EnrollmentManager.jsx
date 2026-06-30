import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserPlus, CheckCircle, XCircle, Loader2, Copy, Check } from "lucide-react";
import { addMonths, format } from "date-fns";
import { parseDateSafe } from "@/lib/date";
import {
  loadProfessionalGoogleEmailStore,
  resolveProfessionalGoogleEmail,
} from "@/lib/professionalGoogleEmailStore";

export default function EnrollmentManager({ training, professionals, existingParticipants, onClose }) {
  const [selectedProfessional, setSelectedProfessional] = useState("");
  const [emailsCopied, setEmailsCopied] = useState(false);

  const handleCopyEmails = () => {
    const emails = existingParticipants
      .map((p) => p.professional_email)
      .filter(Boolean)
      .join("; ");
    if (!emails) return;
    navigator.clipboard.writeText(emails).then(() => {
      setEmailsCopied(true);
      setTimeout(() => setEmailsCopied(false), 2000);
    });
  };

  const queryClient = useQueryClient();
  const { data: professionalGoogleEmailStore = { byProfessionalId: {}, byProfessionalEmail: {} } } =
    useQuery({
      queryKey: ["professional-google-email-store"],
      queryFn: loadProfessionalGoogleEmailStore,
    });

  const resolveCalendarInviteEmail = ({ professional, participant }) => {
    const mappedByProfessional = resolveProfessionalGoogleEmail(
      professionalGoogleEmailStore,
      {
        professionalId: professional?.id || participant?.professional_id,
        professionalEmail: professional?.email || participant?.professional_email,
      }
    );
    if (mappedByProfessional) return mappedByProfessional;
    return String(
      professional?.email || participant?.professional_email || ""
    ).trim();
  };

  const syncEnrollmentCalendar = async ({
    participant,
    professional,
    operation = "upsert",
  }) => {
    try {
      await dataClient.integrations.Core.SyncGoogleCalendarEnrollment({
        operation,
        training: {
          id: training?.id,
          title: training?.title,
          description: training?.description,
          code: training?.code,
          location: training?.location,
          coordinator: training?.coordinator,
          instructor: training?.instructor,
          dates: Array.isArray(training?.dates) ? training.dates : [],
        },
        participant,
        attendee_email: resolveCalendarInviteEmail({ professional, participant }),
      });
    } catch (error) {
      // Não bloqueia fluxo principal por falha externa de agenda.
      console.warn("[calendar-sync]", error?.message || error);
    }
  };

  const buildParticipantPayload = (professionalOrData, overrides = {}) => {
    const trainingDates = Array.isArray(training?.dates) ? training.dates : [];
    const firstDate = trainingDates.length > 0 ? trainingDates[0].date : null;
    const baseDate = firstDate ? parseDateSafe(firstDate) : null;
    const validityDate =
      training.validity_months && baseDate && !Number.isNaN(baseDate.getTime())
        ? format(addMonths(baseDate, training.validity_months), "yyyy-MM-dd")
        : null;

    return {
      training_id: training.id,
      training_title: training.title,
      training_date: firstDate,
      professional_id: professionalOrData?.id || null,
      professional_name: professionalOrData?.name || null,
      professional_registration: professionalOrData?.registration || null,
      professional_rg: professionalOrData?.rg || null,
      professional_cpf: professionalOrData?.cpf || null,
      professional_email: professionalOrData?.email || null,
      professional_sector: professionalOrData?.sector || null,
      enrollment_status: "inscrito",
      enrollment_date: new Date().toISOString(),
      attendance_records: [],
      attendance_percentage: 0,
      approved: false,
      certificate_issued: false,
      validity_date: validityDate,
      ...overrides,
    };
  };

  const enrollParticipant = useMutation({
    mutationFn: async (/** @type {any} */ professionalId) => {
      const professional = professionals.find((p) => p.id === professionalId);
      const participant = buildParticipantPayload(professional);
      const createdParticipant = await dataClient.entities.TrainingParticipant.create(participant);
      await syncEnrollmentCalendar({
        participant: createdParticipant || participant,
        professional,
        operation: "upsert",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participants"] });
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      setSelectedProfessional("");
    },
  });

  const enrollStaffMember = useMutation({
    mutationFn: async ({ name, email, professional_id }) => {
      let professional = null;
      if (professional_id) professional = professionals.find((p) => p.id === professional_id);
      if (!professional && name) {
        professional = professionals.find(
          (p) => String(p.name || "").trim().toLowerCase() === String(name).trim().toLowerCase()
        );
      }

      const participant = buildParticipantPayload(professional, {
        professional_id: professional?.id || professional_id || null,
        professional_name: professional?.name || name,
        professional_email: professional?.email || email || null,
      });

      const createdParticipant = await dataClient.entities.TrainingParticipant.create(participant);
      if (professional) {
        await syncEnrollmentCalendar({
          participant: createdParticipant || participant,
          professional,
          operation: "upsert",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participants"] });
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
    },
  });

  const updateEnrollmentStatus = useMutation({
    mutationFn: async (/** @type {{ participant: any; status: string }} */ payload) => {
      const participantId = payload?.participant?.id;
      const status = payload?.status;
      const updatedParticipant = await dataClient.entities.TrainingParticipant.update(participantId, {
        enrollment_status: status,
      });
      const linkedProfessional = professionals.find(
        (professional) =>
          String(professional?.id || "").trim() ===
          String(payload?.participant?.professional_id || "").trim()
      );
      await syncEnrollmentCalendar({
        participant: updatedParticipant || payload?.participant,
        professional: linkedProfessional,
        operation: status === "cancelado" ? "delete" : "upsert",
      });
      return updatedParticipant;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participants"] });
    },
  });

  const existingProfessionalIds = existingParticipants.map((p) => p.professional_id);
  const alreadyEnrolledNames = new Set(
    existingParticipants.map((p) => String(p.professional_name || "").trim().toLowerCase())
  );

  const isProfessionalActive = (professional) =>
    String(professional?.status || "").trim().toLowerCase() !== "inativo";

  const availableProfessionals = professionals.filter(
    (p) => isProfessionalActive(p) && !existingProfessionalIds.includes(p.id)
  );

  const monitors = (Array.isArray(training?.monitors) ? training.monitors : []).filter((m) => m?.name);
  const speakers = (Array.isArray(training?.speakers) ? training.speakers : []).filter((s) => s?.name);
  const hasStaff = monitors.length > 0 || speakers.length > 0;

  const statusColors = {
    inscrito: "bg-blue-100 text-blue-700",
    confirmado: "bg-green-100 text-green-700",
    cancelado: "bg-red-100 text-red-700",
  };

  const statusLabels = {
    inscrito: "Inscrito",
    confirmado: "Confirmado",
    cancelado: "Cancelado",
  };

  return (
    <div className="space-y-6">
      {/* Equipe do Treinamento */}
      {hasStaff && (
        <div>
          <h3 className="font-semibold mb-3">Equipe do Treinamento</h3>
          <div className="border rounded-lg divide-y">
            {monitors.map((monitor, index) => {
              const name = String(monitor?.name || "").trim();
              const isEnrolled = alreadyEnrolledNames.has(name.toLowerCase());
              return (
                <div key={`monitor-${index}`} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{name}</span>
                    <Badge variant="outline" className="text-xs">Monitor</Badge>
                  </div>
                  {isEnrolled ? (
                    <Badge className="bg-green-100 text-green-700 text-xs">Inscrito</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => enrollStaffMember.mutate({ name, email: monitor.email, professional_id: monitor.professional_id })}
                      disabled={enrollStaffMember.isPending}
                    >
                      <UserPlus className="h-3 w-3" />
                      Inscrever
                    </Button>
                  )}
                </div>
              );
            })}
            {speakers.map((speaker, index) => {
              const name = String(speaker?.name || "").trim();
              const isEnrolled = alreadyEnrolledNames.has(name.toLowerCase());
              return (
                <div key={`speaker-${index}`} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{name}</span>
                    <Badge variant="outline" className="text-xs">Palestrante</Badge>
                  </div>
                  {isEnrolled ? (
                    <Badge className="bg-green-100 text-green-700 text-xs">Inscrito</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => enrollStaffMember.mutate({ name, email: speaker.email, professional_id: speaker.professional_id })}
                      disabled={enrollStaffMember.isPending}
                    >
                      <UserPlus className="h-3 w-3" />
                      Inscrever
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Nova Inscrição */}
      <div>
        <h3 className="font-semibold mb-3">Nova Inscrição</h3>
        <div className="flex gap-3">
          <select
            value={selectedProfessional}
            onChange={(e) => setSelectedProfessional(e.target.value)}
            className="flex-1 h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">Selecione um profissional</option>
            {availableProfessionals.map((prof) => (
              <option key={prof.id} value={prof.id}>
                {prof.name} - {prof.sector}
              </option>
            ))}
          </select>
          <Button
            onClick={() => enrollParticipant.mutate(selectedProfessional)}
            disabled={!selectedProfessional || enrollParticipant.isPending}
            className="text-white" style={{ background: "hsl(var(--primary))" }}
          >
            {enrollParticipant.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4 mr-2" />
            )}
            Inscrever
          </Button>
        </div>
      </div>

      {/* Enrolled Participants */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Inscritos ({existingParticipants.length})</h3>
          {existingParticipants.some((p) => p.professional_email) && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={handleCopyEmails}
            >
              {emailsCopied ? (
                <Check className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {emailsCopied ? "Copiado!" : "Copiar e-mails"}
            </Button>
          )}
        </div>

        {existingParticipants.length > 0 ? (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Nome</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Data Inscrição</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {existingParticipants.map((participant) => (
                  <TableRow key={participant.id}>
                    <TableCell className="font-medium">{participant.professional_name}</TableCell>
                    <TableCell>{participant.professional_registration}</TableCell>
                    <TableCell>{participant.professional_sector}</TableCell>
                    <TableCell>
                      {participant.enrollment_date ?
                        format(new Date(participant.enrollment_date), "dd/MM/yyyy HH:mm") :
                        "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[participant.enrollment_status || "inscrito"]}>
                        {statusLabels[participant.enrollment_status || "inscrito"]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {participant.enrollment_status !== "confirmado" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateEnrollmentStatus.mutate({
                              participant,
                              status: "confirmado"
                            })}
                          >
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        {participant.enrollment_status !== "cancelado" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateEnrollmentStatus.mutate({
                              participant,
                              status: "cancelado"
                            })}
                          >
                            <XCircle className="h-4 w-4 text-red-600" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-slate-500 text-center py-4 border rounded-lg">
            Nenhuma inscrição registrada
          </p>
        )}
      </div>

      <div className="flex justify-end pt-4">
        <Button variant="outline" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  );
}
