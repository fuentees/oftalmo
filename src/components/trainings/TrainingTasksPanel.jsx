import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { useAuth } from "@/lib/AuthContext";
import { format, isPast, isToday, parseISO } from "date-fns";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import {
  Plus, CheckCheck, AlertTriangle, Calendar, User,
  Loader2, ListTodo, ArrowUpRight, Trash2, Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";

const PRIORITY_CONFIG = {
  baixa:   { label: "Baixa",   dot: "bg-slate-400",  color: "text-slate-500" },
  media:   { label: "Média",   dot: "bg-blue-500",   color: "text-blue-600" },
  alta:    { label: "Alta",    dot: "bg-amber-500",  color: "text-amber-600" },
  urgente: { label: "Urgente", dot: "bg-red-500",    color: "text-red-600" },
};

function isOverdue(task) {
  if (!task.due_date || task.status === "concluida" || task.status === "cancelada") return false;
  const due = parseISO(task.due_date);
  return isPast(due) && !isToday(due);
}

function getInitials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-500","bg-purple-500","bg-green-500","bg-amber-500",
  "bg-rose-500","bg-cyan-500","bg-indigo-500","bg-teal-500",
];
function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const EMPTY_FORM = {
  title: "", description: "", assigned_to_id: "", assigned_to_name: "",
  due_date: "", priority: "media",
};

