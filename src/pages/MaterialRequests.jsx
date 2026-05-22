import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import {
  Plus,
  Package,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  Edit,
  Globe,
  Copy,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import SearchFilter from "@/components/common/SearchFilter";
import QueryError from "@/components/common/QueryError";

const STATUS_LABELS = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  entregue: "Entregue",
};

const STATUS_COLORS = {
  pendente: "bg-amber-100 text-amber-700",
  aprovado: "bg-green-100 text-green-700",
  rejeitado: "bg-red-100 text-red-700",
  entregue: "bg-blue-100 text-blue-700",
};

const EMPTY_FORM = {
  item_name: "",
  quantity: "",
  unit: "",
  reason: "",
  requested_by: "",
  status: "pendente",
  notes: "",
};

export default function MaterialRequests() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [showPublicManager, setShowPublicManager] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [savingPublic, setSavingPublic] = useState(false);

  const { data: requests = [], isError, refetch } = useQuery({
    queryKey: ["materialRequests"],
    queryFn: () => dataClient.entities.MaterialRequest.list("-created_at"),
  });

  const { data: materials = [] } = useQuery({
    queryKey: ["materials"],
    queryFn: () => dataClient.entities.Material.list(),
  });

  const publicLink = `${window.location.origin}${createPageUrl("PublicMaterialRequest")}`;

  const availableCount = materials.filter((m) => m.available_for_request).length;

  const filteredManagerMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(
      (m) =>
        String(m.name ?? "").toLowerCase().includes(q) ||
        String(m.category ?? "").toLowerCase().includes(q)
    );
  }, [materials, materialSearch]);

  const toggleMaterialPublic = async (material) => {
    await dataClient.entities.Material.update(material.id, {
      available_for_request: !material.available_for_request,
    });
    queryClient.invalidateQueries({ queryKey: ["materials"] });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(publicLink).then(() => {
      toast({ title: "Link copiado!", description: publicLink });
    });
  };

  const createMutation = useMutation({
    mutationFn: (payload) => dataClient.entities.MaterialRequest.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materialRequests"] });
      toast({ title: "Solicitação criada com sucesso." });
      closeForm();
    },
    onError: (err) => setFormError(err?.message || "Erro ao criar solicitação."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      dataClient.entities.MaterialRequest.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materialRequests"] });
      toast({ title: "Solicitação atualizada." });
      closeForm();
    },
    onError: (err) => setFormError(err?.message || "Erro ao atualizar."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => dataClient.entities.MaterialRequest.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materialRequests"] });
      toast({ title: "Solicitação excluída." });
      setDeleteTarget(null);
    },
  });

  const openNew = () => {
    setEditingRequest(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (request) => {
    setEditingRequest(request);
    setFormData({
      item_name: request.item_name ?? request.material_name ?? "",
      quantity: String(request.quantity ?? ""),
      unit: request.unit ?? "",
      reason: request.reason ?? "",
      requested_by: request.requested_by ?? "",
      status: request.status ?? "pendente",
      notes: request.notes ?? "",
    });
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingRequest(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    if (!formData.item_name.trim()) {
      setFormError("Informe o nome do item solicitado.");
      return;
    }
    if (!formData.quantity || isNaN(Number(formData.quantity))) {
      setFormError("Informe a quantidade.");
      return;
    }
    const payload = {
      item_name: formData.item_name.trim(),
      quantity: Number(formData.quantity),
      unit: formData.unit.trim() || null,
      reason: formData.reason.trim() || null,
      requested_by: formData.requested_by.trim() || null,
      status: formData.status,
      notes: formData.notes.trim() || null,
      request_date: new Date().toISOString().split("T")[0],
    };

    if (editingRequest) {
      updateMutation.mutate({ id: editingRequest.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleStatusChange = (request, newStatus) => {
    updateMutation.mutate({
      id: request.id,
      payload: { status: newStatus },
    });
  };

  const filteredRequests = requests.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        String(r.item_name ?? r.material_name ?? "").toLowerCase().includes(q) ||
        String(r.requested_by ?? "").toLowerCase().includes(q) ||
        String(r.reason ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    pendente: requests.filter((r) => r.status === "pendente").length,
    aprovado: requests.filter((r) => r.status === "aprovado").length,
    entregue: requests.filter((r) => r.status === "entregue").length,
    rejeitado: requests.filter((r) => r.status === "rejeitado").length,
  };

  const columns = [
    {
      header: "Item Solicitado",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-800">
            {row.item_name ?? row.material_name ?? "—"}
          </p>
          {row.reason && (
            <p className="text-xs text-slate-500 truncate max-w-[220px]">{row.reason}</p>
          )}
        </div>
      ),
    },
    {
      header: "Qtd",
      render: (row) =>
        `${row.quantity ?? "—"} ${row.unit ?? ""}`.trim(),
    },
    {
      header: "Solicitante",
      render: (row) => row.requested_by ?? "—",
    },
    {
      header: "Data",
      render: (row) => {
        const d = row.request_date ?? row.created_at;
        return d ? format(new Date(d), "dd/MM/yyyy") : "—";
      },
    },
    {
      header: "Status",
      render: (row) => (
        <Select
          value={row.status ?? "pendente"}
          onValueChange={(val) => handleStatusChange(row, val)}
        >
          <SelectTrigger className="h-7 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="aprovado">Aprovado</SelectItem>
            <SelectItem value="entregue">Entregue</SelectItem>
            <SelectItem value="rejeitado">Rejeitado</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      header: "",
      render: (row) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => openEdit(row)}
          >
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
            onClick={() => setDeleteTarget(row)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {isError && (
        <QueryError message="Erro ao carregar solicitações." onRetry={refetch} />
      )}

      <PageHeader
        title="Solicitações de Material"
        subtitle="Gerencie pedidos de materiais do almoxarifado"
        onActionClick={openNew}
        actionLabel="Nova Solicitação"
      />

      {/* Formulário Público */}
      <Card className="border-indigo-200 bg-indigo-50/50">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                <Globe className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">Formulário Público para GVEs</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {availableCount > 0
                    ? `${availableCount} material(is) disponível(is) para solicitação`
                    : "Nenhum material configurado — clique em Configurar"}
                </p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => setShowPublicManager(true)}>
                <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                Configurar Materiais
              </Button>
              <Button
                size="sm"
                onClick={copyLink}
                disabled={availableCount === 0}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copiar Link
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-amber-600">{counts.pendente}</span>
              <Clock className="h-8 w-8 text-amber-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Aprovadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-green-600">{counts.aprovado}</span>
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Entregues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-blue-600">{counts.entregue}</span>
              <Package className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Rejeitadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-red-600">{counts.rejeitado}</span>
              <XCircle className="h-8 w-8 text-red-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <SearchFilter
          value={search}
          onChange={setSearch}
          placeholder="Buscar por item, solicitante..."
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="aprovado">Aprovado</SelectItem>
            <SelectItem value="entregue">Entregue</SelectItem>
            <SelectItem value="rejeitado">Rejeitado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={filteredRequests}
            emptyMessage="Nenhuma solicitação encontrada"
          />
        </CardContent>
      </Card>

      {/* Dialog: Configurar materiais públicos */}
      <Dialog open={showPublicManager} onOpenChange={setShowPublicManager}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-indigo-600" />
              Materiais disponíveis para GVEs
            </DialogTitle>
            <p className="text-sm text-slate-500">
              Marque os materiais que os GVEs poderão solicitar pelo link público.
            </p>
          </DialogHeader>

          <div className="my-2">
            <Input
              placeholder="Buscar material..."
              value={materialSearch}
              onChange={(e) => setMaterialSearch(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 border rounded-lg">
            {filteredManagerMaterials.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Nenhum material encontrado</p>
            ) : (
              filteredManagerMaterials.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <Checkbox
                    checked={!!m.available_for_request}
                    onCheckedChange={() => toggleMaterialPublic(m)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{m.name}</p>
                    <p className="text-xs text-slate-400">
                      {m.category || "Sem categoria"} · {m.unit || "—"}
                    </p>
                  </div>
                  {m.available_for_request && (
                    <span className="text-xs text-indigo-600 font-semibold shrink-0">Ativo</span>
                  )}
                </label>
              ))
            )}
          </div>

          <div className="pt-3 flex items-center justify-between gap-2">
            <p className="text-xs text-slate-400">
              {availableCount} material(is) ativo(s)
            </p>
            <Button
              onClick={copyLink}
              disabled={availableCount === 0}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copiar Link para GVEs
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingRequest ? "Editar Solicitação" : "Nova Solicitação de Material"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Item Solicitado *</Label>
                <Input
                  value={formData.item_name}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, item_name: e.target.value }))
                  }
                  placeholder="Nome do material ou item"
                  list="material-suggestions"
                />
                <datalist id="material-suggestions">
                  {materials.map((m) => (
                    <option key={m.id} value={m.name ?? ""} />
                  ))}
                </datalist>
              </div>

              <div>
                <Label>Quantidade *</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, quantity: e.target.value }))
                  }
                  placeholder="Ex: 10"
                />
              </div>

              <div>
                <Label>Unidade</Label>
                <Input
                  value={formData.unit}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, unit: e.target.value }))
                  }
                  placeholder="Ex: caixa, unid, kg"
                />
              </div>

              <div className="col-span-2">
                <Label>Solicitante</Label>
                <Input
                  value={formData.requested_by}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, requested_by: e.target.value }))
                  }
                  placeholder="Nome do responsável pela solicitação"
                />
              </div>

              <div className="col-span-2">
                <Label>Motivo / Justificativa</Label>
                <Textarea
                  value={formData.reason}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, reason: e.target.value }))
                  }
                  placeholder="Descreva o motivo da solicitação"
                  rows={2}
                />
              </div>

              {editingRequest && (
                <div className="col-span-2">
                  <Label>Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(v) => setFormData((p) => ({ ...p, status: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="aprovado">Aprovado</SelectItem>
                      <SelectItem value="entregue">Entregue</SelectItem>
                      <SelectItem value="rejeitado">Rejeitado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="col-span-2">
                <Label>Observações</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, notes: e.target.value }))
                  }
                  placeholder="Informações adicionais"
                  rows={2}
                />
              </div>
            </div>

            {formError && (
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription className="text-red-700">{formError}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeForm}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingRequest ? "Salvar" : "Criar Solicitação"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir solicitação?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a solicitação de{" "}
              <strong>
                {deleteTarget?.item_name ?? deleteTarget?.material_name ?? "item"}
              </strong>
              ? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteMutation.mutate(deleteTarget.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
