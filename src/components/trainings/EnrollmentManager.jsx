import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { UserPlus, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { addMonths, format } from "date-fns";
import { parseDateSafe } from "@/lib/date";

export default function EnrollmentManager({ training, professionals, existingParticipants, onClose }) {
  const [selectedProfessional, setSelectedProfessional] = useState("");
  
  const queryClient = useQueryClient();

  const enrollParticipant = useMutation({
    mutationFn: async (/** @type {any} */ professionalId) => {
      const professional = professionals.find((p) => p.id === professionalId);
      const trainingDates = Array.isArray(training?.dates) ? training.dates : [];
      const firstDate = trainingDates.length > 0 ? trainingDates[0].date : null;
      const baseDate = firstDate ? parseDateSafe(firstDate) : null;
      const validityDate =
        training.validity_months &&
        baseDate &&
        !Number.isNaN(baseDate.getTime())
          ? format(addMonths(baseDate, training.validity_months), "yyyy-MM-dd")
          : null;
      
      const participant = {
        training_id: training.id,
        training_title: training.title,
        training_date: firstDate,
        professional_id: professionalId,
        professional_name: professional?.name,
        professional_registration: professional?.registration,
        professional_rg: professional?.rg,
        professional_cpf: professional?.cpf,
        professional_email: professional?.email,
        professional_sector: professional?.sector,
        enrollment_status: "inscrito",
        enrollment_date: new Date().toISOString(),
        attendance_records: [],
        attendance_percentage: 0,
        approved: false,
        certificate_issued: false,
        validity_date: validityDate,
      };

      await dataClient.entities.TrainingParticipant.create(participant);
      
      // Update training participant count
      await dataClient.entities.Training.update(training.id, {
        participants_count: (training.participants_count || 0) + 1,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participants"] });
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      setSelectedProfessional("");
    },
  });

  const updateEnrollmentStatus = useMutation({
    mutationFn: (/** @type {{ participantId: any; status: string }} */ payload) => {
      const { participantId, status } = payload;
      return dataClient.entities.TrainingParticipant.update(participantId, {
        enrollment_status: status,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participants"] });
    },
  });

  const existingProfessionalIds = existingParticipants.map((p) => p.professional_id);
  const isProfessionalActive = (professional) =>
    String(professional?.status || "").trim().toLowerCase() !== "inativo";
  
  const availableProfessionals = professionals.filter(
    (p) => isProfessionalActive(p) && !existingProfessionalIds.includes(p.id)
  );

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
      {/* Enroll New Participant */}
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
            className="bg-blue-600 hover:bg-blue-700"
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
        <h3 className="font-semibold mb-3">
          Inscritos ({existingParticipants.length})
        </h3>
        
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
                              participantId: participant.id,
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
                              participantId: participant.id,
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