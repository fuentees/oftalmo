import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Eye, GraduationCap, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PageHeader from "@/components/common/PageHeader";
import SearchFilter from "@/components/common/SearchFilter";
import DataTable from "@/components/common/DataTable";
import { useNavigate } from "react-router-dom";

export default function Professionals() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const { data: professionals = [], isLoading } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => dataClient.entities.Professional.list(),
  });

  const { data: participants = [] } = useQuery({
    queryKey: ["participants"],
    queryFn: () => dataClient.entities.TrainingParticipant.list(),
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
          <button
            type="button"
            className="font-medium text-slate-900 hover:text-blue-700 hover:underline text-left"
            onClick={(event) => {
              event.stopPropagation();
              navigate(
                `/ProfessionalProfile?id=${encodeURIComponent(String(row?.id || "").trim())}`
              );
            }}
          >
            {row.name}
          </button>
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
        const count = participants.filter((participant) =>
          matchesProfessional(participant, row)
        ).length;
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
              navigate(
                `/ProfessionalProfile?id=${encodeURIComponent(String(row?.id || "").trim())}`
              );
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
        onRowClick={(row) =>
          navigate(
            `/ProfessionalProfile?id=${encodeURIComponent(String(row?.id || "").trim())}`
          )
        }
      />
    </div>
  );
}