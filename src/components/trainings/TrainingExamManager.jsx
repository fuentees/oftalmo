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
  List, Search, Download, Users, BarChart2, Clock,
  ChevronDown, ChevronUp, FileBarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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

  const [expandedQuestions, setExpandedQuestions] = useState(new Set());
  const toggleQuestion = (id) =>
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

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
  const [resultsExamId, setResultsExamId]       = useState("");
  const [searchSub, setSearchSub]               = useState("");
  const [selectedParticipant, setSelectedParticipant] = useState(null);

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

  // Unified list: all enrolled + merge with submission result
  const allParticipantsWithStatus = useMemo(() => {
    if (!resultsExamId) return [];
    const submissionByParticipant = new Map(
      submissions
        .filter((s) => s.training_participant_id)
        .map((s) => [s.training_participant_id, s])
    );
    // Enrolled participants merged with their submission
    const withStatus = enrolledParticipants.map((p) => {
      const sub = submissionByParticipant.get(p.id);
      return {
        id: p.id,
        name: p.professional_name || "—",
        municipality: p.municipality || "—",
        gve: p.health_region || "—",
        submission: sub || null,
        status: sub ? (sub.passed ? "aprovado" : "reprovado") : "pendente",
        percentage: sub ? Math.round(Number(sub.percentage || 0)) : null,
        submittedAt: sub?.submitted_at || null,
      };
    });
    // Also add anonymous submissions (no training_participant_id)
    const anonSubs = submissions.filter((s) => !s.training_participant_id);
    const anonRows = anonSubs.map((s) => ({
      id: s.id,
      name: s.participant_name || "—",
      municipality: "—",
      gve: "—",
      submission: s,
      status: s.passed ? "aprovado" : "reprovado",
      percentage: Math.round(Number(s.percentage || 0)),
      submittedAt: s.submitted_at || null,
    }));
    return [...withStatus, ...anonRows];
  }, [enrolledParticipants, submissions, resultsExamId]);

  const filteredParticipants = useMemo(() => {
    const q = searchSub.trim().toLowerCase();
    if (!q) return allParticipantsWithStatus;
    return allParticipantsWithStatus.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.municipality.toLowerCase().includes(q) ||
      p.gve.toLowerCase().includes(q)
    );
  }, [allParticipantsWithStatus, searchSub]);

  const pendingCount  = allParticipantsWithStatus.filter((p) => p.status === "pendente").length;
  const approvedCount = allParticipantsWithStatus.filter((p) => p.status === "aprovado").length;
  const rejectedCount = allParticipantsWithStatus.filter((p) => p.status === "reprovado").length;

  // Detailed per-question report
  const questionReport = useMemo(() => {
    if (!resultsQuestions.length || !submissions.length) return [];
    const OPTION_LETTERS = ["A","B","C","D","E"];
    return resultsQuestions.map((q, i) => {
      const answered = submissions.map((s) => s.answers?.[q.id]).filter((a) => a !== undefined && a !== null && a !== "");
      const totalAnswered = answered.length;
      if (q.type === "multiple_choice") {
        const optionCounts = (q.options || []).map((opt, oi) => ({
          ...opt,
          letter: OPTION_LETTERS[oi] || String(oi + 1),
          count: answered.filter((a) => a === opt.id).length,
          pct: totalAnswered > 0 ? Math.round((answered.filter((a) => a === opt.id).length / totalAnswered) * 100) : 0,
        }));
        return { ...q, qNum: i + 1, totalAnswered, optionCounts };
      }
      if (q.type === "true_false") {
        const vCount = answered.filter((a) => a === "V").length;
        const fCount = answered.filter((a) => a === "F").length;
        return {
          ...q, qNum: i + 1, totalAnswered,
          tfCounts: [
            { label: "V", count: vCount, pct: totalAnswered > 0 ? Math.round((vCount / totalAnswered) * 100) : 0, isCorrect: q.correct_answer === "V" },
            { label: "F", count: fCount, pct: totalAnswered > 0 ? Math.round((fCount / totalAnswered) * 100) : 0, isCorrect: q.correct_answer === "F" },
          ],
        };
      }
      // essay
      const essayAnswers = submissions.map((s) => ({
        name: allParticipantsWithStatus.find((p) => p.submission?.id === s.id)?.name || s.participant_name || "—",
        text: String(s.answers?.[q.id] || "").trim(),
      })).filter((a) => a.text);
      return { ...q, qNum: i + 1, totalAnswered, essayAnswers };
    });
  }, [resultsQuestions, submissions, allParticipantsWithStatus]);

  const exportCSV = () => {
    const rows = [
      ["Nome","Município","GVE","Nota (%)","Resultado","Data"],
      ...allParticipantsWithStatus.map((p) => [
        p.name, p.municipality, p.gve,
        p.percentage !== null ? p.percentage : "",
        p.status === "aprovado" ? "Aprovado" : p.status === "reprovado" ? "Reprovado" : "Pendente",
        p.submittedAt ? format(new Date(p.submittedAt),"dd/MM/yyyy HH:mm") : "",
      ]),
    ];
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
                  {/* Stats cards — always on top */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="Total"      value={stats.total}                   color="blue"/>
                    <StatCard label="Aprovados"  value={stats.passed}  sub={`${Math.round((stats.passed/stats.total)*100)}%`}  color="green"/>
                    <StatCard label="Reprovados" value={stats.failed}  sub={`${Math.round((stats.failed/stats.total)*100)}%`}  color="red"/>
                    <StatCard label="Média"      value={`${Math.round(stats.avgPct)}%`} sub={`Mínimo: ${resultsExam?.passing_score}%`} color="slate"/>
                  </div>

                  {/* Sub-tabs */}
                  <Tabs defaultValue="visao_geral">
                    <TabsList>
                      <TabsTrigger value="visao_geral" className="gap-1.5">
                        <BarChart2 className="h-3.5 w-3.5" /> Visão Geral
                      </TabsTrigger>
                      <TabsTrigger value="por_questao" className="gap-1.5">
                        <FileBarChart2 className="h-3.5 w-3.5" /> Por Questão
                      </TabsTrigger>
                      <TabsTrigger value="participantes" className="gap-1.5">
                        <Users className="h-3.5 w-3.5" /> Participantes
                        <span className="ml-1 bg-slate-200 text-slate-600 rounded-full px-1.5 py-0 text-[10px] font-bold">
                          {allParticipantsWithStatus.length}
                        </span>
                      </TabsTrigger>
                    </TabsList>

                    {/* ── Visão Geral ── */}
                    <TabsContent value="visao_geral" className="mt-4 space-y-4">
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
                    </TabsContent>

                    {/* ── Por Questão ── */}
                    <TabsContent value="por_questao" className="mt-4 space-y-3">
                      {questionReport.length === 0 ? (
                        <p className="text-center py-10 text-slate-400 text-sm">Nenhuma questão com respostas ainda.</p>
                      ) : (
                        questionReport.map((q) => {
                        const isExpanded = expandedQuestions.has(q.id);
                        const correctCount =
                          q.type === "multiple_choice"
                            ? (q.optionCounts || []).find((o) => o.is_correct)?.count ?? 0
                            : q.type === "true_false"
                            ? (q.tfCounts || []).find((o) => o.isCorrect)?.count ?? 0
                            : null;
                        const accuracy =
                          correctCount !== null && q.totalAnswered > 0
                            ? Math.round((correctCount / q.totalAnswered) * 100)
                            : null;

                        return (
                          <Card key={q.id} className="border-slate-200 overflow-hidden">
                            {/* Question header — always visible, click to expand */}
                            <button
                              type="button"
                              className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors"
                              onClick={() => toggleQuestion(q.id)}
                            >
                              <span className="shrink-0 text-xs font-bold text-slate-400 mt-0.5 w-6">Q{q.qNum}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800 text-left">{q.text || "(sem enunciado)"}</p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <Badge className={`${
                                    q.type === "multiple_choice" ? "bg-blue-100 text-blue-700"
                                    : q.type === "true_false" ? "bg-green-100 text-green-700"
                                    : "bg-purple-100 text-purple-700"
                                  } text-xs`}>
                                    {q.type === "multiple_choice" ? "Múltipla Escolha"
                                      : q.type === "true_false" ? "V / F"
                                      : "Dissertativa"}
                                  </Badge>
                                  <span className="text-xs text-slate-400">{q.totalAnswered} resposta{q.totalAnswered !== 1 ? "s" : ""}</span>
                                  {accuracy !== null && (
                                    <span className={`text-xs font-semibold ${accuracy >= Number(resultsExam?.passing_score || 60) ? "text-green-600" : "text-orange-500"}`}>
                                      {accuracy}% de acerto
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className="shrink-0 text-slate-400 mt-0.5">
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </span>
                            </button>

                            {/* Expanded detail */}
                            {isExpanded && (
                              <div className="border-t border-slate-100 px-4 py-4 space-y-4 bg-slate-50/30">
                                {q.image_url && (
                                  <img src={q.image_url} alt="imagem" className="max-h-40 rounded-lg border border-slate-200 object-contain" />
                                )}

                                {/* Multiple choice */}
                                {q.type === "multiple_choice" && (
                                  <div className="space-y-2.5">
                                    {(q.optionCounts || []).map((opt) => (
                                      <div key={opt.id}>
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className={`shrink-0 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center
                                            ${opt.is_correct ? "bg-green-500 text-white" : "bg-slate-200 text-slate-600"}`}>
                                            {opt.letter}
                                          </span>
                                          <span className={`text-sm flex-1 ${opt.is_correct ? "font-semibold text-green-700" : "text-slate-700"}`}>
                                            {opt.text || "(sem texto)"}
                                          </span>
                                          <span className="shrink-0 text-xs font-bold text-slate-600 tabular-nums w-16 text-right">
                                            {opt.count} ({opt.pct}%)
                                          </span>
                                          {opt.is_correct && (
                                            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                          )}
                                        </div>
                                        <div className="ml-7 h-2 bg-slate-200 rounded-full overflow-hidden">
                                          <div
                                            className={`h-full rounded-full transition-all ${opt.is_correct ? "bg-green-400" : "bg-slate-400"}`}
                                            style={{ width: `${opt.pct}%` }}
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* True/False */}
                                {q.type === "true_false" && (
                                  <div className="space-y-2.5">
                                    {(q.tfCounts || []).map((tf) => (
                                      <div key={tf.label}>
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className={`shrink-0 text-sm font-bold w-8 h-8 rounded-lg flex items-center justify-center border-2
                                            ${tf.isCorrect ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 bg-white text-slate-600"}`}>
                                            {tf.label}
                                          </span>
                                          <span className={`text-sm flex-1 font-medium ${tf.isCorrect ? "text-green-700" : "text-slate-600"}`}>
                                            {tf.isCorrect ? "✅ Resposta correta" : "Incorreto"}
                                          </span>
                                          <span className="shrink-0 text-xs font-bold text-slate-600 tabular-nums">
                                            {tf.count} ({tf.pct}%)
                                          </span>
                                        </div>
                                        <div className="ml-10 h-2 bg-slate-200 rounded-full overflow-hidden">
                                          <div
                                            className={`h-full rounded-full ${tf.isCorrect ? "bg-green-400" : "bg-red-300"}`}
                                            style={{ width: `${tf.pct}%` }}
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Essay answers */}
                                {q.type === "essay" && (
                                  <div className="space-y-2">
                                    {(q.essayAnswers || []).length === 0 ? (
                                      <p className="text-xs text-slate-400">Nenhuma resposta registrada.</p>
                                    ) : (
                                      (q.essayAnswers || []).map((a, ai) => (
                                        <div key={ai} className="bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                                          <p className="text-xs font-semibold text-slate-500 mb-1">{a.name}</p>
                                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{a.text}</p>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </Card>
                        );
                      })
                  )}
                </TabsContent>

                {/* ── Participantes ── */}
                <TabsContent value="participantes" className="mt-4">
                  <Card className="border-slate-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                          <CardTitle className="text-sm font-semibold text-slate-700">
                            Participantes ({allParticipantsWithStatus.length})
                          </CardTitle>
                          <div className="flex gap-1.5">
                            <Badge className="bg-green-100 text-green-700 text-xs gap-1">
                              <CheckCircle2 className="h-3 w-3" />{approvedCount}
                            </Badge>
                            <Badge className="bg-red-100 text-red-700 text-xs">
                              {rejectedCount} reprov.
                            </Badge>
                            <Badge className="bg-amber-100 text-amber-700 text-xs gap-1">
                              <Clock className="h-3 w-3" />{pendingCount} pendente{pendingCount !== 1 ? "s" : ""}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <Input value={searchSub} onChange={(e) => setSearchSub(e.target.value)}
                              placeholder="Buscar por nome, município ou GVE..."
                              className="h-8 pl-8 text-xs w-52" />
                          </div>
                          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={exportCSV}>
                            <Download className="h-3.5 w-3.5" /> CSV
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50">
                              <TableHead className="font-semibold text-xs">Participante</TableHead>
                              <TableHead className="font-semibold text-xs hidden sm:table-cell">Município</TableHead>
                              <TableHead className="font-semibold text-xs hidden md:table-cell">GVE</TableHead>
                              <TableHead className="font-semibold text-xs text-center">Nota</TableHead>
                              <TableHead className="font-semibold text-xs text-center">Resultado</TableHead>
                              <TableHead className="font-semibold text-xs text-right hidden lg:table-cell">Respondeu em</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredParticipants.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} className="py-8 text-center text-slate-400 text-sm">
                                  Nenhum participante encontrado.
                                </TableCell>
                              </TableRow>
                            ) : (
                              filteredParticipants.map((p) => (
                                <TableRow key={p.id}>
                                  <TableCell className="font-medium text-slate-800 text-sm">
                                    {p.submission ? (
                                      <button
                                        className="text-left hover:underline hover:text-blue-600 transition-colors"
                                        onClick={() => setSelectedParticipant(p)}
                                      >
                                        {p.name}
                                      </button>
                                    ) : p.name}
                                  </TableCell>
                                  <TableCell className="text-slate-500 text-sm hidden sm:table-cell">{p.municipality}</TableCell>
                                  <TableCell className="text-slate-500 text-sm hidden md:table-cell">{p.gve}</TableCell>
                                  <TableCell className="text-center font-bold tabular-nums text-sm">
                                    {p.percentage !== null ? `${p.percentage}%` : "—"}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Badge className={
                                      p.status === "aprovado" ? "bg-green-100 text-green-700"
                                      : p.status === "reprovado" ? "bg-red-100 text-red-700"
                                      : "bg-amber-100 text-amber-700"
                                    }>
                                      {p.status === "aprovado" ? "Aprovado"
                                        : p.status === "reprovado" ? "Reprovado"
                                        : "Pendente"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right text-xs text-slate-400 hidden lg:table-cell">
                                    {p.submittedAt ? format(new Date(p.submittedAt), "dd/MM/yyyy HH:mm") : "—"}
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

              </Tabs>
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

      {/* Participant answers detail */}
      <Dialog open={!!selectedParticipant} onOpenChange={(v) => !v && setSelectedParticipant(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedParticipant && (() => {
            const p = selectedParticipant;
            const answers = p.submission?.answers || {};
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3 flex-wrap">
                    <span>{p.name}</span>
                    <Badge className={
                      p.status === "aprovado" ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                    }>
                      {p.status === "aprovado" ? "Aprovado" : "Reprovado"} — {p.percentage}%
                    </Badge>
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-3 mt-2">
                  {resultsQuestions.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-6">Questões não disponíveis.</p>
                  )}
                  {resultsQuestions.map((q, i) => {
                    const answer = answers[q.id];
                    const unanswered = answer === undefined || answer === null || answer === "";

                    let isCorrect = null;
                    let answerLabel = null;
                    let correctLabel = null;

                    if (q.type === "true_false") {
                      isCorrect = unanswered ? null : answer === q.correct_answer;
                      answerLabel = unanswered ? "—" : answer;
                      correctLabel = q.correct_answer;
                    } else if (q.type === "multiple_choice") {
                      const chosenOpt = (q.options || []).find((o) => o.id === answer);
                      const correctOpt = (q.options || []).find((o) => o.is_correct);
                      const letters = ["A","B","C","D","E"];
                      const chosenIdx = (q.options || []).findIndex((o) => o.id === answer);
                      const correctIdx = (q.options || []).findIndex((o) => o.is_correct);
                      isCorrect = unanswered ? null : chosenOpt?.is_correct;
                      answerLabel = unanswered ? "—" : `${letters[chosenIdx] ?? "?"}) ${chosenOpt?.text || ""}`;
                      correctLabel = correctOpt ? `${letters[correctIdx] ?? "?"}) ${correctOpt.text}` : null;
                    }

                    const borderColor = unanswered
                      ? "border-slate-200"
                      : isCorrect === true
                      ? "border-green-300 bg-green-50/30"
                      : "border-red-300 bg-red-50/30";

                    return (
                      <div key={q.id} className={`rounded-lg border px-4 py-3 space-y-2 ${borderColor}`}>
                        <div className="flex items-start gap-2">
                          <span className="shrink-0 text-xs font-bold text-slate-400 mt-0.5 w-6">Q{i+1}</span>
                          <p className="text-sm text-slate-800 flex-1">{q.text || "(sem enunciado)"}</p>
                          {!unanswered && isCorrect !== null && (
                            <span className={`shrink-0 text-xs font-bold ${isCorrect ? "text-green-600" : "text-red-600"}`}>
                              {isCorrect ? "✓ Certo" : "✗ Errou"}
                            </span>
                          )}
                          {unanswered && <span className="shrink-0 text-xs text-slate-400">Não respondeu</span>}
                        </div>

                        {q.type !== "essay" && (
                          <div className="ml-8 space-y-1 text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-500 w-20 shrink-0">Respondeu:</span>
                              <span className={`font-medium ${
                                unanswered ? "text-slate-400 italic"
                                : isCorrect ? "text-green-700"
                                : "text-red-700"
                              }`}>{answerLabel}</span>
                            </div>
                            {!isCorrect && !unanswered && correctLabel && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-500 w-20 shrink-0">Correto:</span>
                                <span className="font-medium text-green-700">{correctLabel}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {q.type === "essay" && (
                          <div className="ml-8 text-xs">
                            <span className="text-slate-500">Resposta: </span>
                            <span className="text-slate-700 whitespace-pre-wrap">
                              {unanswered ? <em className="text-slate-400">Não respondeu</em> : String(answer)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

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
