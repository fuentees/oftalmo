import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, UserPlus, Trash2, Loader2 } from "lucide-react";
import { addMonths, format } from "date-fns";

export default function ParticipantsManager({ training, professionals, existingParticipants, onClose }) {
  const [search, setSearch] = useState("");
  const [selectedProfessionals, setSelectedProfessionals] = useState([]);
  const [participantData, setParticipantData] = useState(
    existingParticipants.reduce((acc, p) => ({
      ...acc,
      [p.professional_id]: {
        attendance: p.attendance || "presente",
        approved: p.approved !== false,
        grade: p.grade || "",
      }
    }), {})
  );

  const queryClient = useQueryClient();

  const addParticipants = useMutation({
    mutationFn: async (/** @type {any[]} */ professionalIds) => {
      const baseDate = training.date ? new Date(training.date) : null;
      const validityDate =
        training.validity_months &&
        baseDate &&
        !Number.isNaN(baseDate.getTime())
          ? format(addMonths(baseDate, training.validity_months), "yyyy-MM-dd")
          : null;

      const newParticipants = professionalIds.map((id) => {
        const professional = professionals.find((p) => p.id === id);
        return {
          training_id: training.id,
          training_title: training.title,
          training_date: training.date,
          professional_id: id,
          professional_name: professional?.name,
          professional_registration: professional?.registration,
          professional_rg: professional?.rg,
          professional_cpf: professional?.cpf,
          professional_email: professional?.email,
          professional_sector: professional?.sector,
          attendance: "presente",
          approved: true,
          validity_date: validityDate,
        };
      });

      await dataClient.entities.TrainingParticipant.bulkCreate(newParticipants);
      
      // Update training participant count
      await dataClient.entities.Training.update(training.id, {
        participants_count: (training.participants_count || 0) + professionalIds.length,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participants"] });
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      setSelectedProfessionals([]);
    },
  });

  const updateParticipant = useMutation({
    mutationFn: (/** @type {{ participantId: any; data: any }} */ payload) =>
      dataClient.entities.TrainingParticipant.update(payload.participantId, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participants"] });
    },
  });

  const removeParticipant = useMutation({
    mutationFn: async (/** @type {any} */ participantId) => {
      await dataClient.entities.TrainingParticipant.delete(participantId);
      
      // Update training participant count
      await dataClient.entities.Training.update(training.id, {
        participants_count: Math.max(0, (training.participants_count || 1) - 1),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participants"] });
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
    },
  });

  const existingProfessionalIds = existingParticipants.map((p) => p.professional_id);
  
  const availableProfessionals = professionals.filter(
    (p) => p.status === "ativo" && !existingProfessionalIds.includes(p.id)
  );

  const filteredProfessionals = availableProfessionals.filter(
    (p) => p.name?.toLowerCase().includes(search.toLowerCase()) ||
           p.registration?.toLowerCase().includes(search.toLowerCase()) ||
           p.sector?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleProfessional = (id) => {
    setSelectedProfessionals((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleUpdateParticipant = (participant, field, value) => {
    setParticipantData((prev) => ({
      ...prev,
      [participant.professional_id]: {
        ...prev[participant.professional_id],
        [field]: value,
      }
    }));
    
    updateParticipant.mutate({
      participantId: participant.id,
      data: { [field]: value },
    });
  };

  return (
    <div className="space-y-6">
      {/* Add Participants Section */}
      <div>
        <h3 className="font-semibold mb-3">Adicionar Participantes</h3>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar profissional..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {filteredProfessionals.length > 0 ? (
          <div className="border rounded-lg max-h-48 overflow-y-auto">
            <Table>
              <TableBody>
                {filteredProfessionals.map((professional) => (
                  <TableRow key={professional.id} className="cursor-pointer hover:bg-slate-50">
                    <TableCell className="w-10">
                      <Checkbox
                        checked={selectedProfessionals.includes(professional.id)}
                        onCheckedChange={() => toggleProfessional(professional.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{professional.name}</TableCell>
                    <TableCell>{professional.registration}</TableCell>
                    <TableCell>{professional.sector}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-slate-500 text-center py-4">
            {search ? "Nenhum profissional encontrado" : "Todos os profissionais ativos já estão participando"}
          </p>
        )}

        {selectedProfessionals.length > 0 && (
          <Button
            onClick={() => addParticipants.mutate(selectedProfessionals)}
            disabled={addParticipants.isPending}
            className="mt-3 bg-blue-600 hover:bg-blue-700"
          >
            {addParticipants.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4 mr-2" />
            )}
            Adicionar {selectedProfessionals.length} participante(s)
          </Button>
        )}
      </div>

      {/* Current Participants Section */}
      <div>
        <h3 className="font-semibold mb-3">
          Participantes Atuais ({existingParticipants.length})
        </h3>
        
        {existingParticipants.length > 0 ? (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Nome</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>RG</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Presença</TableHead>
                  <TableHead>Aprovado</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {existingParticipants.map((participant) => (
                  <TableRow key={participant.id}>
                    <TableCell className="font-medium">{participant.professional_name}</TableCell>
                    <TableCell>{participant.professional_registration}</TableCell>
                    <TableCell>{participant.professional_rg}</TableCell>
                    <TableCell>{participant.professional_cpf}</TableCell>
                    <TableCell>{participant.professional_email}</TableCell>
                    <TableCell>{participant.professional_sector}</TableCell>
                    <TableCell>
                      <Select
                        value={participantData[participant.professional_id]?.attendance || "presente"}
                        onValueChange={(v) => handleUpdateParticipant(participant, "attendance", v)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="presente">Presente</SelectItem>
                          <SelectItem value="ausente">Ausente</SelectItem>
                          <SelectItem value="justificado">Justificado</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={participantData[participant.professional_id]?.approved !== false}
                        onCheckedChange={(v) => handleUpdateParticipant(participant, "approved", v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-600"
                        onClick={() => removeParticipant.mutate(participant.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-slate-500 text-center py-4 border rounded-lg">
            Nenhum participante registrado
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