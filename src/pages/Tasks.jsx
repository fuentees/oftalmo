import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { dataClient } from "@/api/dataClient";
import { useAuth } from "@/lib/AuthContext";
import { useLocation } from "react-router-dom";
import { format, isPast, isToday, parseISO } from "date-fns";
import {
  CheckCheck, Circle, Clock, AlertTriangle, Trash2, Edit,
  Loader2, User, Calendar, ListTodo, MessageSquare,
  LayoutGrid, List, Plus, Send, Tag, GripVertical,
  CheckSquare, Square, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
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

// ─── Constants ──────────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  baixa:   { label: "Baixa",   color: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
  media:   { label: "Média",   color: "bg-blue-100 text-blue-700 border-blue-200",    dot: "bg-blue-500" },
  alta:    { label: "Alta",    color: "bg-amber-100 text-amber-700 border-amber-200",  dot: "bg-amber-500" },
  urgente: { label: "Urgente", color: "bg-red-100 text-red-700 border-red-200",        dot: "bg-red-500" },
};

const CATEGORY_CONFIG = {
  administrativo: { label: "Administrativo", color: "bg-indigo-100 text-indigo-700" },
  clinico:        { label: "Clínico",        color: "bg-teal-100 text-teal-700" },
  treinamento:    { label: "Treinamento",    color: "bg-purple-100 text-purple-700" },
  estoque:        { label: "Estoque",        color: "bg-orange-100 text-orange-700" },
  outro:          { label: "Outro",          color: "bg-slate-100 text-slate-600" },
};

const KANBAN_COLUMNS = [
  { id: "pendente",     label: "Pendente",     color: "text-slate-700", bg: "bg-slate-100",  border: "border-slate-200" },
  { id: "em_andamento", label: "Em andamento", color: "text-blue-700",  bg: "bg-blue-50",    border: "border-blue-200" },
  { id: "concluida",    label: "Concluída",    color: "text-green-700", bg: "bg-green-50",   border: "border-green-200" },
];

const PRIORITY_WEIGHT = { urgente: 4, alta: 3, media: 2, baixa: 1 };

const AVATAR_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-green-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500",
];

