import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { useAuth } from "@/lib/AuthContext";
import { format, isPast, isToday, parseISO } from "date-fns";
import {
  CheckCheck, Circle, Clock, AlertTriangle, Trash2, Edit,
  Loader2, User, Calendar, ListTodo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/common/PageHeader";
import SearchFilter from "@/components/common/SearchFilter";
import QueryError from "@/components/common/QueryError";

const PRIORITY_CONFIG = {
  baixa:   { label: "Baixa",   color: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
  media:   { label: "Média",   color: "bg-blue-100 text-blue-700 border-blue-200",    dot: "bg-blue-500" },
  alta:    { label: "Alta",    color: "bg-amber-100 text-amber-700 border-amber-200",  dot: "bg-amber-500" },
  urgente: { label: "Urgente", color: "bg-red-100 text-red-700 border-red-200",        dot: "bg-red-500" },
};

const PRIORITY_WEIGHT = { urgente: 4, alta: 3, media: 2, baixa: 1 };

const AVATAR_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-green-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500",
];

const EMPTY_FORM = {
  title: "", description: "", assigned_to_id: "", assigned_to_name: "",
  due_date: "", priority: "media", status: "pendente",
};

function getInitials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function isOverdue(task) {
  if (!task.due_date || task.status === "concluida" || task.status === "cancelada") return false;
  const due = parseISO(task.due_date);
  return isPast(due) && !isToday(due);
}

export default function Tasks() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: tasks = [], isError, refetch } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => dataClient.entities.Task.list("-created_at"),
  });

  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => dataClient.entities.Professional.list("name"),
  });

  const counts = useMemo(() => ({
    pendente:     tasks.filter((t) => t.status === "pendente").length,
    em_andamento: tasks.filter((t) => t.status === "em_andamento").length,
    concluida:    tasks.filter((t) => t.status === "concluida").length,
    atrasada:     tasks.filter((t) => isOverdue(t)).length,
  }), [tasks]);

  const sortedFiltered = useMemo(() => {
    const filtered = tasks.filter((t) => {
      if (statusFilter === "active" && (t.status === "concluida" || t.status === "cancelada")) return false;
      if (statusFilter !== "active" && statusFilter !== "all" && t.status !== statusFilter) return false;
      if (assignedFilter === "me") {
        const myId = user?.id;
        const myName = String(user?.full_name || user?.email || "").toLowerCase();
        const matchId = myId && t.assigned_to_id === myId;
        const matchName = myName && String(t.assigned_to_name || "").toLowerCase() === myName;
        if (!matchId && !matchName) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        return (
          String(t.title ?? "").toLowerCase().includes(q) ||
          String(t.description ?? "").toLowerCase().includes(q) ||
          String(t.assigned_to_name ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      const aDone = a.status === "concluida" || a.status === "cancelada";
      const bDone = b.status === "concluida" || b.status === "cancelada";
      if (aDone !== bDone) return aDone ? 1 : -1;
      const aOver = isOverdue(a);
      const bOver = isOverdue(b);
      if (aOver !== bOver) return aOver ? -1 : 1;
      const pw = (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0);
      if (pw !== 0) return pw;
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    });
  }, [tasks, statusFilter, assignedFilter, search, user]);

  const createMutation = useMutation({
    mutationFn: (payload) => dataClient.entities.Task.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Tarefa criada com sucesso." });
      closeForm();
    },
    onError: (err) => setFormError(err?.message || "Erro ao criar tarefa."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => dataClient.entities.Task.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Tarefa atualizada." });
      closeForm();
    },
    onError: (err) => setFormError(err?.message || "Erro ao atualizar."),
  });

  const toggleCompleteMutation = useMutation({
    mutationFn: ({ id, isDone }) =>
      dataClient.entities.Task.update(id, {
        status: isDone ? "pendente" : "concluida",
        completed_at: isDone ? null : new Date().toISOString(),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (err) => toast({ title: "Erro", description: err?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => dataClient.entities.Task.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Tarefa excluída." });
      setDeleteTarget(null);
    },
  });

  const openNew = () => {
    setEditingTask(null);
    setFormData({
      ...EMPTY_FORM,
      created_by_id: user?.id ?? "",
      created_by_name: user?.full_name ?? user?.email ?? "",
    });
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (task) => {
    setEditingTask(task);
    setFormData({
      title: task.title ?? "",
      description: task.description ?? "",
      assigned_to_id: task.assigned_to_id ?? "",
      assigned_to_name: task.assigned_to_name ?? "",
      due_date: task.due_date ?? "",
      priority: task.priority ?? "media",
      status: task.status ?? "pendente",
    });
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingTask(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
  };

  const handleAssignedChange = (professionalId) => {
    if (professionalId === "__none__") {
      setFormData((p) => ({ ...p, assigned_to_id: "", assigned_to_name: "" }));
      return;
    }
    const prof = professionals.find((p) => p.id === professionalId);
    setFormData((p) => ({
      ...p,
      assigned_to_id: professionalId,
      assigned_to_name: prof?.name ?? "",
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    const title = formData.title.trim();
    if (!title) { setFormError("Informe o título da tarefa."); return; }
    const payload = {
      title,
      description: formData.description.trim() || null,
      assigned_to_id: formData.assigned_to_id || null,
      assigned_to_name: formData.assigned_to_name || null,
      due_date: formData.due_date || null,
      priority: formData.priority,
      status: formData.status,
      created_by_id: user?.id ?? null,
      created_by_name: user?.full_name ?? user?.email ?? null,
    };
    if (editingTask) {
      updateMutation.mutate({ id: editingTask.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const KPI_CARDS = [
    { label: "Pendentes",    key: "pendente",     count: counts.pendente,     Icon: Circle,        colorClass: "text-slate-500",  border: "border-slate-200", bg: "bg-slate-50" },
    { label: "Em andamento", key: "em_andamento", count: counts.em_andamento, Icon: Clock,         colorClass: "text-blue-500",   border: "border-blue-200",  bg: "bg-blue-50/50" },
    { label: "Concluídas",   key: "concluida",    count: counts.concluida,    Icon: CheckCheck,    colorClass: "text-green-500",  border: "border-green-200", bg: "bg-green-50/50" },
    { label: "Atrasadas",    key: "atrasada",     count: counts.atrasada,     Icon: AlertTriangle, colorClass: "text-red-500",    border: "border-red-200",   bg: "bg-red-50/50" },
  ];

  return (
    <div className="space-y-6">
      {isError && <QueryError message="Erro ao carregar tarefas." onRetry={refetch} />}

      <PageHeader
        title="Tarefas"
        subtitle="Gerencie e acompanhe as tarefas da equipe"
        onActionClick={openNew}
        actionLabel="Nova Tarefa"
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {KPI_CARDS.map(({ label, key, count, Icon, colorClass, border, bg }) => {
          const active = statusFilter === key;
          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => setStatusFilter((f) => f === key ? "active" : key)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setStatusFilter((f) => f === key ? "active" : key)}
              className={`rounded-xl border p-4 flex items-center justify-between cursor-pointer transition-all select-none
                ${active ? `${border} ${bg} ring-2 ring-inset ring-slate-300` : `${border} ${bg} hover:shadow-sm`}`}
            >
              <div>
                <p className={`text-xs font-medium uppercase tracking-wide ${colorClass}`}>{label}</p>
                <p className={`text-2xl font-black leading-none mt-0.5 ${colorClass}`}>{count}</p>
              </div>
              <Icon className={`h-7 w-7 opacity-30 ${colorClass}`} />
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <SearchFilter value={search} onChange={setSearch} placeholder="Buscar tarefa ou responsável..." />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Ativas</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
            <SelectItem value="em_andamento">Em andamento</SelectItem>
            <SelectItem value="concluida">Concluídas</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={assignedFilter === "me" ? "default" : "outline"}
          size="sm"
          className="gap-2"
          style={assignedFilter === "me" ? { background: "hsl(var(--primary))" } : undefined}
          onClick={() => setAssignedFilter((f) => f === "me" ? "all" : "me")}
        >
          <User className="h-3.5 w-3.5" />
          Minhas tarefas
        </Button>
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {sortedFiltered.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center text-slate-400">
              <ListTodo className="h-12 w-12 mx-auto mb-3 text-slate-200" />
              <p className="font-medium">Nenhuma tarefa encontrada</p>
              {(search || statusFilter !== "active" || assignedFilter !== "all") ? (
                <Button variant="link" className="mt-1"
                  onClick={() => { setSearch(""); setStatusFilter("active"); setAssignedFilter("all"); }}>
                  Limpar filtros
                </Button>
              ) : (
                <Button variant="link" className="mt-1" onClick={openNew}>
                  Criar primeira tarefa
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          sortedFiltered.map((task) => {
            const isDone = task.status === "concluida" || task.status === "cancelada";
            const overdue = isOverdue(task);
            const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.media;
            const avatarColor = getAvatarColor(task.assigned_to_name);
            const dueDateObj = task.due_date ? parseISO(task.due_date) : null;

            return (
              <Card
                key={task.id}
                className={`transition-all duration-200 hover:shadow-md ${overdue ? "border-l-4 border-l-red-400" : ""}`}
              >
                <CardContent className="py-3.5 px-4">
                  <div className={`flex items-start gap-3 ${isDone ? "opacity-50" : ""}`}>
                    {/* Checkbox toggle */}
                    <button
                      disabled={toggleCompleteMutation.isPending}
                      onClick={() => toggleCompleteMutation.mutate({ id: task.id, isDone: task.status === "concluida" })}
                      className={`mt-0.5 shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all
                        ${task.status === "concluida"
                          ? "border-green-500 bg-green-500 text-white"
                          : "border-slate-300 hover:border-green-400 text-transparent hover:text-green-400"}`}
                    >
                      <CheckCheck className="h-3 w-3" />
                    </button>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className={`font-medium text-slate-800 leading-snug ${isDone ? "line-through text-slate-400" : ""}`}>
                          {task.title}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${priority.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
                          {priority.label}
                        </span>
                        {overdue && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200 shrink-0">
                            <AlertTriangle className="h-3 w-3" /> Atrasada
                          </span>
                        )}
                        {task.status === "em_andamento" && !overdue && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200 shrink-0">
                            Em andamento
                          </span>
                        )}
                      </div>

                      {task.description && (
                        <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">{task.description}</p>
                      )}

                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        {task.assigned_to_name && (
                          <div className="flex items-center gap-1.5">
                            <div className={`h-5 w-5 rounded-full ${avatarColor} flex items-center justify-center shrink-0`}>
                              <span className="text-[9px] font-bold text-white">{getInitials(task.assigned_to_name)}</span>
                            </div>
                            <span className="text-xs text-slate-500">{task.assigned_to_name}</span>
                          </div>
                        )}
                        {dueDateObj && (
                          <div className={`flex items-center gap-1 text-xs ${overdue ? "text-red-600 font-semibold" : isToday(dueDateObj) ? "text-amber-600 font-semibold" : "text-slate-400"}`}>
                            <Calendar className="h-3 w-3" />
                            {format(dueDateObj, "dd/MM/yyyy")}
                            {isToday(dueDateObj) && <span className="ml-0.5">— hoje</span>}
                          </div>
                        )}
                        {task.status === "concluida" && task.completed_at && (
                          <span className="text-xs text-green-600">
                            Concluída em {format(new Date(task.completed_at), "dd/MM/yyyy")}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0 ml-2">
                      {!isDone && (
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600"
                          onClick={() => openEdit(task)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-300 hover:text-red-600"
                        onClick={() => setDeleteTarget(task)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input
                className="mt-1"
                value={formData.title}
                onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                placeholder="Descreva a tarefa"
                autoFocus
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                className="mt-1"
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                placeholder="Detalhes adicionais (opcional)"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Atribuir a</Label>
                <Select
                  value={formData.assigned_to_id || "__none__"}
                  onValueChange={handleAssignedChange}
                >
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem responsável</SelectItem>
                    {professionals
                      .filter((p) => p.status !== "inativo")
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prazo</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={formData.due_date}
                  onChange={(e) => setFormData((p) => ({ ...p, due_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select value={formData.priority} onValueChange={(v) => setFormData((p) => ({ ...p, priority: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editingTask && (
                <div>
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData((p) => ({ ...p, status: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="em_andamento">Em andamento</SelectItem>
                      <SelectItem value="concluida">Concluída</SelectItem>
                      <SelectItem value="cancelada">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {formError && (
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription className="text-red-700">{formError}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeForm}>Cancelar</Button>
              <Button
                type="submit"
                className="text-white"
                style={{ background: "hsl(var(--primary))" }}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingTask ? "Salvar" : "Criar Tarefa"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.title ?? "esta tarefa"}</strong>?
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
