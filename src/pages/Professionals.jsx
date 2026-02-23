import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Eye, GraduationCap, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PageHeader from "@/components/common/PageHeader";
import SearchFilter from "@/components/common/SearchFilter";
import DataTable from "@/components/common/DataTable";
import ProfessionalDetails from "@/components/professionals/ProfessionalDetails";

export default function Professionals() {
  const [search, setSearch] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [selectedProfessional, setSelectedProfessional] = useState(null);

  const { data: professionals = [], isLoading } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => dataClient.entities.Professional.list(),
  });

  const { data: participants = [] } = useQuery({
    queryKey: ["participants"],
    queryFn: () => dataClient.entities.TrainingParticipant.list(),
  });

  const { data: trainings = [] } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => dataClient.entities.Training.list(),
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: () => dataClient.entities.Event.list(),
  });

  const normalizeText = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();

  const normalizeRg = (value) => String(value ?? "").replace(/\D/g, "");

  const matchesProfessional = (participant, professional) => {
    if (!participant || !professional) return false;
    if (participant.professional_id && participant.professional_id === professional.id) {
      return true;
    }
    const nameMatch =
      normalizeText(participant.professional_name) === normalizeText(professional.name);
    const emailMatch =
      normalizeEmail(participant.professional_email) === normalizeEmail(professional.email);
    const rgMatch =
      normalizeRg(participant.professional_rg) === normalizeRg(professional.rg);

    if (emailMatch || rgMatch) return true;
    if (!normalizeEmail(professional.email) && !normalizeRg(professional.rg)) {
      return nameMatch;
    }
    return nameMatch && (emailMatch || rgMatch);
  };

  const filteredProfessionals = professionals.filter((p) => {
    const normalizedSearch = search.toLowerCase();
    const matchesSearch = p.name?.toLowerCase().includes(normalizedSearch) ||
                          p.email?.toLowerCase().includes(normalizedSearch) ||
                          p.phone?.toLowerCase().includes(normalizedSearch);
    return matchesSearch;
  });

  const columns = [
    { 
      header: "Nome", 
      cellClassName: "font-medium",
      render: (row) => (
        <div>
          <p className="font-medium">{row.name}</p>
          {row.position && <p className="text-xs text-slate-500">{row.position}</p>}
        </div>
      ),
    },
    {
      header: "Contato",
      render: (row) => (
        <div className="text-sm">
          {row.email && (
            <div className="flex items-center gap-1 text-slate-600">
              <Mail className="h-3 w-3" />
              {row.email}
            </div>
          )}
          {row.phone && (
            <div className="flex items-center gap-1 text-slate-600">
              <Phone className="h-3 w-3" />
              {row.phone}
            </div>
          )}
        </div>
      ),
    },
    {
      header: "Treinamentos",
      render: (row) => {
        const count = participants.filter(p => p.professional_id === row.id).length;
        return (
          <div className="flex items-center gap-1">
            <GraduationCap className="h-4 w-4 text-slate-400" />
            {count}
          </div>
        );
      },
    },
    {
      header: "Ações",
      cellClassName: "text-right",
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedProfessional(row);
              setShowDetails(true);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profissionais"
        subtitle="Lista sincronizada com Usuários cadastrados"
      />

      <Alert>
        <AlertDescription>
          Cadastro manual de profissionais desativado. Esta lista é alimentada
          automaticamente pelos Usuários cadastrados.
        </AlertDescription>
      </Alert>

      <SearchFilter
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por nome, email ou telefone..."
      />

      <DataTable
        columns={columns}
        data={filteredProfessionals}
        isLoading={isLoading}
        emptyMessage="Nenhum profissional cadastrado"
      />

      {/* Professional Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Profissional</DialogTitle>
          </DialogHeader>
          <ProfessionalDetails
            professional={selectedProfessional}
            participations={participants.filter((p) =>
              matchesProfessional(p, selectedProfessional)
            )}
            trainings={trainings}
            events={events.filter((event) => {
              const hasId = event.professional_ids?.includes(selectedProfessional?.id);
              if (hasId) return true;
              const normalizedName = normalizeText(selectedProfessional?.name);
              if (!normalizedName) return false;
              return (event.professional_names || []).some(
                (name) => normalizeText(name) === normalizedName
              );
            })}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}