const EMPTY_FORM = {
  title: "", description: "", assigned_to_id: "", assigned_to_name: "",
  due_date: "", priority: "media", status: "pendente", category: "",
  training_id: "", training_name: "",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

async function sendAssignmentEmail(task, professionals) {
  if (!task.assigned_to_id) return;
  const prof = professionals.find((p) => p.id === task.assigned_to_id);
  if (!prof?.email) return;
  try {
    await dataClient.integrations.Core.SendEmail({
      to: prof.email,
      subject: `[Tarefas] Nova tarefa atribuída: ${task.title}`,
      body: `
        <div style="font-family:sans-serif;max-width:520px;color:#1e293b">
          <h2 style="margin:0 0 12px">Nova tarefa atribuída a você</h2>
          <div style="background:#f8fafc;border-radius:8px;padding:16px;border:1px solid #e2e8f0">
            <p style="font-size:17px;font-weight:600;margin:0 0 6px">${task.title}</p>
            ${task.description ? `<p style="color:#475569;margin:0 0 8px;font-size:14px">${task.description}</p>` : ""}
            <p style="font-size:13px;color:#64748b;margin:0">
              Prioridade: <strong>${PRIORITY_CONFIG[task.priority]?.label ?? task.priority}</strong>
              ${task.due_date ? ` · Prazo: <strong>${format(parseISO(task.due_date), "dd/MM/yyyy")}</strong>` : ""}
              ${task.category ? ` · ${CATEGORY_CONFIG[task.category]?.label ?? task.category}` : ""}
            </p>
          </div>
          ${task.created_by_name ? `<p style="color:#94a3b8;font-size:12px;margin:12px 0 0">Atribuída por: ${task.created_by_name}</p>` : ""}
        </div>
      `,
    });
  } catch {
    // notificação é opcional
  }
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ name, size = "sm" }) {
  const color = getAvatarColor(name);
  const sz = size === "sm" ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-[11px]";
  return (
    <div className={`${sz} rounded-full ${color} flex items-center justify-center shrink-0`}>
      <span className="font-bold text-white">{getInitials(name)}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Tasks() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const urlTrainingId = urlParams.get("training") || "";

  const [view, setView] = useState("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [trainingFilter, setTrainingFilter] = useState(urlTrainingId);

  useEffect(() => { if (urlTrainingId) setTrainingFilter(urlTrainingId); }, [urlTrainingId]);

  const [selectedTask, setSelectedTask] = useState(null);
  const [detailTab, setDetailTab] = useState("subtarefas");
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [newSubtask, setNewSubtask] = useState("");
  const [newComment, setNewComment] = useState("");

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: tasks = [], isError, refetch } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => dataClient.entities.Task.list("-created_at"),
  });

  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => dataClient.entities.Professional.list("name"),
  });

  const { data: trainings = [] } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => dataClient.entities.Training.list("-date"),
  });

  const { data: subtasks = [], isLoading: loadingSubtasks } = useQuery({
    queryKey: ["taskSubtasks", selectedTask?.id],
    queryFn: () => dataClient.entities.TaskSubtask.filter({ task_id: selectedTask.id }, "position"),
    enabled: !!selectedTask?.id,
  });

  const { data: comments = [], isLoading: loadingComments } = useQuery({
    queryKey: ["taskComments", selectedTask?.id],
    queryFn: () => dataClient.entities.TaskComment.filter({ task_id: selectedTask.id }, "created_at"),
    enabled: !!selectedTask?.id,
  });

  // ── Computed ─────────────────────────────────────────────────────────────

  const counts = useMemo(() => ({
    pendente:     tasks.filter((t) => t.status === "pendente").length,
    em_andamento: tasks.filter((t) => t.status === "em_andamento").length,
    concluida:    tasks.filter((t) => t.status === "concluida").length,
    atrasada:     tasks.filter((t) => isOverdue(t)).length,
  }), [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter === "active" && (t.status === "concluida" || t.status === "cancelada")) return false;
      if (statusFilter !== "active" && statusFilter !== "all" && t.status !== statusFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (trainingFilter && t.training_id !== trainingFilter) return false;
      if (assignedFilter === "me") {
        const matchId = user?.id && t.assigned_to_id === user.id;
        const matchName = user?.full_name && String(t.assigned_to_name || "").toLowerCase() === user.full_name.toLowerCase();
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
  }, [tasks, statusFilter, categoryFilter, assignedFilter, search, user]);

  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
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
  }, [filteredTasks]);

  const subtaskProgress = useMemo(() => {
    if (!subtasks.length) return 0;
    return Math.round((subtasks.filter((s) => s.completed).length / subtasks.length) * 100);
  }, [subtasks]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createTaskMutation = useMutation({
    mutationFn: (payload) => dataClient.entities.Task.create(payload),
    onSuccess: async (created) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Tarefa criada." });
      setShowCreate(false);
      setFormData(EMPTY_FORM);
      setFormError(null);
      await sendAssignmentEmail(created, professionals);
    },
    onError: (err) => setFormError(err?.message || "Erro ao criar."),
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, payload }) => dataClient.entities.Task.update(id, payload),
    onSuccess: async (updated, { prevAssignedId }) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      if (selectedTask) setSelectedTask((t) => ({ ...t, ...updated }));
      toast({ title: "Tarefa atualizada." });
      setShowEdit(false);
      setFormError(null);
      if (updated.assigned_to_id && updated.assigned_to_id !== prevAssignedId) {
        await sendAssignmentEmail(updated, professionals);
      }
    },
    onError: (err) => setFormError(err?.message || "Erro ao atualizar."),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id) => dataClient.entities.Task.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Tarefa excluída." });
      setDeleteTarget(null);
      setSelectedTask(null);
    },
  });

  const toggleCompleteMutation = useMutation({
    mutationFn: ({ id, isDone }) =>
      dataClient.entities.Task.update(id, {
        status: isDone ? "pendente" : "concluida",
        completed_at: isDone ? null : new Date().toISOString(),
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      if (selectedTask?.id === updated.id) setSelectedTask((t) => ({ ...t, ...updated }));
    },
    onError: (err) => toast({ title: "Erro", description: err?.message, variant: "destructive" }),
  });

  const moveTaskMutation = useMutation({
    mutationFn: ({ id, status }) =>
      dataClient.entities.Task.update(id, {
        status,
        completed_at: status === "concluida" ? new Date().toISOString() : null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const createSubtaskMutation = useMutation({
    mutationFn: (payload) => dataClient.entities.TaskSubtask.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskSubtasks", selectedTask?.id] });
      setNewSubtask("");
    },
  });

  const toggleSubtaskMutation = useMutation({
    mutationFn: ({ id, completed }) => dataClient.entities.TaskSubtask.update(id, { completed }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["taskSubtasks", selectedTask?.id] }),
  });

  const deleteSubtaskMutation = useMutation({
    mutationFn: (id) => dataClient.entities.TaskSubtask.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["taskSubtasks", selectedTask?.id] }),
  });

  const createCommentMutation = useMutation({
    mutationFn: (payload) => dataClient.entities.TaskComment.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskComments", selectedTask?.id] });
      setNewComment("");
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (id) => dataClient.entities.TaskComment.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["taskComments", selectedTask?.id] }),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────

  const openCreate = () => {
    setFormData({ ...EMPTY_FORM, created_by_id: user?.id ?? "", created_by_name: user?.full_name ?? user?.email ?? "" });
    setFormError(null);
    setShowCreate(true);
  };

  const openEdit = (task) => {
    setFormData({
      title: task.title ?? "",
      description: task.description ?? "",
      assigned_to_id: task.assigned_to_id ?? "",
      assigned_to_name: task.assigned_to_name ?? "",
      due_date: task.due_date ?? "",
      priority: task.priority ?? "media",
      status: task.status ?? "pendente",
      category: task.category ?? "",
      training_id: task.training_id ?? "",
      training_name: task.training_name ?? "",
    });
    setFormError(null);
    setShowEdit(true);
  };

  const handleAssignedChange = (profId) => {
    if (profId === "__none__") {
      setFormData((p) => ({ ...p, assigned_to_id: "", assigned_to_name: "" }));
      return;
    }
    const prof = professionals.find((p) => p.id === profId);
    setFormData((p) => ({ ...p, assigned_to_id: profId, assigned_to_name: prof?.name ?? "" }));
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    const title = formData.title.trim();
    if (!title) { setFormError("Informe o título."); return; }
    createTaskMutation.mutate({
      title,
      description: formData.description.trim() || null,
      assigned_to_id: formData.assigned_to_id || null,
      assigned_to_name: formData.assigned_to_name || null,
      due_date: formData.due_date || null,
      priority: formData.priority,
      status: "pendente",
      category: formData.category || null,
      training_id: formData.training_id || null,
      training_name: formData.training_name || null,
      created_by_id: formData.created_by_id || null,
      created_by_name: formData.created_by_name || null,
    });
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    const title = formData.title.trim();
    if (!title) { setFormError("Informe o título."); return; }
    updateTaskMutation.mutate({
      id: selectedTask.id,
      prevAssignedId: selectedTask.assigned_to_id,
      payload: {
        title,
        description: formData.description.trim() || null,
        assigned_to_id: formData.assigned_to_id || null,
        assigned_to_name: formData.assigned_to_name || null,
        due_date: formData.due_date || null,
        priority: formData.priority,
        status: formData.status,
        category: formData.category || null,
        training_id: formData.training_id || null,
        training_name: formData.training_name || null,
      },
    });
  };

  const handleAddSubtask = (e) => {
    e.preventDefault();
    const title = newSubtask.trim();
    if (!title || !selectedTask) return;
    createSubtaskMutation.mutate({
      task_id: selectedTask.id,
      title,
      completed: false,
      position: subtasks.length,
    });
  };

  const handleAddComment = (e) => {
    e.preventDefault();
    const content = newComment.trim();
    if (!content || !selectedTask) return;
    createCommentMutation.mutate({
      task_id: selectedTask.id,
      author_id: user?.id ?? null,
      author_name: user?.full_name ?? user?.email ?? "Usuário",
      content,
    });
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const { draggableId, destination, source } = result;
    if (destination.droppableId === source.droppableId) return;
    moveTaskMutation.mutate({ id: draggableId, status: destination.droppableId });
  };

  // ── KPI ──────────────────────────────────────────────────────────────────

  const KPI_CARDS = [
    { label: "Pendentes",    key: "pendente",     count: counts.pendente,     Icon: Circle,        cls: "text-slate-500",  border: "border-slate-200", bg: "bg-slate-50" },
    { label: "Em andamento", key: "em_andamento", count: counts.em_andamento, Icon: Clock,         cls: "text-blue-500",   border: "border-blue-200",  bg: "bg-blue-50/50" },
    { label: "Concluídas",   key: "concluida",    count: counts.concluida,    Icon: CheckCheck,    cls: "text-green-500",  border: "border-green-200", bg: "bg-green-50/50" },
    { label: "Atrasadas",    key: "atrasada",     count: counts.atrasada,     Icon: AlertTriangle, cls: "text-red-500",    border: "border-red-200",   bg: "bg-red-50/50" },
  ];

  // ── Task card (list) ──────────────────────────────────────────────────────

  const TaskListCard = ({ task }) => {
    const isDone = task.status === "concluida" || task.status === "cancelada";
    const overdue = isOverdue(task);
    const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.media;
    const cat = CATEGORY_CONFIG[task.category];
    const dueDateObj = task.due_date ? parseISO(task.due_date) : null;

    return (
      <Card
        className={`transition-all duration-150 hover:shadow-md cursor-pointer ${overdue ? "border-l-4 border-l-red-400" : ""}`}
        onClick={() => { setSelectedTask(task); setDetailTab("subtarefas"); }}
      >
        <CardContent className="py-3.5 px-4">
          <div className={`flex items-start gap-3 ${isDone ? "opacity-50" : ""}`}>
            <button
              className={`mt-0.5 shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all
                ${task.status === "concluida" ? "border-green-500 bg-green-500 text-white" : "border-slate-300 hover:border-green-400 text-transparent hover:text-green-400"}`}
              onClick={(e) => { e.stopPropagation(); toggleCompleteMutation.mutate({ id: task.id, isDone: task.status === "concluida" }); }}
            >
              <CheckCheck className="h-3 w-3" />
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 flex-wrap">
                <span className={`font-medium text-slate-800 leading-snug ${isDone ? "line-through text-slate-400" : ""}`}>
                  {task.title}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${priority.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
                  {priority.label}
                </span>
                {cat && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${cat.color}`}>
                    <Tag className="h-3 w-3" />{cat.label}
                  </span>
                )}
                {task.training_name && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-700 border border-violet-200 shrink-0 max-w-[160px] truncate">
                    <ListTodo className="h-3 w-3 shrink-0" />{task.training_name}
                  </span>
                )}
                {overdue && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200 shrink-0">
                    <AlertTriangle className="h-3 w-3" /> Atrasada
                  </span>
                )}
                {task.status === "em_andamento" && !overdue && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200 shrink-0">
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
                    <Avatar name={task.assigned_to_name} />
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
                  <span className="text-xs text-green-600">Concluída em {format(new Date(task.completed_at), "dd/MM/yyyy")}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-0.5 shrink-0 ml-1">
              {!isDone && (
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600"
                  onClick={(e) => { e.stopPropagation(); setSelectedTask(task); openEdit(task); }}>
                  <Edit className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-300 hover:text-red-600"
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(task); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ── Kanban card ───────────────────────────────────────────────────────────

  const KanbanCard = ({ task, dragHandleProps }) => {
    const overdue = isOverdue(task);
    const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.media;
    const dueDateObj = task.due_date ? parseISO(task.due_date) : null;

    return (
      <div
        className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all cursor-pointer ${overdue ? "border-l-4 border-l-red-400" : "border-slate-200"}`}
        onClick={() => { setSelectedTask(task); setDetailTab("subtarefas"); }}
      >
        <div className="p-3">
          <div className="flex items-start gap-2 mb-2">
            <div {...dragHandleProps} className="mt-0.5 shrink-0 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing" onClick={(e) => e.stopPropagation()}>
              <GripVertical className="h-4 w-4" />
            </div>
            <p className="font-medium text-slate-800 text-sm leading-snug flex-1">{task.title}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap ml-6">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold border ${priority.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
              {priority.label}
            </span>
            {overdue && (
              <span className="text-xs font-semibold text-red-600 flex items-center gap-0.5">
                <AlertTriangle className="h-3 w-3" /> Atrasada
              </span>
            )}
          </div>
          {(task.assigned_to_name || dueDateObj) && (
            <div className="flex items-center justify-between mt-2.5 ml-6">
              {task.assigned_to_name ? (
                <div className="flex items-center gap-1">
                  <Avatar name={task.assigned_to_name} />
                  <span className="text-xs text-slate-500 truncate max-w-[90px]">{task.assigned_to_name}</span>
                </div>
              ) : <span />}
              {dueDateObj && (
                <span className={`text-xs flex items-center gap-1 ${overdue ? "text-red-600 font-semibold" : "text-slate-400"}`}>
                  <Calendar className="h-3 w-3" />
                  {format(dueDateObj, "dd/MM")}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Task form ─────────────────────────────────────────────────────────────

  const TaskForm = ({ onSubmit, isEditing }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label>Título *</Label>
        <Input className="mt-1" value={formData.title} autoFocus
          onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
          placeholder="Descreva a tarefa" />
      </div>
      <div>
        <Label>Descrição</Label>
        <Textarea className="mt-1 resize-none" rows={3} value={formData.description}
          onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
          placeholder="Detalhes adicionais (opcional)" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Atribuir a</Label>
          <Select value={formData.assigned_to_id || "__none__"} onValueChange={handleAssignedChange}>
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
        <div>
          <Label>Categoria</Label>
          <Select value={formData.category || "__none__"} onValueChange={(v) => setFormData((p) => ({ ...p, category: v === "__none__" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sem categoria</SelectItem>
              {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label>Vincular a treinamento</Label>
          <Select
            value={formData.training_id || "__none__"}
            onValueChange={(v) => {
              if (v === "__none__") { setFormData((p) => ({ ...p, training_id: "", training_name: "" })); return; }
              const tr = trainings.find((t) => t.id === v);
              setFormData((p) => ({ ...p, training_id: v, training_name: tr?.title ?? tr?.name ?? "" }));
            }}
          >
            <SelectTrigger className="mt-1"><SelectValue placeholder="Sem vínculo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sem vínculo</SelectItem>
              {trainings.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.title ?? t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isEditing && (
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
        <Button type="button" variant="outline" onClick={() => isEditing ? setShowEdit(false) : setShowCreate(false)}>Cancelar</Button>
        <Button type="submit" className="text-white" style={{ background: "hsl(var(--primary))" }}
          disabled={createTaskMutation.isPending || updateTaskMutation.isPending}>
          {(createTaskMutation.isPending || updateTaskMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEditing ? "Salvar" : "Criar Tarefa"}
        </Button>
      </div>
    </form>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {isError && <QueryError message="Erro ao carregar tarefas." onRetry={refetch} />}

      <PageHeader
        title="Tarefas"
        subtitle="Gerencie e acompanhe as tarefas da equipe"
        onActionClick={openCreate}
        actionLabel="Nova Tarefa"
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {KPI_CARDS.map(({ label, key, count, Icon, cls, border, bg }) => {
          const active = statusFilter === key;
          return (
            <div key={key} role="button" tabIndex={0}
              onClick={() => setStatusFilter((f) => f === key ? "active" : key)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setStatusFilter((f) => f === key ? "active" : key)}
              className={`rounded-xl border p-4 flex items-center justify-between cursor-pointer transition-all select-none
                ${active ? `${border} ${bg} ring-2 ring-inset ring-slate-300` : `${border} ${bg} hover:shadow-sm`}`}
            >
              <div>
                <p className={`text-xs font-medium uppercase tracking-wide ${cls}`}>{label}</p>
                <p className={`text-2xl font-black leading-none mt-0.5 ${cls}`}>{count}</p>
              </div>
              <Icon className={`h-7 w-7 opacity-30 ${cls}`} />
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
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
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={trainingFilter || "__none__"} onValueChange={(v) => setTrainingFilter(v === "__none__" ? "" : v)}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Todos os treinamentos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Todos os treinamentos</SelectItem>
            {trainings.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.title ?? t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant={assignedFilter === "me" ? "default" : "outline"} size="sm" className="gap-2"
          style={assignedFilter === "me" ? { background: "hsl(var(--primary))" } : undefined}
          onClick={() => setAssignedFilter((f) => f === "me" ? "all" : "me")}>
          <User className="h-3.5 w-3.5" /> Minhas tarefas
        </Button>
        <div className="ml-auto flex items-center rounded-lg border border-slate-200 overflow-hidden">
          <button
            onClick={() => setView("list")}
            className={`px-3 py-1.5 flex items-center gap-1.5 text-sm transition-colors ${view === "list" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}
          >
            <List className="h-4 w-4" /> Lista
          </button>
          <button
            onClick={() => setView("kanban")}
            className={`px-3 py-1.5 flex items-center gap-1.5 text-sm transition-colors ${view === "kanban" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}
          >
            <LayoutGrid className="h-4 w-4" /> Kanban
          </button>
        </div>
      </div>

      {/* ── List view ── */}
      {view === "list" && (
        <div className="space-y-2">
          {sortedTasks.length === 0 ? (
            <Card>
              <CardContent className="py-14 text-center text-slate-400">
                <ListTodo className="h-12 w-12 mx-auto mb-3 text-slate-200" />
                <p className="font-medium">Nenhuma tarefa encontrada</p>
                {(search || statusFilter !== "active" || categoryFilter !== "all" || assignedFilter !== "all") ? (
                  <Button variant="link" className="mt-1"
                    onClick={() => { setSearch(""); setStatusFilter("active"); setCategoryFilter("all"); setAssignedFilter("all"); }}>
                    Limpar filtros
                  </Button>
                ) : (
                  <Button variant="link" className="mt-1" onClick={openCreate}>Criar primeira tarefa</Button>
                )}
              </CardContent>
            </Card>
          ) : (
            sortedTasks.map((task) => <TaskListCard key={task.id} task={task} />)
          )}
        </div>
      )}

      {/* ── Kanban view ── */}
      {view === "kanban" && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {KANBAN_COLUMNS.map((col) => {
              const colTasks = filteredTasks.filter((t) => t.status === col.id);
              return (
                <div key={col.id} className="flex flex-col gap-2">
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${col.bg} ${col.border}`}>
                    <span className={`font-semibold text-sm ${col.color}`}>{col.label}</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/70 ${col.color}`}>{colTasks.length}</span>
                  </div>
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div ref={provided.innerRef} {...provided.droppableProps}
                        className={`flex-1 min-h-[180px] space-y-2 p-1 rounded-xl transition-colors duration-150 ${snapshot.isDraggingOver ? "bg-blue-50/60 ring-2 ring-blue-200" : ""}`}
                      >
                        {colTasks.map((task, index) => (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(provided, snapshot) => (
                              <div ref={provided.innerRef} {...provided.draggableProps}
                                className={snapshot.isDragging ? "opacity-90 shadow-2xl rotate-1 scale-105" : ""}>
                                <KanbanCard task={task} dragHandleProps={provided.dragHandleProps} />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {colTasks.length === 0 && !snapshot.isDraggingOver && (
                          <div className="h-20 flex items-center justify-center text-slate-300 text-sm rounded-lg border-2 border-dashed border-slate-200">
                            Arraste aqui
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* ── Task detail sheet ── */}
      <Sheet open={!!selectedTask && !showEdit} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
          {selectedTask && (() => {
            const overdue = isOverdue(selectedTask);
            const priority = PRIORITY_CONFIG[selectedTask.priority] ?? PRIORITY_CONFIG.media;
            const cat = CATEGORY_CONFIG[selectedTask.category];
            const dueDateObj = selectedTask.due_date ? parseISO(selectedTask.due_date) : null;
            const isDone = selectedTask.status === "concluida" || selectedTask.status === "cancelada";
            return (
              <>
                <SheetHeader className="px-6 pt-6 pb-4 border-b">
                  <div className="flex items-start gap-3 pr-6">
                    <button
                      className={`mt-1 shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all
                        ${selectedTask.status === "concluida" ? "border-green-500 bg-green-500 text-white" : "border-slate-300 hover:border-green-400 text-transparent hover:text-green-400"}`}
                      onClick={() => {
                        toggleCompleteMutation.mutate({ id: selectedTask.id, isDone: selectedTask.status === "concluida" });
                      }}
                    >
                      <CheckCheck className="h-3 w-3" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <SheetTitle className={`text-left leading-snug ${isDone ? "line-through text-slate-400" : ""}`}>
                        {selectedTask.title}
                      </SheetTitle>
                      {selectedTask.description && (
                        <p className="text-sm text-slate-500 mt-1">{selectedTask.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Meta badges */}
                  <div className="flex flex-wrap gap-2 mt-3 ml-8">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${priority.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />{priority.label}
                    </span>
                    {cat && (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cat.color}`}>
                        <Tag className="h-3 w-3" />{cat.label}
                      </span>
                    )}
                    {overdue && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                        <AlertTriangle className="h-3 w-3" /> Atrasada
                      </span>
                    )}
                  </div>

                  {/* Info row */}
                  <div className="flex flex-wrap gap-4 mt-3 ml-8 text-sm">
                    {selectedTask.assigned_to_name && (
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Avatar name={selectedTask.assigned_to_name} />
                        {selectedTask.assigned_to_name}
                      </div>
                    )}
                    {dueDateObj && (
                      <div className={`flex items-center gap-1 ${overdue ? "text-red-600 font-semibold" : "text-slate-500"}`}>
                        <Calendar className="h-4 w-4" />
                        {format(dueDateObj, "dd/MM/yyyy")}
                      </div>
                    )}
                    {selectedTask.created_by_name && (
                      <div className="flex items-center gap-1 text-slate-400 text-xs">
                        Criada por {selectedTask.created_by_name}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-3 ml-8">
                    <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs"
                      onClick={() => openEdit(selectedTask)}>
                      <Edit className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => setDeleteTarget(selectedTask)}>
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </Button>
                  </div>
                </SheetHeader>

                <Tabs value={detailTab} onValueChange={setDetailTab} className="flex-1 flex flex-col overflow-hidden">
                  <TabsList className="mx-6 mt-4 shrink-0">
                    <TabsTrigger value="subtarefas" className="flex-1 gap-1.5">
                      <CheckSquare className="h-3.5 w-3.5" /> Subtarefas
                      {subtasks.length > 0 && <span className="ml-1 text-xs">({subtasks.filter(s=>s.completed).length}/{subtasks.length})</span>}
                    </TabsTrigger>
                    <TabsTrigger value="comentarios" className="flex-1 gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5" /> Comentários
                      {comments.length > 0 && <span className="ml-1 text-xs">({comments.length})</span>}
                    </TabsTrigger>
                  </TabsList>

                  {/* Subtarefas */}
                  <TabsContent value="subtarefas" className="flex-1 flex flex-col overflow-hidden px-6 mt-3">
                    {subtasks.length > 0 && (
                      <div className="mb-3 shrink-0">
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                          <span>{subtasks.filter(s=>s.completed).length} de {subtasks.length} concluídas</span>
                          <span>{subtaskProgress}%</span>
                        </div>
                        <Progress value={subtaskProgress} className="h-1.5" />
                      </div>
                    )}
                    <ScrollArea className="flex-1">
                      {loadingSubtasks ? (
                        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
                      ) : (
                        <div className="space-y-1 pb-4">
                          {subtasks.map((s) => (
                            <div key={s.id} className="flex items-center gap-2 group py-1.5 px-2 rounded-lg hover:bg-slate-50">
                              <button
                                className={`shrink-0 h-4 w-4 rounded border flex items-center justify-center transition-colors
                                  ${s.completed ? "bg-green-500 border-green-500 text-white" : "border-slate-300 hover:border-green-400"}`}
                                onClick={() => toggleSubtaskMutation.mutate({ id: s.id, completed: !s.completed })}
                              >
                                {s.completed && <CheckCheck className="h-2.5 w-2.5" />}
                              </button>
                              <span className={`flex-1 text-sm ${s.completed ? "line-through text-slate-400" : "text-slate-700"}`}>
                                {s.title}
                              </span>
                              <button
                                className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                                onClick={() => deleteSubtaskMutation.mutate(s.id)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                    <form onSubmit={handleAddSubtask} className="flex gap-2 pt-3 border-t mt-2 shrink-0">
                      <Input
                        value={newSubtask}
                        onChange={(e) => setNewSubtask(e.target.value)}
                        placeholder="Adicionar subtarefa..."
                        className="h-9 text-sm"
                      />
                      <Button type="submit" size="sm" className="h-9 px-3 text-white shrink-0" style={{ background: "hsl(var(--primary))" }}
                        disabled={!newSubtask.trim() || createSubtaskMutation.isPending}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </form>
                  </TabsContent>

                  {/* Comentários */}
                  <TabsContent value="comentarios" className="flex-1 flex flex-col overflow-hidden px-6 mt-3">
                    <ScrollArea className="flex-1">
                      {loadingComments ? (
                        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
                      ) : comments.length === 0 ? (
                        <div className="py-10 text-center text-slate-400">
                          <MessageSquare className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                          <p className="text-sm">Nenhum comentário ainda.</p>
                        </div>
                      ) : (
                        <div className="space-y-4 pb-4">
                          {comments.map((c) => (
                            <div key={c.id} className="group flex gap-3">
                              <Avatar name={c.author_name} size="md" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-700">{c.author_name}</span>
                                  <span className="text-xs text-slate-400">
                                    {format(new Date(c.created_at), "dd/MM/yyyy 'às' HH:mm")}
                                  </span>
                                  <button
                                    className="ml-auto opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                                    onClick={() => deleteCommentMutation.mutate(c.id)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                                <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{c.content}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                    <form onSubmit={handleAddComment} className="pt-3 border-t mt-2 shrink-0 space-y-2">
                      <Textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Escreva um comentário..."
                        rows={2}
                        className="text-sm resize-none"
                      />
                      <div className="flex justify-end">
                        <Button type="submit" size="sm" className="gap-1.5 text-white" style={{ background: "hsl(var(--primary))" }}
                          disabled={!newComment.trim() || createCommentMutation.isPending}>
                          {createCommentMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Comentar
                        </Button>
                      </div>
                    </form>
                  </TabsContent>
                </Tabs>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ── Create dialog ── */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) { setShowCreate(false); setFormError(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nova Tarefa</DialogTitle></DialogHeader>
          <TaskForm onSubmit={handleCreateSubmit} isEditing={false} />
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ── */}
      <Dialog open={showEdit} onOpenChange={(open) => { if (!open) { setShowEdit(false); setFormError(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Tarefa</DialogTitle></DialogHeader>
          <TaskForm onSubmit={handleEditSubmit} isEditing={true} />
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.title ?? "esta tarefa"}</strong>?
              Subtarefas e comentários também serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTaskMutation.mutate(deleteTarget.id)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
