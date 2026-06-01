import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import {
  Plus, Trash2, Edit, ChevronLeft, Loader2, Image, X,
  Copy, CheckCircle2, ClipboardCheck, GripVertical, Save,
  Eye, ToggleLeft, ToggleRight, AlignLeft, List, CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/common/PageHeader";

const Q_TYPE_LABELS = {
  multiple_choice: "Múltipla Escolha",
  true_false:      "Verdadeiro / Falso",
  essay:           "Dissertativa",
};
const Q_TYPE_COLORS = {
  multiple_choice: "bg-blue-100 text-blue-700",
  true_false:      "bg-green-100 text-green-700",
  essay:           "bg-purple-100 text-purple-700",
};
const Q_TYPE_ICONS = {
  multiple_choice: List,
  true_false:      ToggleLeft,
  essay:           AlignLeft,
};

const OPTION_LETTERS = ["A", "B", "C", "D", "E"];

function makeEmptyOption(idx) {
  return { id: OPTION_LETTERS[idx].toLowerCase(), text: "", is_correct: idx === 0 };
}

export default function ExamBuilder() {
  const queryClient = useQueryClient();
  const [view, setView] = useState("list"); // "list" | "questions"
  const [selectedExam, setSelectedExam] = useState(null);
  const [showExamForm, setShowExamForm] = useState(false);
  const [editingExam, setEditingExam] = useState(null);
  const [examForm, setExamForm] = useState({ title: "", description: "", passing_score: "60", training_title: "" });
  const [examFormError, setExamFormError] = useState(null);
  const [deleteExamTarget, setDeleteExamTarget] = useState(null);

  // Questions editor state
  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [uploadingImageId, setUploadingImageId] = useState(null);
  const [deleteQTarget, setDeleteQTarget] = useState(null);
  const [addingQuestion, setAddingQuestion] = useState(false);

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ["exams"],
    queryFn: () => dataClient.entities.Exam.list("-created_at"),
  });

  const { data: trainings = [] } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => dataClient.entities.Training.list("-date", 200),
  });

  // Non-repadronização trainings only
  const validTrainings = trainings.filter(
    (t) => !String(t.type || "").toLowerCase().includes("repadroniza")
  );

  // ── Exam CRUD ────────────────────────────────────────────────────────────────
  const createExamMutation = useMutation({
    mutationFn: (payload) => dataClient.entities.Exam.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams"] });
      toast({ title: "Prova criada com sucesso." });
      setShowExamForm(false);
    },
    onError: (err) => setExamFormError(err?.message || "Erro ao criar prova."),
  });

  const updateExamMutation = useMutation({
    mutationFn: ({ id, payload }) => dataClient.entities.Exam.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams"] });
      toast({ title: "Prova atualizada." });
      setShowExamForm(false);
      if (selectedExam) {
        setSelectedExam((prev) => ({ ...prev, ...examForm }));
      }
    },
    onError: (err) => setExamFormError(err?.message || "Erro ao atualizar prova."),
  });

  const deleteExamMutation = useMutation({
    mutationFn: (id) => dataClient.entities.Exam.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams"] });
      toast({ title: "Prova excluída." });
      setDeleteExamTarget(null);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }) => dataClient.entities.Exam.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exams"] }),
  });

  // ── Open question editor ─────────────────────────────────────────────────────
  const openQuestions = async (exam) => {
    setSelectedExam(exam);
    setLoadingQuestions(true);
    setView("questions");
    try {
      const qs = await dataClient.entities.ExamQuestion.filter({ exam_id: exam.id }, "ordem");
      setQuestions(Array.isArray(qs) ? qs.map((q) => ({ ...q, isDirty: false })) : []);
    } catch {
      setQuestions([]);
    } finally {
      setLoadingQuestions(false);
    }
  };

  // ── Add question ─────────────────────────────────────────────────────────────
  const addQuestion = async (type) => {
    if (!selectedExam) return;
    setAddingQuestion(true);
    try {
      const newQ = await dataClient.entities.ExamQuestion.create({
        exam_id: selectedExam.id,
        ordem: questions.length + 1,
        type,
        text: "",
        points: 1,
        options: type === "multiple_choice"
          ? [makeEmptyOption(0), makeEmptyOption(1), makeEmptyOption(2), makeEmptyOption(3)]
          : [],
        correct_answer: type === "true_false" ? "V" : null,
      });
      setQuestions((prev) => [...prev, { ...newQ, isDirty: false }]);
    } finally {
      setAddingQuestion(false);
    }
  };

  // ── Local question edit ───────────────────────────────────────────────────────
  const editQ = (id, changes) =>
    setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, ...changes, isDirty: true } : q));

  const setCorrectOption = (qId, optId) => {
    const q = questions.find((x) => x.id === qId);
    if (!q) return;
    editQ(qId, { options: q.options.map((o) => ({ ...o, is_correct: o.id === optId })) });
  };

  const addOption = (qId) => {
    const q = questions.find((x) => x.id === qId);
    if (!q || q.options.length >= 5) return;
    editQ(qId, { options: [...q.options, makeEmptyOption(q.options.length)] });
  };

  const updateOption = (qId, optId, text) => {
    const q = questions.find((x) => x.id === qId);
    if (!q) return;
    editQ(qId, { options: q.options.map((o) => o.id === optId ? { ...o, text } : o) });
  };

  const removeOption = (qId, optId) => {
    const q = questions.find((x) => x.id === qId);
    if (!q || q.options.length <= 2) return;
    const filtered = q.options.filter((o) => o.id !== optId);
    const hasCorrect = filtered.some((o) => o.is_correct);
    if (!hasCorrect) filtered[0].is_correct = true;
    editQ(qId, { options: filtered });
  };

  // ── Save question ─────────────────────────────────────────────────────────────
  const saveQuestion = async (q) => {
    setSavingId(q.id);
    try {
      await dataClient.entities.ExamQuestion.update(q.id, {
        type: q.type, text: q.text, image_url: q.image_url ?? null,
        points: Number(q.points) || 1,
        options: q.options, correct_answer: q.correct_answer ?? null,
      });
      setQuestions((prev) => prev.map((x) => x.id === q.id ? { ...x, isDirty: false } : x));
      toast({ title: "Questão salva." });
    } catch (err) {
      toast({ title: "Erro ao salvar questão.", description: err?.message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  // ── Image upload ──────────────────────────────────────────────────────────────
  const handleImageUpload = async (qId, file) => {
    setUploadingImageId(qId);
    try {
      const { file_url } = await dataClient.integrations.Core.UploadFile({ file });
      const q = questions.find((x) => x.id === qId);
      const updated = { ...q, image_url: file_url, isDirty: true };
      setQuestions((prev) => prev.map((x) => x.id === qId ? updated : x));
      // Auto-save image immediately
      await dataClient.entities.ExamQuestion.update(qId, { image_url: file_url });
      setQuestions((prev) => prev.map((x) => x.id === qId ? { ...x, isDirty: false } : x));
      toast({ title: "Imagem enviada." });
    } catch {
      toast({ title: "Erro ao enviar imagem.", variant: "destructive" });
    } finally {
      setUploadingImageId(null);
    }
  };

  // ── Delete question ───────────────────────────────────────────────────────────
  const confirmDeleteQuestion = async () => {
    if (!deleteQTarget) return;
    await dataClient.entities.ExamQuestion.delete(deleteQTarget.id);
    const remaining = questions
      .filter((q) => q.id !== deleteQTarget.id)
      .map((q, i) => ({ ...q, ordem: i + 1 }));
    setQuestions(remaining);
    // Update order in DB
    for (const q of remaining) {
      await dataClient.entities.ExamQuestion.update(q.id, { ordem: q.ordem });
    }
    setDeleteQTarget(null);
    toast({ title: "Questão excluída." });
  };

  // ── Reorder ───────────────────────────────────────────────────────────────────
  const moveQuestion = async (id, dir) => {
    const idx = questions.findIndex((q) => q.id === id);
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= questions.length) return;
    const reordered = [...questions];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    const updated = reordered.map((q, i) => ({ ...q, ordem: i + 1 }));
    setQuestions(updated);
    await Promise.all([
      dataClient.entities.ExamQuestion.update(updated[idx].id, { ordem: updated[idx].ordem }),
      dataClient.entities.ExamQuestion.update(updated[target].id, { ordem: updated[target].ordem }),
    ]);
  };

  // ── Exam form ─────────────────────────────────────────────────────────────────
  const openNewExam = () => {
    setEditingExam(null);
    setExamForm({ title: "", description: "", passing_score: "60", training_title: "" });
    setExamFormError(null);
    setShowExamForm(true);
  };

  const openEditExam = (exam) => {
    setEditingExam(exam);
    setExamForm({
      title: exam.title || "", description: exam.description || "",
      passing_score: String(exam.passing_score ?? 60), training_title: exam.training_title || "",
    });
    setExamFormError(null);
    setShowExamForm(true);
  };

  const handleExamSubmit = (e) => {
    e.preventDefault();
    setExamFormError(null);
    if (!examForm.title.trim()) { setExamFormError("Informe o título da prova."); return; }
    const payload = {
      title: examForm.title.trim(), description: examForm.description.trim() || null,
      passing_score: Number(examForm.passing_score) || 60,
      training_title: examForm.training_title.trim() || null,
    };
    if (editingExam) updateExamMutation.mutate({ id: editingExam.id, payload });
    else createExamMutation.mutate(payload);
  };

  const publicLink = (exam) =>
    `${window.location.origin}${createPageUrl("PublicExam")}?exam=${exam.id}`;

  const copyLink = (exam) => {
    navigator.clipboard.writeText(publicLink(exam)).then(() =>
      toast({ title: "Link copiado!", description: "Envie para os participantes." })
    );
  };

  // ── Render: question list view ────────────────────────────────────────────────
  if (view === "questions" && selectedExam) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setView("list")} className="gap-1.5">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800">{selectedExam.title}</h1>
            <p className="text-xs text-slate-400">
              Aprovação: {selectedExam.passing_score}% ·{" "}
              {questions.length} questão{questions.length !== 1 ? "ões" : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => copyLink(selectedExam)}>
            <Copy className="h-3.5 w-3.5" /> Link da prova
          </Button>
        </div>

        {/* Add question buttons */}
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-slate-500 self-center mr-1">Adicionar questão:</span>
          {Object.entries(Q_TYPE_LABELS).map(([type, label]) => {
            const Icon = Q_TYPE_ICONS[type];
            return (
              <Button key={type} size="sm" variant="outline" disabled={addingQuestion}
                className="gap-1.5 h-8 text-xs" onClick={() => addQuestion(type)}>
                {addingQuestion ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                {label}
              </Button>
            );
          })}
        </div>

        {loadingQuestions ? (
          <div className="flex justify-center py-12 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando questões...
          </div>
        ) : questions.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-slate-400">
            <ClipboardCheck className="h-12 w-12 text-slate-200" />
            <p>Nenhuma questão ainda. Clique em "Adicionar questão" acima.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((q, idx) => {
              const TypeIcon = Q_TYPE_ICONS[q.type] || List;
              const isSaving = savingId === q.id;
              const isUploading = uploadingImageId === q.id;
              return (
                <Card key={q.id} className={`border-slate-200 ${q.isDirty ? "border-amber-300" : ""}`}>
                  <CardHeader className="pb-2 pt-3 px-4">
                    <div className="flex items-center gap-2">
                      {/* Reorder */}
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button onClick={() => moveQuestion(q.id, "up")} disabled={idx === 0}
                          className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-20">
                          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor"><path d="M6 2l4 6H2z"/></svg>
                        </button>
                        <button onClick={() => moveQuestion(q.id, "down")} disabled={idx === questions.length - 1}
                          className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-20">
                          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor"><path d="M6 10L2 4h8z"/></svg>
                        </button>
                      </div>
                      <span className="text-sm font-bold text-slate-400 w-6 shrink-0">Q{idx + 1}</span>
                      <Badge className={`${Q_TYPE_COLORS[q.type]} text-xs shrink-0`}>
                        <TypeIcon className="h-3 w-3 mr-1" />{Q_TYPE_LABELS[q.type]}
                      </Badge>
                      <div className="flex items-center gap-1 ml-auto">
                        <span className="text-xs text-slate-400 mr-1">pts:</span>
                        <Input type="number" min="0.5" step="0.5" value={q.points}
                          onChange={(e) => editQ(q.id, { points: e.target.value })}
                          className="h-6 w-14 text-xs text-center p-1" />
                        {q.isDirty && (
                          <Button size="sm" disabled={isSaving} onClick={() => saveQuestion(q)}
                            className="h-7 text-xs gap-1 ml-1 bg-amber-500 hover:bg-amber-600 text-white">
                            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            Salvar
                          </Button>
                        )}
                        {!q.isDirty && !isSaving && (
                          <CheckCircle2 className="h-4 w-4 text-green-400 ml-1" />
                        )}
                        <button onClick={() => setDeleteQTarget(q)}
                          className="ml-1 text-slate-300 hover:text-red-500 p-1">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="px-4 pb-4 space-y-3">
                    {/* Enunciado */}
                    <div>
                      <Label className="text-xs text-slate-500 mb-1">Enunciado</Label>
                      <Textarea value={q.text} rows={2} placeholder="Digite o enunciado da questão..."
                        className="text-sm resize-none"
                        onChange={(e) => editQ(q.id, { text: e.target.value })} />
                    </div>

                    {/* Imagem */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {q.image_url ? (
                        <>
                          <img src={q.image_url} alt="imagem da questão"
                            className="h-24 rounded-lg border border-slate-200 object-cover" />
                          <button onClick={() => editQ(q.id, { image_url: null })}
                            className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                            <X className="h-3 w-3" /> Remover imagem
                          </button>
                        </>
                      ) : (
                        <label className="cursor-pointer">
                          <input type="file" accept="image/*" className="hidden"
                            onChange={(e) => e.target.files?.[0] && handleImageUpload(q.id, e.target.files[0])} />
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 border border-dashed border-slate-300 rounded-lg px-3 py-2 hover:border-blue-400 hover:text-blue-500 transition-colors">
                            {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Image className="h-3.5 w-3.5" />}
                            {isUploading ? "Enviando..." : "Adicionar imagem"}
                          </span>
                        </label>
                      )}
                    </div>

                    {/* Type-specific content */}
                    {q.type === "true_false" && (
                      <div>
                        <Label className="text-xs text-slate-500 mb-2">Resposta correta</Label>
                        <div className="flex gap-2">
                          {["V", "F"].map((val) => (
                            <button key={val} onClick={() => editQ(q.id, { correct_answer: val })}
                              className={`w-14 h-10 rounded-lg font-bold text-sm border-2 transition-all
                                ${q.correct_answer === val
                                  ? val === "V" ? "border-green-500 bg-green-50 text-green-700" : "border-red-500 bg-red-50 text-red-700"
                                  : "border-slate-200 text-slate-400 hover:border-slate-400"}`}>
                              {val}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {q.type === "multiple_choice" && (
                      <div className="space-y-2">
                        <Label className="text-xs text-slate-500">Opções (marque a correta)</Label>
                        {q.options.map((opt, oi) => (
                          <div key={opt.id} className="flex items-center gap-2">
                            <button onClick={() => setCorrectOption(q.id, opt.id)}
                              className={`shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors
                                ${opt.is_correct ? "border-green-500 bg-green-500" : "border-slate-300 hover:border-green-400"}`}>
                              {opt.is_correct && <div className="h-2 w-2 rounded-full bg-white" />}
                            </button>
                            <span className="shrink-0 text-xs font-bold text-slate-400 w-4">
                              {OPTION_LETTERS[oi]}
                            </span>
                            <Input value={opt.text} placeholder={`Opção ${OPTION_LETTERS[oi]}...`}
                              className="h-8 text-sm flex-1"
                              onChange={(e) => updateOption(q.id, opt.id, e.target.value)} />
                            {q.options.length > 2 && (
                              <button onClick={() => removeOption(q.id, opt.id)}
                                className="shrink-0 text-slate-300 hover:text-red-500">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        {q.options.length < 5 && (
                          <Button type="button" size="sm" variant="ghost"
                            className="h-7 text-xs gap-1 text-slate-400 pl-7"
                            onClick={() => addOption(q.id)}>
                            <Plus className="h-3 w-3" /> Adicionar opção
                          </Button>
                        )}
                      </div>
                    )}

                    {q.type === "essay" && (
                      <p className="text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2">
                        Questão dissertativa — o participante escreve a resposta livremente. Correção manual.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Delete question confirm */}
        <AlertDialog open={!!deleteQTarget} onOpenChange={(v) => !v && setDeleteQTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir questão?</AlertDialogTitle>
              <AlertDialogDescription>
                A questão Q{(questions.findIndex((q) => q.id === deleteQTarget?.id) ?? 0) + 1} será excluída permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={confirmDeleteQuestion}>
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ── Render: exam list ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Provas"
        subtitle="Crie e gerencie provas para os treinamentos"
        action={openNewExam}
        actionLabel="Nova Prova"
      />

      {isLoading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando...
        </div>
      ) : exams.length === 0 ? (
        <div className="flex flex-col items-center py-20 gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
            <ClipboardCheck className="h-8 w-8 text-slate-300" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-slate-600">Nenhuma prova criada ainda.</p>
            <p className="text-sm text-slate-400 mt-1">Crie a primeira prova e adicione questões.</p>
          </div>
          <Button onClick={openNewExam} className="gap-2 text-white" style={{ background: "hsl(var(--primary))" }}>
            <Plus className="h-4 w-4" /> Criar primeira prova
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {exams.map((exam) => (
            <Card key={exam.id} className={`border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col ${!exam.is_active ? "opacity-60" : ""}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base font-bold text-slate-800 leading-snug flex-1">
                    {exam.title}
                  </CardTitle>
                  <button onClick={() => toggleActiveMutation.mutate({ id: exam.id, is_active: !exam.is_active })}
                    title={exam.is_active ? "Desativar" : "Ativar"}
                    className="shrink-0 text-slate-400 hover:text-slate-600 mt-0.5">
                    {exam.is_active
                      ? <ToggleRight className="h-5 w-5 text-green-500" />
                      : <ToggleLeft className="h-5 w-5" />}
                  </button>
                </div>
                {exam.training_title && (
                  <p className="text-xs text-slate-400 mt-0.5">{exam.training_title}</p>
                )}
              </CardHeader>
              <CardContent className="flex-1 pt-0 space-y-3">
                <div className="flex gap-3 text-sm">
                  <div className="flex-1 bg-slate-50 rounded-lg p-2 text-center">
                    <p className="text-xs text-slate-400">Aprovação</p>
                    <p className="font-bold text-slate-700">{exam.passing_score}%</p>
                  </div>
                  <div className="flex-1 bg-slate-50 rounded-lg p-2 text-center">
                    <p className="text-xs text-slate-400">Status</p>
                    <p className={`font-bold text-xs ${exam.is_active ? "text-green-600" : "text-slate-400"}`}>
                      {exam.is_active ? "Ativa" : "Inativa"}
                    </p>
                  </div>
                </div>
                {exam.description && (
                  <p className="text-xs text-slate-500 line-clamp-2">{exam.description}</p>
                )}
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
                  <Button size="sm" className="gap-1 h-7 text-xs text-white flex-1"
                    style={{ background: "hsl(var(--primary))" }}
                    onClick={() => openQuestions(exam)}>
                    <List className="h-3.5 w-3.5" /> Questões
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs"
                    onClick={() => copyLink(exam)}>
                    <Copy className="h-3.5 w-3.5" /> Link
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-blue-600"
                    onClick={() => openEditExam(exam)}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-300 hover:text-red-500"
                    onClick={() => setDeleteExamTarget(exam)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Exam form dialog */}
      <Dialog open={showExamForm} onOpenChange={(v) => !v && setShowExamForm(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingExam ? "Editar Prova" : "Nova Prova"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleExamSubmit} className="space-y-4">
            <div>
              <Label>Título da prova *</Label>
              <Input className="mt-1" value={examForm.title}
                onChange={(e) => setExamForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Prova de Oftalmologia Sanitária" />
            </div>
            <div>
              <Label>Treinamento vinculado</Label>
              <Input className="mt-1" value={examForm.training_title}
                onChange={(e) => setExamForm((f) => ({ ...f, training_title: e.target.value }))}
                placeholder="Nome do treinamento" list="trainings-list" />
              <datalist id="trainings-list">
                {validTrainings.map((t) => <option key={t.id} value={t.title || ""} />)}
              </datalist>
            </div>
            <div>
              <Label>Nota mínima para aprovação (%)</Label>
              <Input className="mt-1" type="number" min="1" max="100" value={examForm.passing_score}
                onChange={(e) => setExamForm((f) => ({ ...f, passing_score: e.target.value }))} />
            </div>
            <div>
              <Label>Descrição / instruções</Label>
              <Textarea className="mt-1 resize-none" rows={3} value={examForm.description}
                onChange={(e) => setExamForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Instruções para os participantes..." />
            </div>
            {examFormError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {examFormError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowExamForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createExamMutation.isPending || updateExamMutation.isPending}
                className="text-white" style={{ background: "hsl(var(--primary))" }}>
                {editingExam ? "Salvar" : "Criar Prova"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete exam confirm */}
      <AlertDialog open={!!deleteExamTarget} onOpenChange={(v) => !v && setDeleteExamTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir prova?</AlertDialogTitle>
            <AlertDialogDescription>
              A prova "<strong>{deleteExamTarget?.title}</strong>" e todas as suas questões serão excluídas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteExamMutation.mutate(deleteExamTarget.id)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
