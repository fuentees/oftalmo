import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  Plus, Trash2, Edit, Loader2, Image, X, Copy, CheckCircle2,
  ClipboardCheck, Save, ToggleLeft, ToggleRight, AlignLeft,
  List, Search, Download, Users, BarChart2, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";

// ── Constants ─────────────────────────────────────────────────────────────────
const Q_TYPE_LABELS = { multiple_choice: "Múltipla Escolha", true_false: "V / F", essay: "Dissertativa" };
const Q_TYPE_COLORS = { multiple_choice: "bg-blue-100 text-blue-700", true_false: "bg-green-100 text-green-700", essay: "bg-purple-100 text-purple-700" };
const OPTION_LETTERS = ["A","B","C","D","E"];
const PIE_COLORS = ["#22c55e","#ef4444"];
const SCORE_BINS = [
  { label:"0–19%",  min:0,   max:20  },
  { label:"20–39%", min:20,  max:40  },
  { label:"40–59%", min:40,  max:60  },
  { label:"60–79%", min:60,  max:80  },
  { label:"80–99%", min:80,  max:100 },
  { label:"100%",   min:100, max:101 },
];

function makeEmptyOption(idx) {
  return { id: OPTION_LETTERS[idx].toLowerCase(), text: "", is_correct: idx === 0 };
}

