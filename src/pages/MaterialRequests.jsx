import React, { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { supabase } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { downloadRemessaPdf, previewRemessaPdf } from "@/lib/remessaPdf";
import {
  Plus, Package, CheckCircle, CheckCircle2, XCircle, Clock,
  Trash2, Edit, Globe, Copy, Settings2, Loader2, FileText,
  Printer, X, Truck, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/common/PageHeader";
import SearchFilter from "@/components/common/SearchFilter";
import QueryError from "@/components/common/QueryError";

const GVE_COLORS = [
  "#3b82f6","#8b5cf6","#10b981","#f97316","#ec4899",
  "#06b6d4","#f59e0b","#f43f5e","#14b8a6","#6366f1",
];
function getGveColor(name) {
  if (!name) return GVE_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return GVE_COLORS[Math.abs(h) % GVE_COLORS.length];
}

const STATUS_BADGE = {
  pendente:  "bg-amber-100 text-amber-700 border-amber-200",
  aprovado:  "bg-green-100 text-green-700 border-green-200",
  rejeitado: "bg-red-100   text-red-700   border-red-200",
  entregue:  "bg-blue-100  text-blue-700  border-blue-200",
};
const STATUS_LABEL = { pendente:"Pendente", aprovado:"Aprovado", rejeitado:"Rejeitado", entregue:"Entregue" };

// Classes estáticas para os cards de KPI (Tailwind não aceita interpolação dinâmica)
const KPI_STYLES = {
  pendente: {
    border: "border-amber-200", bg: "bg-amber-50/50",
    activeBorder: "border-amber-400", activeBg: "bg-amber-50", activeRing: "ring-2 ring-amber-200",
    hover: "hover:border-amber-300", label: "text-amber-500", count: "text-amber-700", icon: "text-amber-300",
  },
  aprovado: {
    border: "border-green-200", bg: "bg-green-50/50",
    activeBorder: "border-green-400", activeBg: "bg-green-50", activeRing: "ring-2 ring-green-200",
    hover: "hover:border-green-300", label: "text-green-500", count: "text-green-700", icon: "text-green-300",
  },
  entregue: {
    border: "border-blue-200", bg: "bg-blue-50/50",
    activeBorder: "border-blue-400", activeBg: "bg-blue-50", activeRing: "ring-2 ring-blue-200",
    hover: "hover:border-blue-300", label: "text-blue-500", count: "text-blue-700", icon: "text-blue-300",
  },
  rejeitado: {
    border: "border-red-200", bg: "bg-red-50/50",
    activeBorder: "border-red-400", activeBg: "bg-red-50", activeRing: "ring-2 ring-red-200",
    hover: "hover:border-red-300", label: "text-red-500", count: "text-red-700", icon: "text-red-300",
  },
};

const EMPTY_FORM = {
  item_name:"", quantity:"", unit:"", reason:"",
  gves_name:"", requested_by:"", status:"pendente", notes:"",
};

export default function MaterialRequests() {
  const queryClient = useQueryClient();

  // ── filters ─────────────────────────────────────────────────────────────────
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // ── request form ────────────────────────────────────────────────────────────
  const [showForm, setShowForm]           = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);
  const [formData, setFormData]           = useState(EMPTY_FORM);
  const [formError, setFormError]         = useState(null);

  // ── group-level edit ────────────────────────────────────────────────────────
  const [editingGroup, setEditingGroup]     = useState(null);
  const [groupEditData, setGroupEditData]   = useState({ gves_name:"", requested_by:"" });

  // ── item-level edit ─────────────────────────────────────────────────────────
  const [editingItem, setEditingItem]   = useState(null);
  const [editItemData, setEditItemData] = useState({ quantity:"", unit:"" });

  // ── delete ──────────────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState(null);

  // ── public manager ───────────────────────────────────────────────────────────
  const [showPublicManager, setShowPublicManager] = useState(false);
  const [materialSearch, setMaterialSearch]       = useState("");

  // ── remessa flow ─────────────────────────────────────────────────────────────
  const [showRemessaConfirm, setShowRemessaConfirm] = useState(false);
  const [showRemessaDialog, setShowRemessaDialog]   = useState(false);
  const [remessaForm, setRemessaForm]               = useState(null);
  const [savingRemessa, setSavingRemessa]           = useState(false);
  const [remessaError, setRemessaError]             = useState(null);
  const pendingApprovalGroupRef = useRef(/** @type {any} */(null));

  // ── queries ──────────────────────────────────────────────────────────────────
  const { data: requests = [], isError, refetch } = useQuery({
    queryKey: ["materialRequests"],
    queryFn: () => dataClient.entities.MaterialRequest.list("-created_at"),
  });
  const { data: materials = [] } = useQuery({
    queryKey: ["materials"],
    queryFn: () => dataClient.entities.Material.list(),
  });

  const publicLink    = `${window.location.origin}${createPageUrl("PublicMaterialRequest")}`;
  const availableCount = materials.filter((m) => m.available_for_request).length;

  const filteredManagerMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(
      (m) => String(m.name??"").toLowerCase().includes(q) || String(m.category??"").toLowerCase().includes(q)
    );
  }, [materials, materialSearch]);

  // ── derived data ─────────────────────────────────────────────────────────────
  const filteredRequests = useMemo(() =>
    requests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          String(r.item_name??"").toLowerCase().includes(q) ||
          String(r.gves_name??"").toLowerCase().includes(q) ||
          String(r.requested_by??"").toLowerCase().includes(q)
        );
      }
      return true;
    }),
    [requests, search, statusFilter]
  );

  const groupedOrders = useMemo(() => {
    const map = new Map();
    filteredRequests.forEach((r) => {
      const key = r.request_group_id ?? `single_${r.id}`;
      if (!map.has(key)) {
        map.set(key, {
          groupId: key, isGroup: !!r.request_group_id,
          gves_name: r.gves_name ?? null, requested_by: r.requested_by ?? null,
          date: r.request_date ?? r.created_at, items: [],
        });
      }
      map.get(key).items.push(r);
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.date??0) - new Date(a.date??0));
  }, [filteredRequests]);

  const counts = useMemo(() => ({
    pendente:  requests.filter((r) => r.status === "pendente").length,
    aprovado:  requests.filter((r) => r.status === "aprovado").length,
    entregue:  requests.filter((r) => r.status === "entregue").length,
    rejeitado: requests.filter((r) => r.status === "rejeitado").length,
  }), [requests]);

  // ── mutations ─────────────────────────────────────────────────────────────────
  const groupStatusMutation = useMutation({
    mutationFn: async ({ groupItems, newStatus, currentMaterials }) => {
      for (const item of groupItems) {
        await dataClient.entities.MaterialRequest.update(item.id, { status: newStatus });
      }
      if (newStatus === "aprovado") {
        for (const item of groupItems) {
          if (item.status === "aprovado" || item.status === "entregue") continue;
          const material = currentMaterials.find(
            (m) => String(m.name??"").toLowerCase().trim() === String(item.item_name??"").toLowerCase().trim()
          );
          if (!material) continue;
          const qty = Number(item.quantity ?? 0);
          await dataClient.entities.Material.update(material.id, {
            current_stock: Math.max(0, Number(material.current_stock??0) - qty),
          });
          await dataClient.entities.StockMovement.create({
            material_name: material.name, type: "saida", quantity: qty,
            responsible: item.gves_name ?? item.requested_by ?? "Solicitação GVE",
            notes: `Pedido aprovado — ${item.gves_name ?? item.requested_by ?? ""}`.trim(),
            date: new Date().toISOString().split("T")[0],
          });
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["materialRequests"] });
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      queryClient.invalidateQueries({ queryKey: ["stockMovements"] });
      toast({ title: `Pedido ${STATUS_LABEL[variables.newStatus]?.toLowerCase() ?? "atualizado"}.` });
      if (variables.newStatus === "aprovado" && pendingApprovalGroupRef.current) {
        const order = pendingApprovalGroupRef.current;
        setRemessaForm(buildRemessaFromGroup(order));
        setRemessaError(null);
        setShowRemessaConfirm(true);
        pendingApprovalGroupRef.current = null;
      }
    },
    onError: (err) => toast({ title: "Erro ao atualizar.", description: err?.message, variant: "destructive" }),
  });

  const groupEditMutation = useMutation({
    mutationFn: async ({ groupItems, gves_name, requested_by }) => {
      for (const item of groupItems) {
        await dataClient.entities.MaterialRequest.update(item.id, { gves_name, requested_by });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materialRequests"] });
      toast({ title: "Solicitação atualizada." });
      setEditingGroup(null);
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload) => dataClient.entities.MaterialRequest.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materialRequests"] });
      toast({ title: "Solicitação criada." });
      closeForm();
    },
    onError: (err) => setFormError(err?.message || "Erro ao criar."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => dataClient.entities.MaterialRequest.update(id, payload),
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

  // ── helpers ───────────────────────────────────────────────────────────────────
  const buildRemessaFromGroup = (order) => ({
    data: format(new Date(), "yyyy-MM-dd"),
    para_destino: order.gves_name || order.requested_by || "",
    para_gve: "",
    responsavel: "",
    responsavel_cargo: "Favor retornar à oftalmologia sanitária uma via de recebimento assinada",
    items: order.items.map((item, i) => ({
      ordem: i + 1,
      interessado: "A/C",
      assunto: `${item.quantity}${item.unit ? " " + item.unit : ""} de ${item.item_name}`,
    })),
  });

  const handleApprove = (order) => {
    pendingApprovalGroupRef.current = order;
    groupStatusMutation.mutate({ groupItems: order.items, newStatus: "aprovado", currentMaterials: materials });
  };

  const handleChangeStatus = (order, newStatus) => {
    groupStatusMutation.mutate({ groupItems: order.items, newStatus, currentMaterials: materials });
  };

  const toggleMaterialPublic = async (material) => {
    await dataClient.entities.Material.update(material.id, { available_for_request: !material.available_for_request });
    queryClient.invalidateQueries({ queryKey: ["materials"] });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(publicLink).then(() => toast({ title: "Link copiado!", description: publicLink }));
  };

  const openNew = () => { setEditingRequest(null); setFormData(EMPTY_FORM); setFormError(null); setShowForm(true); };
  const openEdit = (request) => {
    setEditingRequest(request);
    setFormData({
      item_name: request.item_name??"", quantity: String(request.quantity??""),
      unit: request.unit??"", reason: request.reason??"",
      gves_name: request.gves_name??"", requested_by: request.requested_by??"",
      status: request.status??"pendente", notes: request.notes??"",
    });
    setFormError(null);
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingRequest(null); setFormData(EMPTY_FORM); setFormError(null); };

  const openGroupEdit = (order) => {
    setEditingGroup(order);
    setGroupEditData({ gves_name: order.gves_name??"", requested_by: order.requested_by??"" });
  };
  const openEditItem = (item) => { setEditingItem(item); setEditItemData({ quantity: String(item.quantity??""), unit: item.unit??"" }); };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    if (!formData.item_name.trim()) { setFormError("Informe o nome do item."); return; }
    if (!formData.quantity || isNaN(Number(formData.quantity))) { setFormError("Informe a quantidade."); return; }
    const payload = {
      item_name: formData.item_name.trim(), quantity: Number(formData.quantity),
      unit: formData.unit.trim()||null, reason: formData.reason.trim()||null,
      gves_name: formData.gves_name.trim()||null, requested_by: formData.requested_by.trim()||null,
      status: formData.status, notes: formData.notes.trim()||null,
      request_date: new Date().toISOString().split("T")[0],
    };
    if (editingRequest) updateMutation.mutate({ id: editingRequest.id, payload });
    else createMutation.mutate(payload);
  };

  // ── remessa save ──────────────────────────────────────────────────────────────
  const handleSaveRemessa = async () => {
    if (!remessaForm?.para_destino?.trim()) { setRemessaError("Informe o destino (PARA)."); return; }
    setSavingRemessa(true);
    setRemessaError(null);
    try {
      const ano = new Date(remessaForm.data + "T00:00:00").getFullYear();
      const { data: numData } = await supabase.rpc("next_remessa_number", { p_ano: ano });
      const numero = numData ?? 1;
      const payload = {
        numero, ano, data: remessaForm.data,
        para_destino: remessaForm.para_destino.trim(),
        para_gve: (remessaForm.para_gve||"").trim(),
        interessado: "", responsavel: (remessaForm.responsavel||"").trim(),
        responsavel_cargo: (remessaForm.responsavel_cargo||"").trim(),
        observacoes: "", items: remessaForm.items.filter((it) => it.assunto?.trim()),
        status: "emitida",
      };
      await dataClient.entities.Remessa.create(payload);
      downloadRemessaPdf(payload);
      setShowRemessaDialog(false);
      setRemessaForm(null);
      toast({ title: "Remessa criada", description: `Nº ${String(numero).padStart(2,"0")}/${ano} — PDF gerado.` });
    } catch (err) {
      setRemessaError(err?.message || "Erro ao salvar remessa.");
    } finally {
      setSavingRemessa(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {isError && <QueryError message="Erro ao carregar solicitações." onRetry={refetch} />}

      <PageHeader
        title="Solicitações de Material"
        subtitle="Gerencie pedidos de materiais do almoxarifado"
        onActionClick={openNew}
        actionLabel="Nova Solicitação"
      />

      {/* Link público */}
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
                <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Configurar Materiais
              </Button>
              <Button size="sm" onClick={copyLink} disabled={availableCount === 0}
                className="text-white" style={{ background: "hsl(var(--primary))" }}>
                <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar Link
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { label:"Pendentes",  key:"pendente",  Icon:Clock },
          { label:"Aprovadas",  key:"aprovado",  Icon:CheckCircle },
          { label:"Entregues",  key:"entregue",  Icon:Package },
          { label:"Rejeitadas", key:"rejeitado", Icon:XCircle },
        ]).map(({ label, key, Icon }) => {
          const s = KPI_STYLES[key];
          const active = statusFilter === key;
          return (
            <div key={key}
              role="button" tabIndex={0}
              onClick={() => setStatusFilter(f => f === key ? "all" : key)}
              onKeyDown={(e) => (e.key==="Enter"||e.key===" ") && setStatusFilter(f => f===key?"all":key)}
              className={`rounded-xl border p-4 flex items-center justify-between cursor-pointer transition-all
                ${active ? `${s.activeBorder} ${s.activeBg} ${s.activeRing}` : `${s.border} ${s.bg} ${s.hover}`}`}
            >
              <div>
                <p className={`text-xs font-medium ${s.label} uppercase tracking-wide`}>{label}</p>
                <p className={`text-2xl font-black ${s.count} leading-none mt-0.5`}>{counts[key]}</p>
              </div>
              <Icon className={`h-7 w-7 ${s.icon}`} />
            </div>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <SearchFilter value={search} onChange={setSearch} placeholder="Buscar por item, GVE, solicitante..." />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="aprovado">Aprovado</SelectItem>
            <SelectItem value="entregue">Entregue</SelectItem>
            <SelectItem value="rejeitado">Rejeitado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista de pedidos */}
      <div className="space-y-4">
        {groupedOrders.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center text-slate-400">
              <Package className="h-12 w-12 mx-auto mb-3 text-slate-200" />
              <p className="font-medium">Nenhuma solicitação encontrada</p>
              {(search || statusFilter !== "all") && (
                <Button variant="link" className="mt-1" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
                  Limpar filtros
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          groupedOrders.map((order) => {
            const groupStatus = order.items[0]?.status ?? "pendente";
            const gveColor    = getGveColor(order.gves_name ?? order.requested_by ?? "");
            const isPending   = groupStatus === "pendente";
            const isApproved  = groupStatus === "aprovado";
            const isLoading   = groupStatusMutation.isPending;

            return (
              <Card key={order.groupId}
                className="border-l-4 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                style={{ borderLeftColor: gveColor }}>

                {/* ── Cabeçalho ── */}
                <CardHeader className="pb-2 pt-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: gveColor }} />
                        {order.gves_name ?? order.requested_by ?? "Solicitação interna"}
                      </p>
                      {order.gves_name && order.requested_by && (
                        <p className="text-xs text-slate-500 mt-0.5 ml-5">Responsável: {order.requested_by}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-0.5 ml-5">
                        {order.date ? format(new Date(order.date), "dd/MM/yyyy") : "—"}
                        {" · "}
                        <span className="font-medium">{order.items.length}</span> {order.items.length === 1 ? "item" : "itens"}
                      </p>
                    </div>
                    <Badge className={`${STATUS_BADGE[groupStatus] ?? ""} border shrink-0 self-start`}>
                      {STATUS_LABEL[groupStatus] ?? groupStatus}
                    </Badge>
                  </div>
                </CardHeader>

                {/* ── Tabela de itens ── */}
                <CardContent className="pt-0 pb-3">
                  <div className="rounded-lg border border-slate-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Material</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Qtd</th>
                          <th className="w-16" />
                        </tr>
                      </thead>
                      <tbody>
                        {order.items.map((item, i) => (
                          <tr key={item.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                            <td className="py-2.5 px-3 font-medium text-slate-800">{item.item_name}</td>
                            <td className="py-2.5 px-3 text-right text-slate-600 tabular-nums">{item.quantity} {item.unit ?? ""}</td>
                            <td className="py-2 px-2 text-right">
                              <div className="flex gap-1 justify-end">
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400 hover:text-blue-600"
                                  onClick={() => openEditItem(item)}>
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-300 hover:text-red-600"
                                  onClick={() => setDeleteTarget(item)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {(order.items[0]?.reason || order.items[0]?.notes) && (
                    <div className="mt-2 text-xs text-slate-500 pl-1 space-y-0.5">
                      {order.items[0].reason && <p><span className="font-medium">Motivo:</span> {order.items[0].reason}</p>}
                      {order.items[0].notes  && <p className="text-slate-400">{order.items[0].notes}</p>}
                    </div>
                  )}

                  {/* ── Barra de ações ── */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    {/* Editar grupo */}
                    <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs"
                      onClick={() => openGroupEdit(order)}>
                      <Edit className="h-3.5 w-3.5" /> Editar
                    </Button>

                    {/* Ações por status */}
                    {isPending && (
                      <>
                        <Button size="sm" disabled={isLoading}
                          className="gap-1.5 h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => handleApprove(order)}>
                          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Aprovar
                        </Button>
                        <Button size="sm" variant="outline" disabled={isLoading}
                          className="gap-1.5 h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => handleChangeStatus(order, "rejeitado")}>
                          <XCircle className="h-3.5 w-3.5" /> Rejeitar
                        </Button>
                      </>
                    )}

                    {isApproved && (
                      <>
                        <Button size="sm" disabled={isLoading}
                          className="gap-1.5 h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={() => handleChangeStatus(order, "entregue")}>
                          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
                          Marcar Entregue
                        </Button>
                        <Button size="sm" variant="outline"
                          className="gap-1.5 h-8 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                          onClick={() => { setRemessaForm(buildRemessaFromGroup(order)); setRemessaError(null); setShowRemessaDialog(true); }}>
                          <FileText className="h-3.5 w-3.5" /> Gerar Remessa
                        </Button>
                      </>
                    )}

                    {groupStatus === "rejeitado" && (
                      <Button size="sm" variant="outline" disabled={isLoading}
                        className="gap-1.5 h-8 text-xs text-amber-600 border-amber-200 hover:bg-amber-50"
                        onClick={() => handleChangeStatus(order, "pendente")}>
                        Reabrir
                      </Button>
                    )}

                    {groupStatus === "entregue" && (
                      <p className="text-xs text-blue-600 font-medium flex items-center gap-1 ml-auto">
                        <CheckCircle className="h-3.5 w-3.5" /> Entregue com sucesso
                      </p>
                    )}
                    {isApproved && (
                      <p className="text-xs text-green-600 font-medium flex items-center gap-1 ml-auto">
                        <CheckCircle className="h-3.5 w-3.5" /> Baixa de estoque realizada
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* ── Dialog: Configurar materiais públicos ── */}
      <Dialog open={showPublicManager} onOpenChange={setShowPublicManager}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-indigo-600" />
              Materiais disponíveis para GVEs
            </DialogTitle>
            <p className="text-sm text-slate-500">Marque os materiais que os GVEs poderão solicitar.</p>
          </DialogHeader>
          <div className="my-2">
            <Input placeholder="Buscar material..." value={materialSearch}
              onChange={(e) => setMaterialSearch(e.target.value)} className="h-9" />
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 border rounded-lg">
            {filteredManagerMaterials.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Nenhum material encontrado</p>
            ) : (
              filteredManagerMaterials.map((m) => (
                <label key={m.id}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors">
                  <Checkbox checked={!!m.available_for_request} onCheckedChange={() => toggleMaterialPublic(m)} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{m.name}</p>
                    <p className="text-xs text-slate-400">{m.category||"Sem categoria"} · {m.unit||"—"}</p>
                  </div>
                  {m.available_for_request && <span className="text-xs text-indigo-600 font-semibold shrink-0">Ativo</span>}
                </label>
              ))
            )}
          </div>
          <div className="pt-3 flex items-center justify-between gap-2">
            <p className="text-xs text-slate-400">{availableCount} material(is) ativo(s)</p>
            <Button onClick={copyLink} disabled={availableCount === 0}
              className="text-white" style={{ background: "hsl(var(--primary))" }}>
              <Copy className="h-4 w-4 mr-2" /> Copiar Link
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Editar grupo ── */}
      <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Solicitação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>GVE / Município</Label>
              <Input className="mt-1" value={groupEditData.gves_name}
                onChange={(e) => setGroupEditData((p) => ({ ...p, gves_name: e.target.value }))}
                placeholder="Nome do GVE ou município" />
            </div>
            <div>
              <Label>Responsável</Label>
              <Input className="mt-1" value={groupEditData.requested_by}
                onChange={(e) => setGroupEditData((p) => ({ ...p, requested_by: e.target.value }))}
                placeholder="Nome do responsável" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setEditingGroup(null)}>Cancelar</Button>
            <Button disabled={groupEditMutation.isPending}
              className="text-white" style={{ background: "hsl(var(--primary))" }}
              onClick={() => groupEditMutation.mutate({
                groupItems: editingGroup.items,
                gves_name: groupEditData.gves_name.trim() || null,
                requested_by: groupEditData.requested_by.trim() || null,
              })}>
              {groupEditMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Editar item ── */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Editar item</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-slate-500">Material</Label>
              <p className="font-semibold text-slate-800 mt-0.5">{editingItem?.item_name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantidade *</Label>
                <Input type="number" min="1" className="mt-1" value={editItemData.quantity}
                  onChange={(e) => setEditItemData((p) => ({ ...p, quantity: e.target.value }))} />
              </div>
              <div>
                <Label>Unidade</Label>
                <Input className="mt-1" value={editItemData.unit}
                  onChange={(e) => setEditItemData((p) => ({ ...p, unit: e.target.value }))}
                  placeholder="unid, kg, cx..." />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setEditingItem(null)}>Cancelar</Button>
            <Button className="text-white" style={{ background: "hsl(var(--primary))" }}
              disabled={updateMutation.isPending}
              onClick={() => {
                if (!editItemData.quantity || isNaN(Number(editItemData.quantity))) return;
                updateMutation.mutate({ id: editingItem.id, payload: { quantity: Number(editItemData.quantity), unit: editItemData.unit.trim()||null } });
                setEditingItem(null);
              }}>
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Formulário manual ── */}
      <Dialog open={showForm} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRequest ? "Editar Solicitação" : "Nova Solicitação de Material"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Item Solicitado *</Label>
                <Input value={formData.item_name}
                  onChange={(e) => setFormData((p) => ({ ...p, item_name: e.target.value }))}
                  placeholder="Nome do material" list="material-suggestions" />
                <datalist id="material-suggestions">
                  {materials.map((m) => <option key={m.id} value={m.name??""} />)}
                </datalist>
              </div>
              <div>
                <Label>Quantidade *</Label>
                <Input type="number" min="1" value={formData.quantity}
                  onChange={(e) => setFormData((p) => ({ ...p, quantity: e.target.value }))} />
              </div>
              <div>
                <Label>Unidade</Label>
                <Input value={formData.unit}
                  onChange={(e) => setFormData((p) => ({ ...p, unit: e.target.value }))}
                  placeholder="caixa, unid, kg" />
              </div>
              <div>
                <Label>GVE / Município</Label>
                <Input value={formData.gves_name}
                  onChange={(e) => setFormData((p) => ({ ...p, gves_name: e.target.value }))}
                  placeholder="Nome do GVE" />
              </div>
              <div>
                <Label>Responsável</Label>
                <Input value={formData.requested_by}
                  onChange={(e) => setFormData((p) => ({ ...p, requested_by: e.target.value }))}
                  placeholder="Nome do responsável" />
              </div>
              <div className="col-span-2">
                <Label>Motivo / Justificativa</Label>
                <Textarea value={formData.reason}
                  onChange={(e) => setFormData((p) => ({ ...p, reason: e.target.value }))}
                  rows={2} />
              </div>
              {editingRequest && (
                <div className="col-span-2">
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData((p) => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Textarea value={formData.notes}
                  onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                  rows={2} />
              </div>
            </div>
            {formError && (
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription className="text-red-700">{formError}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeForm}>Cancelar</Button>
              <Button type="submit" className="text-white" style={{ background: "hsl(var(--primary))" }}
                disabled={createMutation.isPending || updateMutation.isPending}>
                {editingRequest ? "Salvar" : "Criar Solicitação"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Confirmar: gerar remessa após aprovação ── */}
      <AlertDialog open={showRemessaConfirm} onOpenChange={(v) => !v && setShowRemessaConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar Relação de Remessa?</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido foi aprovado e o estoque já foi baixado. Deseja emitir uma
              Relação de Remessa para formalizar o envio?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowRemessaConfirm(false)}>Não, obrigado</AlertDialogCancel>
            <AlertDialogAction style={{ background: "hsl(var(--primary))" }}
              onClick={() => { setShowRemessaConfirm(false); setShowRemessaDialog(true); }}>
              Sim, gerar remessa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Dialog: Formulário de remessa ── */}
      <Dialog open={showRemessaDialog} onOpenChange={(v) => !savingRemessa && setShowRemessaDialog(v)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Gerar Relação de Remessa
            </DialogTitle>
          </DialogHeader>
          {remessaForm && (
            <div className="space-y-5 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Data</Label>
                  <Input type="date" value={remessaForm.data}
                    onChange={(e) => setRemessaForm((f) => ({ ...f, data: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Destino (PARA) <span className="text-red-500">*</span></Label>
                  <Input value={remessaForm.para_destino}
                    onChange={(e) => setRemessaForm((f) => ({ ...f, para_destino: e.target.value }))}
                    placeholder="Ex: Conchas" />
                </div>
                <div className="space-y-1.5">
                  <Label>GVE</Label>
                  <Input value={remessaForm.para_gve}
                    onChange={(e) => setRemessaForm((f) => ({ ...f, para_gve: e.target.value }))}
                    placeholder="Ex: Botucatu" />
                </div>
                <div className="space-y-1.5">
                  <Label>Responsável</Label>
                  <Input value={remessaForm.responsavel}
                    onChange={(e) => setRemessaForm((f) => ({ ...f, responsavel: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Observação do rodapé</Label>
                <Textarea value={remessaForm.responsavel_cargo}
                  onChange={(e) => setRemessaForm((f) => ({ ...f, responsavel_cargo: e.target.value }))}
                  rows={2} className="text-sm resize-none" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Itens remetidos</Label>
                  <Button type="button" size="sm" variant="outline" className="gap-1.5 h-7 text-xs"
                    onClick={() => setRemessaForm((f) => ({ ...f, items: [...f.items, { ordem: f.items.length+1, interessado:"A/C", assunto:"" }] }))}>
                    <Plus className="h-3.5 w-3.5" /> Adicionar item
                  </Button>
                </div>
                <div className="space-y-2">
                  {remessaForm.items.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2 rounded border border-slate-200 bg-slate-50/50">
                      <span className="w-7 text-xs text-center font-bold text-slate-500 pt-1.5">{idx+1}</span>
                      <Input value={item.interessado}
                        onChange={(e) => setRemessaForm((f) => ({ ...f, items: f.items.map((it,i) => i===idx ? {...it,interessado:e.target.value} : it) }))}
                        placeholder="Interessado" className="h-8 text-sm w-32" />
                      <Input value={item.assunto}
                        onChange={(e) => setRemessaForm((f) => ({ ...f, items: f.items.map((it,i) => i===idx ? {...it,assunto:e.target.value} : it) }))}
                        placeholder="Assunto / item remetido" className="h-8 text-sm flex-1" />
                      <button type="button"
                        onClick={() => setRemessaForm((f) => ({ ...f, items: f.items.filter((_,i) => i!==idx).map((it,i) => ({...it,ordem:i+1})) }))}
                        className="mt-1 text-slate-300 hover:text-red-500 transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              {remessaError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{remessaError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button variant="outline" onClick={() => setShowRemessaDialog(false)} disabled={savingRemessa}>Cancelar</Button>
                <Button variant="outline" disabled={savingRemessa || !remessaForm?.para_destino?.trim()}
                  onClick={() => remessaForm?.para_destino?.trim() && previewRemessaPdf({ numero:0, ano: new Date(remessaForm.data+"T00:00:00").getFullYear(), ...remessaForm, items: remessaForm.items.filter(it => it.assunto?.trim()) })}>
                  <Eye className="h-4 w-4 mr-1.5" /> Visualizar
                </Button>
                <Button onClick={handleSaveRemessa} disabled={savingRemessa}
                  className="gap-2 text-white" style={{ background: "hsl(var(--primary))" }}>
                  {savingRemessa ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                  {savingRemessa ? "Salvando..." : "Salvar e Imprimir PDF"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── AlertDialog: Excluir item ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir item?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.item_name ?? "este item"}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteMutation.mutate(deleteTarget.id)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
