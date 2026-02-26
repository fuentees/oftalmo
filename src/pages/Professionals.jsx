import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import {
  Eye,
  GraduationCap,
  Loader2,
  Mail,
  Pencil,
  Phone,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/common/PageHeader";
import SearchFilter from "@/components/common/SearchFilter";
import DataTable from "@/components/common/DataTable";
import { useNavigate } from "react-router-dom";

export default function Professionals() {
  const [search, setSearch] = useState("");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editStatus, setEditStatus] = useState(null);
  const [pageStatus, setPageStatus] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    position: "",
    rg: "",
    cpf: "",
    registration: "",
    sector: "",
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    data: professionals = [],
    isLoading,
    isFetching: isFetchingProfessionals,
    refetch: refetchProfessionals,
  } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => dataClient.entities.Professional.list(),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: participants = [], refetch: refetchParticipants } = useQuery({
    queryKey: ["participants"],
    queryFn: () => dataClient.entities.TrainingParticipant.list(),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
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

  const normalizeOptionalField = (value) => {
    const text = String(value ?? "").trim();
    return text || null;
  };

  const handleOpenEdit = (professional) => {
    setPageStatus(null);
    setEditStatus(null);
    setEditingProfessional(professional);
    setEditForm({
      name: String(professional?.name || ""),
      email: String(professional?.email || ""),
      phone: String(professional?.phone || ""),
      position: String(professional?.position || ""),
      rg: String(professional?.rg || ""),
      cpf: String(professional?.cpf || ""),
      registration: String(professional?.registration || ""),
      sector: String(professional?.sector || ""),
    });
    setIsEditOpen(true);
  };

  const handleCloseEdit = () => {
    setIsEditOpen(false);
    setEditStatus(null);
    setEditingProfessional(null);
  };

  const updateProfessional = useMutation({
    mutationFn: async () => {
      const professionalId = String(editingProfessional?.id || "").trim();
      if (!professionalId) {
        throw new Error("Profissional inválido para edição.");
      }

      const name = String(editForm.name || "").trim();
      if (!name) {
        throw new Error("Informe o nome do profissional.");
      }

      return dataClient.entities.Professional.update(professionalId, {
        name,
        email: normalizeOptionalField(editForm.email)?.toLowerCase() || null,
        phone: normalizeOptionalField(editForm.phone),
        position: normalizeOptionalField(editForm.position),
        rg: normalizeOptionalField(editForm.rg),
        cpf: normalizeOptionalField(editForm.cpf),
        registration: normalizeOptionalField(editForm.registration),
        sector: normalizeOptionalField(editForm.sector),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["professionals"] }),
        queryClient.invalidateQueries({ queryKey: ["participants"] }),
      ]);
      setPageStatus({
        type: "success",
        message: "Profissional atualizado com sucesso.",
      });
      handleCloseEdit();
    },
    onError: (error) => {
      setEditStatus({
        type: "error",
        message: error?.message || "Não foi possível atualizar o profissional.",
      });
    },
  });

  const handleSubmitEdit = (event) => {
    event.preventDefault();
    setEditStatus(null);
    updateProfessional.mutate();
  };

  const deleteProfessional = useMutation({
    mutationFn: async () => {
      const professionalId = String(deleteConfirm?.id || "").trim();
      if (!professionalId) {
        throw new Error("Profissional inválido para exclusão.");
      }
      return dataClient.entities.Professional.delete(professionalId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["professionals"] }),
        queryClient.invalidateQueries({ queryKey: ["participants"] }),
      ]);
      setDeleteConfirm(null);
      setPageStatus({
        type: "success",
        message: "Profissional excluído com sucesso.",
      });
    },
    onError: (error) => {
      setPageStatus({
        type: "error",
        message: error?.message || "Não foi possível excluir o profissional.",
      });
    },
  });

  const filteredProfessionals = useMemo(
    () =>
      professionals.filter((p) => {
        const normalizedSearch = search.toLowerCase();
        const matchesSearch =
          p.name?.toLowerCase().includes(normalizedSearch) ||
          p.email?.toLowerCase().includes(normalizedSearch) ||
          p.phone?.toLowerCase().includes(normalizedSearch);
        return matchesSearch;
      }),
    [professionals, search]
  );

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
              handleOpenEdit(row);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-red-600 hover:text-red-700"
            onClick={(e) => {
              e.stopPropagation();
              setPageStatus(null);
              setDeleteConfirm(row);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
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
        actionLabel={isFetchingProfessionals ? "Atualizando..." : "Atualizar"}
        actionIcon={RefreshCw}
        onActionClick={() => {
          setPageStatus(null);
          refetchProfessionals();
          refetchParticipants();
        }}
      />

      <Alert>
        <AlertDescription>
          Cadastro manual de profissionais desativado. Esta lista é alimentada
          automaticamente pelos Usuários cadastrados.
        </AlertDescription>
      </Alert>

      {pageStatus && (
        <Alert
          className={
            pageStatus.type === "error"
              ? "border-red-200 bg-red-50"
              : "border-green-200 bg-green-50"
          }
        >
          <AlertDescription
            className={pageStatus.type === "error" ? "text-red-700" : "text-green-700"}
          >
            {pageStatus.message}
          </AlertDescription>
        </Alert>
      )}

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

      <Dialog open={isEditOpen} onOpenChange={(open) => (open ? setIsEditOpen(true) : handleCloseEdit())}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar profissional</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitEdit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="professional-name">Nome *</Label>
                <Input
                  id="professional-name"
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Nome completo"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="professional-email">E-mail</Label>
                <Input
                  id="professional-email"
                  type="email"
                  value={editForm.email}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                  placeholder="profissional@dominio.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="professional-phone">Telefone</Label>
                <Input
                  id="professional-phone"
                  value={editForm.phone}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="professional-position">Cargo</Label>
                <Input
                  id="professional-position"
                  value={editForm.position}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, position: event.target.value }))
                  }
                  placeholder="Ex.: Enfermeiro"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="professional-sector">Setor</Label>
                <Input
                  id="professional-sector"
                  value={editForm.sector}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, sector: event.target.value }))
                  }
                  placeholder="Ex.: Vigilância Epidemiológica"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="professional-rg">RG</Label>
                <Input
                  id="professional-rg"
                  value={editForm.rg}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, rg: event.target.value }))
                  }
                  placeholder="00.000.000-0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="professional-cpf">CPF</Label>
                <Input
                  id="professional-cpf"
                  value={editForm.cpf}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, cpf: event.target.value }))
                  }
                  placeholder="000.000.000-00"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="professional-registration">Matrícula</Label>
                <Input
                  id="professional-registration"
                  value={editForm.registration}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, registration: event.target.value }))
                  }
                  placeholder="Código de matrícula"
                />
              </div>
            </div>

            {editStatus && (
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription className="text-red-700">
                  {editStatus.message}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleCloseEdit}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700"
                disabled={updateProfessional.isPending}
              >
                {updateProfessional.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Salvar alterações
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir profissional</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o profissional "{deleteConfirm?.name}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteProfessional.mutate()}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteProfessional.isPending}
            >
              {deleteProfessional.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