// ── Subcomponents ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "slate" }) {
  const C = {
    green: { bg:"bg-green-50",  border:"border-green-200",  text:"text-green-700",  lbl:"text-green-500"  },
    red:   { bg:"bg-red-50",    border:"border-red-200",    text:"text-red-700",    lbl:"text-red-500"    },
    blue:  { bg:"bg-blue-50",   border:"border-blue-200",   text:"text-blue-700",   lbl:"text-blue-500"   },
    slate: { bg:"bg-slate-50",  border:"border-slate-200",  text:"text-slate-700",  lbl:"text-slate-500"  },
  }[color] || {};
  return (
    <div className={`rounded-xl border p-3 ${C.bg} ${C.border}`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${C.lbl}`}>{label}</p>
      <p className={`text-2xl font-black leading-none mt-0.5 ${C.text}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function TrainingExamManager({ trainingId, trainingTitle }) {
  const qc = useQueryClient();

  // ── Exam form ──────────────────────────────────────────────────────────────
  const [showExamForm, setShowExamForm]   = useState(false);
  const [editingExam, setEditingExam]     = useState(null);
  const [examForm, setExamForm]           = useState({ title: "", description: "", passing_score: "60" });
  const [examFormError, setExamFormError] = useState(null);
  const [deleteExamTarget, setDeleteExamTarget] = useState(null);

  // ── Questions ──────────────────────────────────────────────────────────────
  const [selectedExam, setSelectedExam]   = useState(null);
  const [questions, setQuestions]         = useState([]);
  const [loadingQs, setLoadingQs]         = useState(false);
  const [savingId, setSavingId]           = useState(null);
  const [uploadImgId, setUploadImgId]     = useState(null);
  const [addingQ, setAddingQ]             = useState(false);
  const [deleteQTarget, setDeleteQTarget] = useState(null);

  // ── Results ────────────────────────────────────────────────────────────────
  const [resultsExamId, setResultsExamId] = useState("");
  const [searchSub, setSearchSub]         = useState("");

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: exams = [], isLoading: loadingExams } = useQuery({
    queryKey: ["exams", trainingId],
    queryFn: () => dataClient.entities.Exam.filter({ training_id: trainingId }, "-created_at"),
    enabled: !!trainingId,
  });

  const { data: enrolledParticipants = [] } = useQuery({
    queryKey: ["trainingParticipants", trainingId],
    queryFn: () => dataClient.entities.TrainingParticipant.filter({ training_id: trainingId }),
    enabled: !!trainingId,
    select: (data) => (Array.isArray(data) ? data.filter((p) => p.enrollment_status !== "cancelado") : []),
  });

  const { data: submissions = [], isLoading: loadingSubs } = useQuery({
    queryKey: ["examSubmissions", resultsExamId],
    queryFn: () =>
      resultsExamId
        ? dataClient.entities.ExamSubmission.filter({ exam_id: resultsExamId }, "-submitted_at")
        : Promise.resolve([]),
    enabled: !!resultsExamId,
  });

  const { data: resultsQuestions = [] } = useQuery({
    queryKey: ["examQuestions", resultsExamId],
    queryFn: () =>
      resultsExamId
        ? dataClient.entities.ExamQuestion.filter({ exam_id: resultsExamId }, "ordem")
        : Promise.resolve([]),
    enabled: !!resultsExamId,
  });

  // ── Exam CRUD ──────────────────────────────────────────────────────────────
  const createExamMutation = useMutation({
    mutationFn: (p) => dataClient.entities.Exam.create(p),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["exams", trainingId] });
      toast({ title: "Prova criada." });
      setShowExamForm(false);
      openQuestionsForExam(created);
    },
    onError: (err) => setExamFormError(err?.message || "Erro ao criar prova."),
  });

  const updateExamMutation = useMutation({
    mutationFn: ({ id, p }) => dataClient.entities.Exam.update(id, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exams", trainingId] }); toast({ title: "Prova atualizada." }); setShowExamForm(false); },
    onError: (err) => setExamFormError(err?.message || "Erro."),
  });

  const deleteExamMutation = useMutation({
    mutationFn: (id) => dataClient.entities.Exam.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exams", trainingId] });
      toast({ title: "Prova excluída." });
      setDeleteExamTarget(null);
      if (selectedExam?.id === deleteExamTarget?.id) setSelectedExam(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => dataClient.entities.Exam.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exams", trainingId] }),
  });

  // ── Open questions for exam ────────────────────────────────────────────────
  const openQuestionsForExam = async (exam) => {
    setSelectedExam(exam);
    setLoadingQs(true);
    try {
      const qs = await dataClient.entities.ExamQuestion.filter({ exam_id: exam.id }, "ordem");
      setQuestions(Array.isArray(qs) ? qs.map((q) => ({ ...q, isDirty: false })) : []);
    } finally {
      setLoadingQs(false);
    }
  };

  // ── Question ops ───────────────────────────────────────────────────────────
  const addQuestion = async (type) => {
    if (!selectedExam) return;
    setAddingQ(true);
    try {
      const newQ = await dataClient.entities.ExamQuestion.create({
        exam_id: selectedExam.id, ordem: questions.length + 1, type, text: "", points: 1,
        options: type === "multiple_choice"
          ? [0,1,2,3].map(makeEmptyOption) : [],
        correct_answer: type === "true_false" ? "V" : null,
      });
      setQuestions((p) => [...p, { ...newQ, isDirty: false }]);
    } finally { setAddingQ(false); }
  };

  const editQ = (id, changes) =>
    setQuestions((p) => p.map((q) => q.id === id ? { ...q, ...changes, isDirty: true } : q));

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
    if (!filtered.some((o) => o.is_correct)) filtered[0].is_correct = true;
    editQ(qId, { options: filtered });
  };

  const saveQuestion = async (q) => {
    setSavingId(q.id);
    try {
      await dataClient.entities.ExamQuestion.update(q.id, {
        type: q.type, text: q.text, image_url: q.image_url ?? null,
        points: Number(q.points) || 1, options: q.options, correct_answer: q.correct_answer ?? null,
      });
      setQuestions((p) => p.map((x) => x.id === q.id ? { ...x, isDirty: false } : x));
      toast({ title: "Questão salva." });
    } catch (err) {
      toast({ title: "Erro ao salvar.", description: err?.message, variant: "destructive" });
    } finally { setSavingId(null); }
  };

  const handleImageUpload = async (qId, file) => {
    setUploadImgId(qId);
    try {
      const { file_url } = await dataClient.integrations.Core.UploadFile({ file });
      await dataClient.entities.ExamQuestion.update(qId, { image_url: file_url });
      setQuestions((p) => p.map((x) => x.id === qId ? { ...x, image_url: file_url, isDirty: false } : x));
      toast({ title: "Imagem enviada." });
    } catch { toast({ title: "Erro ao enviar imagem.", variant: "destructive" }); }
    finally { setUploadImgId(null); }
  };

  const confirmDeleteQuestion = async () => {
    if (!deleteQTarget) return;
    await dataClient.entities.ExamQuestion.delete(deleteQTarget.id);
    const remaining = questions.filter((q) => q.id !== deleteQTarget.id).map((q, i) => ({ ...q, ordem: i + 1 }));
    setQuestions(remaining);
    await Promise.all(remaining.map((q) => dataClient.entities.ExamQuestion.update(q.id, { ordem: q.ordem })));
    setDeleteQTarget(null);
    toast({ title: "Questão excluída." });
  };

  const moveQuestion = async (id, dir) => {
    const idx = questions.findIndex((q) => q.id === id);
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= questions.length) return;
    const r = [...questions];
    [r[idx], r[target]] = [r[target], r[idx]];
    const updated = r.map((q, i) => ({ ...q, ordem: i + 1 }));
    setQuestions(updated);
    await Promise.all([
      dataClient.entities.ExamQuestion.update(updated[idx].id, { ordem: updated[idx].ordem }),
      dataClient.entities.ExamQuestion.update(updated[target].id, { ordem: updated[target].ordem }),
    ]);
  };

  // ── Exam form handlers ─────────────────────────────────────────────────────
  const openNewExam = () => {
    setEditingExam(null);
    setExamForm({ title: trainingTitle ? `Prova — ${trainingTitle}` : "", description: "", passing_score: "60" });
    setExamFormError(null);
    setShowExamForm(true);
  };
  const openEditExam = (exam) => {
    setEditingExam(exam);
    setExamForm({ title: exam.title||"", description: exam.description||"", passing_score: String(exam.passing_score??60) });
    setExamFormError(null);
    setShowExamForm(true);
  };
  const handleExamSubmit = (e) => {
    e.preventDefault();
    setExamFormError(null);
    if (!examForm.title.trim()) { setExamFormError("Informe o título."); return; }
    const p = {
      title: examForm.title.trim(), description: examForm.description.trim()||null,
      passing_score: Number(examForm.passing_score)||60,
      training_id: trainingId, training_title: trainingTitle||null,
    };
    if (editingExam) updateExamMutation.mutate({ id: editingExam.id, p });
    else createExamMutation.mutate(p);
  };

  const publicLink = (exam) => `${window.location.origin}${createPageUrl("PublicExam")}?exam=${exam.id}`;
  const copyLink = (exam) =>
    navigator.clipboard.writeText(publicLink(exam)).then(() =>
      toast({ title: "Link copiado!", description: "Envie para os participantes." })
    );

  // ── Results derived ────────────────────────────────────────────────────────
  const resultsExam = exams.find((e) => e.id === resultsExamId);
  const stats = useMemo(() => {
    if (!submissions.length) return null;
    const passed = submissions.filter((s) => s.passed).length;
    const avgPct = submissions.reduce((a, s) => a + Number(s.percentage||0), 0) / submissions.length;
    return { total: submissions.length, passed, failed: submissions.length - passed, avgPct };
  }, [submissions]);

  const pieData = useMemo(() => stats
    ? [{ name:"Aprovados", value:stats.passed }, { name:"Reprovados", value:stats.failed }]
    : [], [stats]);

  const scoreDistribution = useMemo(() =>
    SCORE_BINS.map(({ label, min, max }) => ({
      label,
      count: submissions.filter((s) => { const p = Number(s.percentage||0); return p>=min && (max===101?p>=100:p<max); }).length,
    })), [submissions]);

  const questionAccuracy = useMemo(() => {
    if (!resultsQuestions.length || !submissions.length) return [];
    return resultsQuestions.filter((q) => q.type !== "essay").map((q, i) => {
      const correct = submissions.filter((s) => {
        const ans = s.answers?.[q.id];
        if (!ans) return false;
        if (q.type === "true_false") return ans === q.correct_answer;
        if (q.type === "multiple_choice") return ans === (q.options||[]).find((o) => o.is_correct)?.id;
        return false;
      }).length;
      return { name:`Q${i+1}`, pct: Math.round((correct/submissions.length)*100), correct };
    });
  }, [resultsQuestions, submissions]);

  const filteredSubs = useMemo(() => {
    const q = searchSub.trim().toLowerCase();
    return !q ? submissions : submissions.filter((s) =>
      String(s.participant_name||"").toLowerCase().includes(q) ||
      String(s.participant_cpf||"").toLowerCase().includes(q)
    );
  }, [submissions, searchSub]);

  // Participants enrolled but haven't submitted yet
  const pendingParticipants = useMemo(() => {
    if (!enrolledParticipants.length || !resultsExamId) return [];
    const submittedIds = new Set(submissions.map((s) => s.training_participant_id).filter(Boolean));
    return enrolledParticipants.filter((p) => !submittedIds.has(p.id));
  }, [enrolledParticipants, submissions, resultsExamId]);

  const exportCSV = () => {
    const rows = [["Nome","CPF","Nota (%)","Aprovado","Data"],
      ...submissions.map((s) => [s.participant_name, s.participant_cpf||"",
        Math.round(Number(s.percentage||0)), s.passed?"Sim":"Não",
        s.submitted_at ? format(new Date(s.submitted_at),"dd/MM/yyyy HH:mm") : ""])];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g,'""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8;" }));
    a.download = `resultados_${resultsExam?.title?.replace(/\s+/g,"_")||"prova"}.csv`;
    a.click();
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <Tabs defaultValue="provas">
        <TabsList>
          <TabsTrigger value="provas" className="gap-1.5">
            <ClipboardCheck className="h-3.5 w-3.5" /> Questões
          </TabsTrigger>
          <TabsTrigger value="resultados" className="gap-1.5">
            <BarChart2 className="h-3.5 w-3.5" /> Resultados
          </TabsTrigger>
        </TabsList>

        {/* ── ABA QUESTÕES ─────────────────────────────────────────────────── */}
        <TabsContent value="provas" className="mt-5 space-y-5">
          {loadingExams ? (
            <div className="flex justify-center py-10 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : !selectedExam ? (
            <>
              {/* Exam list for this training */}
              {exams.length === 0 ? (
                <div className="flex flex-col items-center py-14 gap-3 text-slate-400">
                  <ClipboardCheck className="h-12 w-12 text-slate-200" />
                  <p className="text-sm">Nenhuma prova criada para este treinamento ainda.</p>
                  <Button onClick={openNewExam} className="gap-1.5 text-white" style={{ background:"hsl(var(--primary))" }}>
                    <Plus className="h-4 w-4" /> Criar Prova
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <Button size="sm" onClick={openNewExam} className="gap-1.5 text-white h-8 text-xs" style={{ background:"hsl(var(--primary))" }}>
                      <Plus className="h-3.5 w-3.5" /> Nova Prova
                    </Button>
                  </div>
                  {exams.map((exam) => (
                    <Card key={exam.id} className={`border-slate-200 ${!exam.is_active?"opacity-60":""}`}>
                      <CardContent className="py-3 px-4 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 text-sm">{exam.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5">Aprovação: {exam.passing_score}%</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => toggleMutation.mutate({ id:exam.id, is_active:!exam.is_active })}
                            title={exam.is_active?"Desativar":"Ativar"} className="text-slate-400 hover:text-slate-600">
                            {exam.is_active
                              ? <ToggleRight className="h-5 w-5 text-green-500" />
                              : <ToggleLeft className="h-5 w-5" />}
                          </button>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => copyLink(exam)}>
                            <Copy className="h-3 w-3" /> Link
                          </Button>
                          <Button size="sm" className="h-7 text-xs gap-1 text-white" style={{ background:"hsl(var(--primary))" }}
                            onClick={() => openQuestionsForExam(exam)}>
                            <List className="h-3 w-3" /> Questões
                          </Button>
                          <button onClick={() => openEditExam(exam)} className="p-1 text-slate-400 hover:text-blue-500">
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setDeleteExamTarget(exam)} className="p-1 text-slate-300 hover:text-red-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* ── Question editor ── */
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => setSelectedExam(null)} className="gap-1">
                  ← Voltar
                </Button>
                <div className="flex-1">
                  <p className="font-bold text-slate-800 text-sm">{selectedExam.title}</p>
                  <p className="text-xs text-slate-400">{questions.length} questão{questions.length!==1?"ões":""} · {selectedExam.passing_score}% para aprovação</p>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => copyLink(selectedExam)}>
                  <Copy className="h-3 w-3" /> Link
                </Button>
              </div>

              {/* Add question buttons */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-slate-500">Adicionar:</span>
                {Object.entries(Q_TYPE_LABELS).map(([type, label]) => (
                  <Button key={type} size="sm" variant="outline" disabled={addingQ}
                    className="h-7 text-xs gap-1" onClick={() => addQuestion(type)}>
                    {addingQ ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    {label}
                  </Button>
                ))}
              </div>

              {loadingQs ? (
                <div className="flex justify-center py-8 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando questões...
                </div>
              ) : questions.length === 0 ? (
                <p className="text-center py-10 text-slate-400 text-sm">Nenhuma questão ainda. Use os botões acima para adicionar.</p>
              ) : (
                questions.map((q, idx) => {
                  const isSaving = savingId === q.id;
                  const isUploading = uploadImgId === q.id;
                  return (
                    <Card key={q.id} className={`border-slate-200 ${q.isDirty?"border-amber-300":""}`}>
                      <CardHeader className="pb-1 pt-3 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <button onClick={() => moveQuestion(q.id,"up")} disabled={idx===0}
                              className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-20">
                              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor"><path d="M6 2l4 6H2z"/></svg>
                            </button>
                            <button onClick={() => moveQuestion(q.id,"down")} disabled={idx===questions.length-1}
                              className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-20">
                              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor"><path d="M6 10L2 4h8z"/></svg>
                            </button>
                          </div>
                          <span className="text-xs font-bold text-slate-400 w-6">Q{idx+1}</span>
                          <Badge className={`${Q_TYPE_COLORS[q.type]} text-xs`}>{Q_TYPE_LABELS[q.type]}</Badge>
                          <div className="flex items-center gap-1 ml-auto">
                            <span className="text-xs text-slate-400">pts:</span>
                            <Input type="number" min="0.5" step="0.5" value={q.points}
                              onChange={(e) => editQ(q.id,{points:e.target.value})}
                              className="h-6 w-12 text-xs text-center p-1" />
                            {q.isDirty && (
                              <Button size="sm" disabled={isSaving} onClick={() => saveQuestion(q)}
                                className="h-6 text-xs gap-1 ml-1 bg-amber-500 hover:bg-amber-600 text-white">
                                {isSaving ? <Loader2 className="h-3 w-3 animate-spin"/> : <Save className="h-3 w-3"/>}
                                Salvar
                              </Button>
                            )}
                            {!q.isDirty && !isSaving && <CheckCircle2 className="h-4 w-4 text-green-400 ml-1" />}
                            <button onClick={() => setDeleteQTarget(q)} className="ml-1 text-slate-300 hover:text-red-500 p-0.5">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-3 space-y-3">
                        <Textarea value={q.text} rows={2} placeholder="Enunciado da questão..."
                          className="text-sm resize-none"
                          onChange={(e) => editQ(q.id,{text:e.target.value})} />

                        {/* Image */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {q.image_url ? (
                            <>
                              <img src={q.image_url} alt="img" className="h-20 rounded-lg border border-slate-200 object-cover" />
                              <button onClick={() => editQ(q.id,{image_url:null})} className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                                <X className="h-3 w-3"/>Remover imagem
                              </button>
                            </>
                          ) : (
                            <label className="cursor-pointer">
                              <input type="file" accept="image/*" className="hidden"
                                onChange={(e) => e.target.files?.[0] && handleImageUpload(q.id, e.target.files[0])} />
                              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 border border-dashed border-slate-300 rounded-lg px-3 py-1.5 hover:border-blue-400 hover:text-blue-500 transition-colors">
                                {isUploading ? <Loader2 className="h-3 w-3 animate-spin"/> : <Image className="h-3 w-3"/>}
                                {isUploading ? "Enviando..." : "Adicionar imagem"}
                              </span>
                            </label>
                          )}
                        </div>

                        {/* V/F */}
                        {q.type === "true_false" && (
                          <div>
                            <Label className="text-xs text-slate-500 mb-1.5">Resposta correta</Label>
                            <div className="flex gap-2">
                              {["V","F"].map((v) => (
                                <button key={v} onClick={() => editQ(q.id,{correct_answer:v})}
                                  className={`w-12 h-9 rounded-lg font-bold text-sm border-2 transition-all
                                    ${q.correct_answer===v
                                      ? v==="V"?"border-green-500 bg-green-50 text-green-700":"border-red-500 bg-red-50 text-red-700"
                                      : "border-slate-200 text-slate-400 hover:border-slate-400"}`}>
                                  {v}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Multiple choice */}
                        {q.type === "multiple_choice" && (
                          <div className="space-y-2">
                            <Label className="text-xs text-slate-500">Opções (marque a correta)</Label>
                            {q.options.map((opt, oi) => (
                              <div key={opt.id} className="flex items-center gap-2">
                                <button onClick={() => setCorrectOption(q.id, opt.id)}
                                  className={`shrink-0 h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors
                                    ${opt.is_correct?"border-green-500 bg-green-500":"border-slate-300 hover:border-green-400"}`}>
                                  {opt.is_correct && <div className="h-1.5 w-1.5 rounded-full bg-white"/>}
                                </button>
                                <span className="text-xs font-bold text-slate-400 w-4 shrink-0">{OPTION_LETTERS[oi]}</span>
                                <Input value={opt.text} placeholder={`Opção ${OPTION_LETTERS[oi]}...`}
                                  className="h-7 text-xs flex-1"
                                  onChange={(e) => updateOption(q.id, opt.id, e.target.value)} />
                                {q.options.length > 2 && (
                                  <button onClick={() => removeOption(q.id, opt.id)} className="text-slate-300 hover:text-red-500 shrink-0">
                                    <X className="h-3 w-3"/>
                                  </button>
                                )}
                              </div>
                            ))}
                            {q.options.length < 5 && (
                              <Button type="button" size="sm" variant="ghost" className="h-6 text-xs gap-1 text-slate-400 pl-6"
                                onClick={() => addOption(q.id)}>
                                <Plus className="h-3 w-3"/> Opção
                              </Button>
                            )}
                          </div>
                        )}

                        {q.type === "essay" && (
                          <p className="text-xs text-purple-600 bg-purple-50 rounded px-2 py-1.5">
                            Dissertativa — correção manual
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </TabsContent>

        {/* ── ABA RESULTADOS ───────────────────────────────────────────────── */}
        <TabsContent value="resultados" className="mt-5 space-y-5">
          {exams.length === 0 ? (
            <p className="text-center py-10 text-slate-400 text-sm">Crie uma prova primeiro para ver os resultados.</p>
          ) : (
            <>
              {/* Exam selector */}
              {exams.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {exams.map((e) => (
                    <Button key={e.id} size="sm" variant={resultsExamId===e.id?"default":"outline"}
                      className="h-7 text-xs"
                      onClick={() => setResultsExamId(e.id)}>
                      {e.title}
                    </Button>
                  ))}
                </div>
              )}

              {/* Auto-select if only one exam */}
              {exams.length === 1 && !resultsExamId && (() => { setResultsExamId(exams[0].id); return null; })()}

              {!resultsExamId && exams.length > 1 && (
                <p className="text-sm text-slate-400 text-center py-6">Selecione uma prova acima.</p>
              )}

              {resultsExamId && loadingSubs && (
                <div className="flex justify-center py-8 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin mr-2"/>Carregando...
                </div>
              )}

              {resultsExamId && !loadingSubs && !stats && (
                <div className="flex flex-col items-center py-14 gap-3 text-slate-400">
                  <Users className="h-12 w-12 text-slate-200"/>
                  <p className="text-sm">Nenhuma resposta enviada ainda.</p>
                  <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => copyLink(exams.find(e=>e.id===resultsExamId)||exams[0])}>
                    <Copy className="h-3 w-3"/> Copiar link da prova
                  </Button>
                </div>
              )}

              {resultsExamId && !loadingSubs && stats && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="Total"      value={stats.total}                   color="blue"/>
                    <StatCard label="Aprovados"  value={stats.passed}  sub={`${Math.round((stats.passed/stats.total)*100)}%`}  color="green"/>
                    <StatCard label="Reprovados" value={stats.failed}  sub={`${Math.round((stats.failed/stats.total)*100)}%`}  color="red"/>
                    <StatCard label="Média"      value={`${Math.round(stats.avgPct)}%`} sub={`Mínimo: ${resultsExam?.passing_score}%`} color="slate"/>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <Card className="border-slate-200">
                      <CardHeader className="pb-1"><CardTitle className="text-xs text-slate-500">Aprovação</CardTitle></CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={180}>
                          <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                              dataKey="value" label={({name,value})=>`${name}: ${value}`}>
                              {pieData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i]}/>)}
                            </Pie>
                            <Tooltip/>
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200 lg:col-span-2">
                      <CardHeader className="pb-1"><CardTitle className="text-xs text-slate-500">Distribuição de Notas</CardTitle></CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={scoreDistribution}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                            <XAxis dataKey="label" tick={{fontSize:10}}/>
                            <YAxis allowDecimals={false} tick={{fontSize:10}}/>
                            <Tooltip/>
                            <Bar dataKey="count" name="Participantes" fill="hsl(var(--primary))" radius={[4,4,0,0]}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {questionAccuracy.length > 0 && (
                      <Card className="border-slate-200 lg:col-span-3">
                        <CardHeader className="pb-1"><CardTitle className="text-xs text-slate-500">Acerto por Questão (%)</CardTitle></CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={questionAccuracy}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                              <XAxis dataKey="name" tick={{fontSize:10}}/>
                              <YAxis domain={[0,100]} tickFormatter={v=>`${v}%`} tick={{fontSize:10}}/>
                              <Tooltip formatter={v=>[`${v}%`,"Acertos"]}/>
                              <Bar dataKey="pct" radius={[4,4,0,0]}>
                                {questionAccuracy.map((e,i)=>(
                                  <Cell key={i} fill={e.pct>=Number(resultsExam?.passing_score||60)?"#22c55e":"#f97316"}/>
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Pending participants */}
                  {pendingParticipants.length > 0 && (
                    <Card className="border-amber-200 bg-amber-50/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs text-amber-600 flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          Ainda não responderam ({pendingParticipants.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex flex-wrap gap-1.5">
                          {pendingParticipants.map((p) => (
                            <Badge key={p.id} variant="outline"
                              className="border-amber-300 text-amber-700 bg-white text-xs">
                              {p.professional_name}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Table */}
                  <Card className="border-slate-200">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <CardTitle className="text-xs text-slate-500">Respostas ({submissions.length})</CardTitle>
                        <div className="flex gap-2">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400"/>
                            <Input value={searchSub} onChange={(e)=>setSearchSub(e.target.value)}
                              placeholder="Buscar..." className="h-7 pl-8 text-xs w-40"/>
                          </div>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={exportCSV}>
                            <Download className="h-3 w-3"/> CSV
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="rounded-lg border border-slate-100 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                              <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500">Participante</th>
                              <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500">Nota</th>
                              <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500">Resultado</th>
                              <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 hidden sm:table-cell">Data</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredSubs.length===0 ? (
                              <tr><td colSpan={4} className="py-6 text-center text-slate-400 text-sm">Nenhum resultado.</td></tr>
                            ) : filteredSubs.map((s,i)=>(
                              <tr key={s.id} className={i%2===0?"bg-white":"bg-slate-50/30"}>
                                <td className="py-2 px-3 font-medium text-slate-800 text-sm">{s.participant_name}</td>
                                <td className="py-2 px-3 text-center font-bold tabular-nums text-sm">{Math.round(Number(s.percentage||0))}%</td>
                                <td className="py-2 px-3 text-center">
                                  <Badge className={s.passed?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}>
                                    {s.passed?"Aprovado":"Reprovado"}
                                  </Badge>
                                </td>
                                <td className="py-2 px-3 text-right text-xs text-slate-400 hidden sm:table-cell">
                                  {s.submitted_at ? format(new Date(s.submitted_at),"dd/MM/yyyy HH:mm") : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Exam form dialog */}
      <Dialog open={showExamForm} onOpenChange={(v)=>!v&&setShowExamForm(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingExam?"Editar Prova":"Nova Prova"}</DialogTitle></DialogHeader>
          <form onSubmit={handleExamSubmit} className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input className="mt-1" value={examForm.title}
                onChange={(e)=>setExamForm(f=>({...f,title:e.target.value}))} />
            </div>
            <div>
              <Label>Nota mínima para aprovação (%)</Label>
              <Input className="mt-1" type="number" min="1" max="100" value={examForm.passing_score}
                onChange={(e)=>setExamForm(f=>({...f,passing_score:e.target.value}))} />
            </div>
            <div>
              <Label>Descrição / instruções</Label>
              <Textarea className="mt-1 resize-none" rows={3} value={examForm.description}
                onChange={(e)=>setExamForm(f=>({...f,description:e.target.value}))}
                placeholder="Instruções para os participantes..." />
            </div>
            {examFormError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{examFormError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={()=>setShowExamForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createExamMutation.isPending||updateExamMutation.isPending}
                className="text-white" style={{background:"hsl(var(--primary))"}}>
                {editingExam?"Salvar":"Criar Prova"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete exam */}
      <AlertDialog open={!!deleteExamTarget} onOpenChange={(v)=>!v&&setDeleteExamTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir prova?</AlertDialogTitle>
            <AlertDialogDescription>
              "<strong>{deleteExamTarget?.title}</strong>" e todas as questões serão excluídas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={()=>deleteExamMutation.mutate(deleteExamTarget.id)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete question */}
      <AlertDialog open={!!deleteQTarget} onOpenChange={(v)=>!v&&setDeleteQTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir questão?</AlertDialogTitle>
            <AlertDialogDescription>Esta questão será excluída permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={confirmDeleteQuestion}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
