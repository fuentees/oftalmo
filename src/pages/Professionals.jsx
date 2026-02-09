import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { format } from "date-fns";
import {
  Users,
  Plus,
  Edit,
  Trash2,
  Eye,
  GraduationCap,
  Building2,
  Mail,
  Phone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PageHeader from "@/components/common/PageHeader";
import SearchFilter from "@/components/common/SearchFilter";
import DataTable from "@/components/common/DataTable";
import ProfessionalForm from "@/components/professionals/ProfessionalForm";
import ProfessionalDetails from "@/components/professionals/ProfessionalDetails";

export default function Professionals() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");
  
  const [showForm, setShowForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedProfessional, setSelectedProfessional] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const queryClient = useQueryClient();

  const { data: professionals = [], isLoading } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => dataClient.entities.Professional.list(),
  });

  const { data: participants = [] } = useQuery({
    queryKey: ["participants"],
    queryFn: () => dataClient.entities.TrainingParticipant.list(),
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: () => dataClient.entities.Event.list(),
  });

  const deleteProfessional = useMutation({
    mutationFn: (id) => dataClient.entities.Professional.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professionals"] });
      setDeleteConfirm(null);
    },
  });

  const statusOptions = [
    { value: "ativo", label: "Ativo" },
    { value: "inativo", label: "Inativo" },
    { value: "afastado", label: "Afastado" },
    { value: "ferias", label: "Férias" },
  ];

  // Get unique sectors from professionals
  const sectors = [...new Set(professionals.map(p => p.sector).filter(Boolean))];
  const sectorOptions = sectors.map(s => ({ value: s, label: s }));

  const filteredProfessionals = professionals.filter((p) => {
    const matchesSearch = p.name?.toLowerCase().includes(search.toLowerCase()) ||
                          p.registration?.toLowerCase().includes(search.toLowerCase()) ||
                          p.email?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    const matchesSector = sectorFilter === "all" || p.sector === sectorFilter;
    return matchesSearch && matchesStatus && matchesSector;
  });

  const statusColors = {
    ativo: "bg-green-100 text-green-700",
    inativo: "bg-slate-100 text-slate-700",
    afastado: "bg-amber-100 text-amber-700",
    ferias: "bg-blue-100 text-blue-700",
  };

  const statusLabels = {
    ativo: "Ativo",
    inativo: "Inativo",
    afastado: "Afastado",
    ferias: "Férias",
  };

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
    { header: "Matrícula", accessor: "registration" },
    {
      header: "Setor",
      render: (row) => row.sector && (
        <div className="flex items-center gap-1">
          <Building2 className="h-4 w-4 text-slate-400" />
          {row.sector}
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
      header: "Status",
      render: (row) => (
        <Badge className={statusColors[row.status || "ativo"]}>
          {statusLabels[row.status || "ativo"]}
        </Badge>
      ),
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
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedProfessional(row);
              setShowForm(true);
            }}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-red-600"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteConfirm(row);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profissionais"
        subtitle="Cadastro e histórico de profissionais"
        action={() => {
          setSelectedProfessional(null);
          setShowForm(true);
        }}
        actionLabel="Novo Profissional"
      />

      <SearchFilter
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por nome, matrícula ou email..."
        filters={[
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: "Status",
            allLabel: "Todos os status",
            options: statusOptions,
          },
          {
            value: sectorFilter,
            onChange: setSectorFilter,
            placeholder: "Setor",
            allLabel: "Todos os setores",
            options: sectorOptions,
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={filteredProfessionals}
        isLoading={isLoading}
        emptyMessage="Nenhum profissional cadastrado"
      />

      {/* Professional Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedProfessional ? "Editar Profissional" : "Novo Profissional"}
            </DialogTitle>
          </DialogHeader>
          <ProfessionalForm
            professional={selectedProfessional}
            onClose={() => {
              setShowForm(false);
              setSelectedProfessional(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Professional Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Profissional</DialogTitle>
          </DialogHeader>
          <ProfessionalDetails
            professional={selectedProfessional}
            trainings={participants.filter(p => p.professional_id === selectedProfessional?.id)}
            events={events.filter(e => e.professional_ids?.includes(selectedProfessional?.id))}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o profissional "{deleteConfirm?.name}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteProfessional.mutate(deleteConfirm.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}