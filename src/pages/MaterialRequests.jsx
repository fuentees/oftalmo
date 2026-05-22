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
  AlertTriangle,
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
import SearchFilter from "@/components/common/SearchFilter";
import QueryError from "@/components/common/QueryError";

const STATUS_COLORS = {
  pendente: "border-amber-200 bg-amber-50/30",
  aprovado: "border-green-200 bg-green-50/30",
  rejeitado: "border-red-200 bg-red-50/30",
  entregue: "border-blue-200 bg-blue-50/30",
};

const STATUS_BADGE = {
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
  gves_name: "",
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

  const { data: requests = [], isError, refetch } = useQuery({
    queryKey: ["materialRequests"],
    queryFn: () => dataClient.entities.MaterialRequest.list("-created_at"),
  });

  const { data: materials = [] } = useQuery({
    queryKey: ["materials"],
    queryFn: () => dataClient.entities.Material.list(),
  });

  // ── Link público ─────────────────────────────────────────────────────────
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

  // ── Agrupamento de pedidos ────────────────────────────────────────────────
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          String(r.item_name ?? "").toLowerCase().includes(q) ||
          String(r.gves_name ?? "").toLowerCase().includes(q) ||
          String(r.requested_by ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [requests, search, statusFilter]);

  const groupedOrders = useMemo(() => {
    const map = new Map();
    filteredRequests.forEach((r) => {
      const key = r.request_group_id ?? `single_${r.id}`;
      if (!map.has(key)) {
        map.set(key, {
          groupId: key,
          isGroup: !!r.request_group_id,
          gves_name: r.gves_name ?? null,
          requested_by: r.requested_by ?? null,
          date: r.request_date ?? r.created_at,
          items: [],
        });
      }
      map.get(key).items.push(r);
    });
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.date ?? 0) - new Date(a.date ?? 0)
    );
  }, [filteredRequests]);

  const counts = useMemo(() => ({
    pendente: requests.filter((r) => r.status === "pendente").length,
    aprovado: requests.filter((r) => r.status === "aprovado").length,
    entregue: requests.filter((r) => r.status === "entregue").length,
    rejeitado: requests.filter((r) => r.status === "rejeitado").length,
  }), [requests]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const groupStatusMutation = useMutation({
    mutationFn: async ({ groupItems, newStatus, currentMaterials }) => {
      // 1. Atualiza status de todos os itens do pedido
      for (const item of groupItems) {
        await dataClient.entities.MaterialRequest.update(item.id, { status: newStatus });
      }

      // 2. Baixa de estoque ao aprovar (só se ainda não estava aprovado/entregue)
      if (newStatus === "aprovado") {
        for (const item of groupItems) {
          const alreadyDeducted =
            item.status === "aprovado" || item.status === "entregue";
          if (alreadyDeducted) continue;

          const material = currentMaterials.find(
            (m) =>
              String(m.name ?? "").toLowerCase().trim() ===
              String(item.item_name ?? "").toLowerCase().trim()
          );
          if (!material) continue;

          const qty = Number(item.quantity ?? 0);
          const newStock = Math.max(
            0,
            Number(material.current_stock ?? 0) - qty
          );

          await dataClient.entities.Material.update(material.id, {
            current_stock: newStock,
          });

          await dataClient.entities.StockMovement.create({
            material_name: material.name,
            type: "saida",
            quantity: qty,
            unit: item.unit ?? material.unit ?? null,
            responsible: item.gves_name ?? item.requested_by ?? "Solicitação GVE",
            notes: `Pedido aprovado — ${item.gves_name ?? item.requested_by ?? ""}`.trim(),
            date: new Date().toISOString().split("T")[0],
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materialRequests"] });
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      queryClient.invalidateQueries({ queryKey: ["stockMovements"] });
      toast({ title: "Pedido atualizado." });
    },
    onError: (err) => {
      toast({
        title: "Erro ao atualizar pedido.",
        description: err?.message,
        variant: "destructive",
      });
    },
  });

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
      toast({ title: "Item excluído." });
      setDeleteTarget(null);
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditingRequest(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (request) => {
    setEditingRequest(request);
    setFormData({
      item_name: request.item_name ?? "",
      quantity: String(request.quantity ?? ""),
      unit: request.unit ?? "",
      reason: request.reason ?? "",
      gves_name: request.gves_name ?? "",
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
      setFormError("Informe o nome do item.");
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
      gves_name: formData.gves_name.trim() || null,
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

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <SearchFilter
          value={search}
          onChange={setSearch}
          placeholder="Buscar por item, GVE, solicitante..."
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

      {/* Lista de pedidos agrupados */}
      <div className="space-y-4">
        {groupedOrders.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center text-slate-400">
              <Package className="h-12 w-12 mx-auto mb-3 text-slate-200" />
              <p>Nenhuma solicitação encontrada</p>
            </CardContent>
          </Card>
        ) : (
          groupedOrders.map((order) => {
            const groupStatus = order.items[0]?.status ?? "pendente";
            const cardClass = STATUS_COLORS[groupStatus] ?? "border-slate-200";
            return (
              <Card key={order.groupId} className={`border-l-4 ${cardClass}`}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 truncate">
                        {order.gves_name ?? order.requested_by ?? "Solicitação interna"}
                      </p>
                      {order.gves_name && order.requested_by && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          Responsável: {order.requested_by}
                        </p>
                      )}
                      <p className="text-xs text-slate-400 mt-0.5">
                        {order.date
                          ? format(new Date(order.date), "dd/MM/yyyy")
                          : "—"}{" "}
                        ·{" "}
                        <span className="font-medium">{order.items.length}</span>{" "}
                        {order.items.length === 1 ? "item" : "itens"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={STATUS_BADGE[groupStatus] ?? ""}>
                        {groupStatus.charAt(0).toUpperCase() + groupStatus.slice(1)}
                      </Badge>
                      <Select
                        value={groupStatus}
                        onValueChange={(val) =>
                          groupStatusMutation.mutate({
                            groupItems: order.items,
                            newStatus: val,
                            currentMaterials: materials,
                          })
                        }
                        disabled={groupStatusMutation.isPending}
                      >
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="aprovado">✓ Aprovar</SelectItem>
                          <SelectItem value="entregue">Entregue</SelectItem>
                          <SelectItem value="rejeitado">Rejeitar</SelectItem>
                        </SelectContent>
                      </Select>
                      {!order.isGroup && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => openEdit(order.items[0])}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => setDeleteTarget(order.items[0])}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="rounded-lg border border-slate-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            Material
                          </th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">
                            Quantidade
                          </th>
                          {order.isGroup && <th className="w-10" />}
                        </tr>
                      </thead>
                      <tbody>
                        {order.items.map((item, i) => (
                          <tr
                            key={item.id}
                            className={
                              i % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                            }
                          >
                            <td className="py-2.5 px-3 font-medium text-slate-800">
                              {item.item_name}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-600 tabular-nums">
                              {item.quantity} {item.unit ?? ""}
                            </td>
                            {order.isGroup && (
                              <td className="py-2 px-2 text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                                  onClick={() => setDeleteTarget(item)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {(order.items[0]?.reason || order.items[0]?.notes) && (
                    <div className="mt-2 text-xs text-slate-500 space-y-0.5 pl-1">
                      {order.items[0].reason && (
                        <p><span className="font-medium">Motivo:</span> {order.items[0].reason}</p>
                      )}
                      {order.items[0].notes && (
                        <p className="text-slate-400">{order.items[0].notes}</p>
                      )}
                    </div>
                  )}

                  {groupStatus === "aprovado" && (
                    <p className="mt-2 text-xs text-green-600 font-medium flex items-center gap-1 pl-1">
                      <CheckCircle className="h-3 w-3" />
                      Baixa de estoque realizada automaticamente
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

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
            <p className="text-xs text-slate-400">{availableCount} material(is) ativo(s)</p>
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

      {/* Dialog: Formulário manual */}
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
                  onChange={(e) => setFormData((p) => ({ ...p, item_name: e.target.value }))}
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
                  onChange={(e) => setFormData((p) => ({ ...p, quantity: e.target.value }))}
                  placeholder="Ex: 10"
                />
              </div>

              <div>
                <Label>Unidade</Label>
                <Input
                  value={formData.unit}
                  onChange={(e) => setFormData((p) => ({ ...p, unit: e.target.value }))}
                  placeholder="Ex: caixa, unid, kg"
                />
              </div>

              <div>
                <Label>GVES / Município</Label>
                <Input
                  value={formData.gves_name}
                  onChange={(e) => setFormData((p) => ({ ...p, gves_name: e.target.value }))}
                  placeholder="Nome do GVE ou município"
                />
              </div>

              <div>
                <Label>Responsável</Label>
                <Input
                  value={formData.requested_by}
                  onChange={(e) => setFormData((p) => ({ ...p, requested_by: e.target.value }))}
                  placeholder="Nome do responsável"
                />
              </div>

              <div className="col-span-2">
                <Label>Motivo / Justificativa</Label>
                <Textarea
                  value={formData.reason}
                  onChange={(e) => setFormData((p) => ({ ...p, reason: e.target.value }))}
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
                  onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
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

      {/* AlertDialog: Excluir item */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir item?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir{" "}
              <strong>{deleteTarget?.item_name ?? "este item"}</strong>?
              Esta ação não pode ser desfeita.
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
