import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { supabase } from "@/api/supabaseClient";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { downloadRemessaPdf, previewRemessaPdf } from "@/lib/remessaPdf";
import {
  Plus,
  Printer,
  Eye,
  Trash2,
  FileText,
  MapPin,
  Loader2,
  X,
  Edit,
  Search,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PageHeader from "@/components/common/PageHeader";

const STATUS_LABELS = { emitida: "Emitida", enviada: "Enviada", recebida: "Recebida" };
const STATUS_COLORS = {
  emitida: "bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer",
  enviada: "bg-amber-100 text-amber-700 hover:bg-amber-200 cursor-pointer",
  recebida: "bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer",
};
const NEXT_STATUS = { emitida: "enviada", enviada: "recebida", recebida: "emitida" };
const STATUS_TOOLTIP = {
  emitida: "Clique para marcar como Enviada",
  enviada: "Clique para marcar como Recebida",
  recebida: "Clique para voltar para Emitida",
};

const EMPTY_ITEM = { ordem: 1, interessado: "", assunto: "" };

function ItemRow({ item, index, total, onChange, onRemove, onMove }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50/50">
      <div className="flex flex-col gap-0.5 pt-1 shrink-0">
        <button type="button" onClick={() => onMove(index, "up")} disabled={index === 0}
          className="p-0.5 rounded text-slate-400 hover:text-blue-500 disabled:opacity-20">
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor"><path d="M6 2l4 6H2z"/></svg>
        </button>
        <button type="button" onClick={() => onMove(index, "down")} disabled={index === total - 1}
          className="p-0.5 rounded text-slate-400 hover:text-blue-500 disabled:opacity-20">
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor"><path d="M6 10L2 4h8z"/></svg>
        </button>
      </div>
      <div className="w-10 shrink-0 pt-1 text-center">
        <span className="text-sm font-bold text-slate-500">{index + 1}</span>
      </div>
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Input
          value={item.interessado}
          onChange={(e) => onChange(index, "interessado", e.target.value)}
          placeholder="Interessado (ex: A/C)"
          className="h-8 text-sm"
        />
        <Input
          value={item.assunto}
          onChange={(e) => onChange(index, "assunto", e.target.value)}
          placeholder="Assunto / item remetido"
          className="h-8 text-sm sm:col-span-2"
        />
      </div>
      <button type="button" onClick={() => onRemove(index)}
        className="shrink-0 mt-1 text-slate-300 hover:text-red-500 transition-colors">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function Remessas() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingRemessa, setEditingRemessa] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [yearFilter, setYearFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");

  const [form, setForm] = useState({
    data: format(new Date(), "yyyy-MM-dd"),
    para_destino: "",
    para_gve: "",
    interessado: "",
    responsavel: "",
    responsavel_cargo: "Favor retornar à oftalmologia sanitária uma via de recebimento assinada",
    observacoes: "",
    items: [{ ...EMPTY_ITEM }],
  });

  const { data: remessas = [], isLoading } = useQuery({
    queryKey: ["remessas"],
    queryFn: () => dataClient.entities.Remessa.list("-created_at"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => dataClient.entities.Remessa.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["remessas"] });
      setDeleteTarget(null);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) =>
      dataClient.entities.Remessa.update(id, { status }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["remessas"] }),
  });

  const years = useMemo(
    () => [...new Set(remessas.map((r) => r.ano))].sort((a, b) => b - a),
    [remessas]
  );

  const filteredRemessas = useMemo(
    () =>
      remessas.filter((r) => {
        const matchYear =
          yearFilter === "all" || r.ano === Number(yearFilter);
        const q = searchFilter.trim().toLowerCase();
        const matchSearch =
          !q ||
          r.para_destino?.toLowerCase().includes(q) ||
          r.para_gve?.toLowerCase().includes(q);
        return matchYear && matchSearch;
      }),
    [remessas, yearFilter, searchFilter]
  );

  const cycleStatus = (r) => {
    updateStatusMutation.mutate({
      id: r.id,
      status: NEXT_STATUS[r.status] || "enviada",
    });
  };

  const resetForm = () => ({
    data: format(new Date(), "yyyy-MM-dd"),
    para_destino: "",
    para_gve: "",
    interessado: "",
    responsavel: "",
    responsavel_cargo: "Favor retornar à oftalmologia sanitária uma via de recebimento assinada",
    observacoes: "",
    items: [{ ...EMPTY_ITEM }],
  });

  const openNew = () => {
    setEditingRemessa(null);
    setForm(resetForm());
    setSaveError(null);
    setShowForm(true);
  };

  const openEdit = (remessa) => {
    setEditingRemessa(remessa);
    setForm({
      data: remessa.data || format(new Date(), "yyyy-MM-dd"),
      para_destino: remessa.para_destino || "",
      para_gve: remessa.para_gve || "",
      interessado: remessa.interessado || "",
      responsavel: remessa.responsavel || "",
      responsavel_cargo:
        remessa.responsavel_cargo ||
        "Favor retornar à oftalmologia sanitária uma via de recebimento assinada",
      observacoes: remessa.observacoes || "",
      items:
        Array.isArray(remessa.items) && remessa.items.length > 0
          ? remessa.items
          : [{ ...EMPTY_ITEM }],
    });
    setSaveError(null);
    setShowForm(true);
  };

  const updateItem = (idx, field, value) => {
    setForm((f) => {
      const items = f.items.map((it, i) =>
        i === idx ? { ...it, [field]: value } : it
      );
      return { ...f, items };
    });
  };

  const addItem = () => {
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        { ordem: f.items.length + 1, interessado: "", assunto: "" },
      ],
    }));
  };

  const removeItem = (idx) => {
    setForm((f) => ({
      ...f,
      items: f.items
        .filter((_, i) => i !== idx)
        .map((it, i) => ({ ...it, ordem: i + 1 })),
    }));
  };

  const moveItem = (idx, dir) => {
    setForm((f) => {
      const items = [...f.items];
      const target = dir === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= items.length) return f;
      [items[idx], items[target]] = [items[target], items[idx]];
      return { ...f, items: items.map((it, i) => ({ ...it, ordem: i + 1 })) };
    });
  };

  const handleSave = async () => {
    if (!form.para_destino.trim()) {
      setSaveError("Informe o destino (PARA).");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const filteredItems = form.items.filter((it) => it.assunto.trim());
      if (editingRemessa) {
        await dataClient.entities.Remessa.update(editingRemessa.id, {
          data: form.data,
          para_destino: form.para_destino.trim(),
          para_gve: form.para_gve.trim(),
          interessado: form.interessado.trim(),
          responsavel: form.responsavel.trim(),
          responsavel_cargo: form.responsavel_cargo.trim(),
          observacoes: form.observacoes.trim(),
          items: filteredItems,
        });
      } else {
        const ano = new Date(form.data + "T00:00:00").getFullYear();
        const { data: numData } = await supabase.rpc("next_remessa_number", {
          p_ano: ano,
        });
        const numero = numData ?? 1;
        await dataClient.entities.Remessa.create({
          numero,
          ano,
          data: form.data,
          para_destino: form.para_destino.trim(),
          para_gve: form.para_gve.trim(),
          interessado: form.interessado.trim(),
          responsavel: form.responsavel.trim(),
          responsavel_cargo: form.responsavel_cargo.trim(),
          observacoes: form.observacoes.trim(),
          items: filteredItems,
          status: "emitida",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["remessas"] });
      setShowForm(false);
      setEditingRemessa(null);
    } catch (err) {
      setSaveError(err?.message || "Erro ao salvar remessa.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relações de Remessa"
        subtitle="Emissão e controle de remessa de materiais"
        action={openNew}
        actionLabel="Nova Remessa"
      />

      {/* Filtros */}
      {remessas.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Buscar por destino ou GVE..."
              className="pl-9"
            />
          </div>
          {years.length > 1 && (
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os anos</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : remessas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
            <FileText className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">Nenhuma remessa emitida ainda.</p>
          <Button onClick={openNew} className="gap-2 text-white" style={{ background: "hsl(var(--primary))" }}>
            <Plus className="h-4 w-4" /> Criar primeira remessa
          </Button>
        </div>
      ) : filteredRemessas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <p className="text-slate-400">Nenhuma remessa encontrada com os filtros aplicados.</p>
          <Button variant="link" onClick={() => { setSearchFilter(""); setYearFilter("all"); }}>
            Limpar filtros
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRemessas.map((r) => (
            <Card key={r.id} className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center gap-4">
                {/* Número */}
                <div className="shrink-0 w-16 text-center">
                  <p className="text-2xl font-black text-slate-700 leading-none">
                    {String(r.numero).padStart(2, "0")}
                  </p>
                  <p className="text-xs text-slate-400 font-semibold">{r.ano}</p>
                </div>

                <div className="w-px h-10 bg-slate-200 shrink-0" />

                {/* Detalhes */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800">
                      {r.para_destino || "—"}
                    </p>
                    {r.para_gve && (
                      <span className="text-xs text-slate-500 flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" /> GVE {r.para_gve}
                      </span>
                    )}
                    <Badge
                      title={STATUS_TOOLTIP[r.status]}
                      className={`${STATUS_COLORS[r.status] || STATUS_COLORS.emitida} transition-colors select-none`}
                      onClick={() => cycleStatus(r)}
                    >
                      {r.status === "recebida" && (
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                      )}
                      {STATUS_LABELS[r.status] || r.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400">
                    {r.data
                      ? format(new Date(r.data + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })
                      : "—"}
                    {Array.isArray(r.items) && r.items.length > 0 && (
                      <span className="ml-2">
                        · {r.items.length} item{r.items.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </p>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm" variant="outline"
                    className="gap-1.5 h-8 text-xs"
                    onClick={() => previewRemessaPdf(r)}
                  >
                    <Eye className="h-3.5 w-3.5" /> Visualizar
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 h-8 text-xs text-white"
                    style={{ background: "hsl(var(--primary))" }}
                    onClick={() => downloadRemessaPdf(r)}
                  >
                    <Printer className="h-3.5 w-3.5" /> Imprimir
                  </Button>
                  <button
                    onClick={() => openEdit(r)}
                    className="text-slate-400 hover:text-blue-500 transition-colors p-1.5 rounded"
                    title="Editar"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(r)}
                    className="text-slate-300 hover:text-red-500 transition-colors p-1.5 rounded"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Formulário nova/editar remessa */}
      <Dialog open={showForm} onOpenChange={(v) => !saving && setShowForm(v)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {editingRemessa
                ? `Editar Remessa Nº ${String(editingRemessa.numero).padStart(2, "0")}/${editingRemessa.ano}`
                : "Nova Relação de Remessa"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Meta */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={form.data}
                  onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Destino (PARA) <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={form.para_destino}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, para_destino: e.target.value }))
                  }
                  placeholder="Ex: Conchas"
                />
              </div>
              <div className="space-y-1.5">
                <Label>GVE</Label>
                <Input
                  value={form.para_gve}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, para_gve: e.target.value }))
                  }
                  placeholder="Ex: Botucatu"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Responsável (remetente)</Label>
                <Input
                  value={form.responsavel}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, responsavel: e.target.value }))
                  }
                  placeholder="Nome de quem envia"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observação do rodapé</Label>
              <Textarea
                value={form.responsavel_cargo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, responsavel_cargo: e.target.value }))
                }
                rows={2}
                className="text-sm resize-none"
              />
            </div>

            {/* Itens */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Itens remetidos</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addItem}
                  className="gap-1.5 h-7 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar item
                </Button>
              </div>
              <div className="space-y-2">
                {form.items.map((item, idx) => (
                  <ItemRow
                    key={idx}
                    item={item}
                    index={idx}
                    total={form.items.length}
                    onChange={updateItem}
                    onRemove={removeItem}
                    onMove={moveItem}
                  />
                ))}
              </div>
            </div>

            {saveError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {saveError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="gap-2 text-white"
                style={{ background: "hsl(var(--primary))" }}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                {saving
                  ? "Salvando..."
                  : editingRemessa
                  ? "Salvar Alterações"
                  : "Criar e Baixar PDF"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir remessa?</AlertDialogTitle>
            <AlertDialogDescription>
              Remessa Nº{" "}
              {String(deleteTarget?.numero || "").padStart(2, "0")}/
              {deleteTarget?.ano} será excluída permanentemente.
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