export default function TrainingTasksPanel({ training }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [statusFilter, setStatusFilter] = useState("active");

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", "training", training?.id],
    queryFn: () => dataClient.entities.Task.filter({ training_id: training.id }, "-created_at"),
    enabled: !!training?.id,
  });

  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => dataClient.entities.Professional.list("name"),
  });

  const filtered = tasks.filter((t) => {
    if (statusFilter === "active") return t.status !== "concluida" && t.status !== "cancelada";
    if (statusFilter === "concluida") return t.status === "concluida";
    return true;
  });

  const counts = {
    active: tasks.filter((t) => t.status !== "concluida" && t.status !== "cancelada").length,
    concluida: tasks.filter((t) => t.status === "concluida").length,
    atrasada: tasks.filter((t) => isOverdue(t)).length,
  };

  const createMutation = useMutation({
    mutationFn: (payload) => dataClient.entities.Task.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Tarefa criada." });
      setShowForm(false);
      setFormData(EMPTY_FORM);
      setFormError(null);
    },
    onError: (err) => setFormError(err?.message || "Erro ao criar."),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isDone }) =>
      dataClient.entities.Task.update(id, {
        status: isDone ? "pendente" : "concluida",
        completed_at: isDone ? null : new Date().toISOString(),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => dataClient.entities.Task.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Tarefa excluída." });
      setDeleteTarget(null);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const title = formData.title.trim();
    if (!title) { setFormError("Informe o título."); return; }
    const prof = professionals.find((p) => p.id === formData.assigned_to_id);
    createMutation.mutate({
      title,
      description: formData.description.trim() || null,
      assigned_to_id: formData.assigned_to_id || null,
      assigned_to_name: prof?.name || formData.assigned_to_name || null,
      due_date: formData.due_date || null,
      priority: formData.priority,
      status: "pendente",
      category: "treinamento",
      training_id: training.id,
      training_name: training.title ?? training.name ?? null,
      created_by_id: user?.id ?? null,
      created_by_name: user?.full_name ?? user?.email ?? null,
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="font-semibold text-slate-700">{tasks.length} tarefa{tasks.length !== 1 ? "s" : ""}</span>
          {counts.atrasada > 0 && (
            <span className="flex items-center gap-1 text-red-600 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" /> {counts.atrasada} atrasada{counts.atrasada !== 1 ? "s" : ""}
            </span>
          )}
          {counts.concluida > 0 && (
            <span className="flex items-center gap-1 text-green-600">
              <CheckCheck className="h-3.5 w-3.5" /> {counts.concluida} concluída{counts.concluida !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`${createPageUrl("Tasks")}?training=${training.id}`}
            className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
          >
            Ver em Tarefas <ArrowUpRight className="h-3 w-3" />
          </Link>
          <Button size="sm" className="gap-1.5 text-white h-8" style={{ background: "hsl(var(--primary))" }}
            onClick={() => { setFormData(EMPTY_FORM); setFormError(null); setShowForm(true); }}>
            <Plus className="h-3.5 w-3.5" /> Nova tarefa
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1.5">
        {[
          { key: "active", label: `Ativas (${counts.active})` },
          { key: "concluida", label: `Concluídas (${counts.concluida})` },
          { key: "all", label: "Todas" },
        ].map(({ key, label }) => (
          <button key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors
              ${statusFilter === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-slate-400">
            <ListTodo className="h-10 w-10 mx-auto mb-2 text-slate-200" />
            <p className="text-sm font-medium">Nenhuma tarefa para este treinamento</p>
            <Button variant="link" className="mt-1 text-sm" onClick={() => { setFormData(EMPTY_FORM); setFormError(null); setShowForm(true); }}>
              Criar primeira tarefa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => {
            const isDone = task.status === "concluida" || task.status === "cancelada";
            const overdue = isOverdue(task);
            const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.media;
            const dueDateObj = task.due_date ? parseISO(task.due_date) : null;
            const avatarColor = getAvatarColor(task.assigned_to_name);

            return (
              <Card key={task.id} className={`${overdue ? "border-l-4 border-l-red-400" : ""}`}>
                <CardContent className="py-3 px-4">
                  <div className={`flex items-start gap-3 ${isDone ? "opacity-50" : ""}`}>
                    <button
                      onClick={() => toggleMutation.mutate({ id: task.id, isDone: task.status === "concluida" })}
                      className={`mt-0.5 shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all
                        ${task.status === "concluida" ? "border-green-500 bg-green-500 text-white" : "border-slate-300 hover:border-green-400 text-transparent hover:text-green-400"}`}
                    >
                      <CheckCheck className="h-3 w-3" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium text-slate-800 leading-snug ${isDone ? "line-through text-slate-400" : ""}`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{task.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${priority.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />{priority.label}
                        </span>
                        {task.assigned_to_name && (
                          <div className="flex items-center gap-1">
                            <div className={`h-4 w-4 rounded-full ${avatarColor} flex items-center justify-center`}>
                              <span className="text-[8px] font-bold text-white">{getInitials(task.assigned_to_name)}</span>
                            </div>
                            <span className="text-xs text-slate-500">{task.assigned_to_name}</span>
                          </div>
                        )}
                        {dueDateObj && (
                          <div className={`flex items-center gap-1 text-xs ${overdue ? "text-red-600 font-semibold" : "text-slate-400"}`}>
                            <Calendar className="h-3 w-3" />
                            {format(dueDateObj, "dd/MM/yyyy")}
                            {overdue && <span className="ml-0.5 flex items-center gap-0.5"><AlertTriangle className="h-3 w-3" /> Atrasada</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      className="shrink-0 text-slate-300 hover:text-red-500 transition-colors"
                      onClick={() => setDeleteTarget(task)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); setFormError(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Tarefa — {training?.title ?? training?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input className="mt-1" autoFocus value={formData.title}
                onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                placeholder="Descreva a tarefa" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea className="mt-1 resize-none" rows={2} value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                placeholder="Detalhes opcionais" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Atribuir a</Label>
                <Select value={formData.assigned_to_id || "__none__"}
                  onValueChange={(v) => {
                    if (v === "__none__") { setFormData((p) => ({ ...p, assigned_to_id: "", assigned_to_name: "" })); return; }
                    const prof = professionals.find((p) => p.id === v);
                    setFormData((p) => ({ ...p, assigned_to_id: v, assigned_to_name: prof?.name ?? "" }));
                  }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem responsável</SelectItem>
                    {professionals.filter((p) => p.status !== "inativo").map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prazo</Label>
                <Input type="date" className="mt-1" value={formData.due_date}
                  onChange={(e) => setFormData((p) => ({ ...p, due_date: e.target.value }))} />
              </div>
              <div className="col-span-2">
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
            </div>
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" className="text-white" style={{ background: "hsl(var(--primary))" }}
                disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar Tarefa
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.title}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => { const id = deleteTarget?.id; if (id) deleteMutation.mutate(id); }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
