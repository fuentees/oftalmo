import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Loader2, BarChart2, Users, CheckCircle2, XCircle, Download,
  ChevronDown, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import PageHeader from "@/components/common/PageHeader";

const PIE_COLORS = ["#22c55e", "#ef4444"];

const SCORE_BINS = [
  { label: "0–19%",   min: 0,  max: 20  },
  { label: "20–39%",  min: 20, max: 40  },
  { label: "40–59%",  min: 40, max: 60  },
  { label: "60–79%",  min: 60, max: 80  },
  { label: "80–99%",  min: 80, max: 100 },
  { label: "100%",    min: 100,max: 101 },
];

function StatCard({ label, value, sub, color = "slate" }) {
  const colors = {
    green:  { bg: "bg-green-50",  border: "border-green-200",  text: "text-green-700",  label: "text-green-500"  },
    red:    { bg: "bg-red-50",    border: "border-red-200",    text: "text-red-700",    label: "text-red-500"    },
    blue:   { bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700",   label: "text-blue-500"   },
    slate:  { bg: "bg-slate-50",  border: "border-slate-200",  text: "text-slate-700",  label: "text-slate-500"  },
  };
  const c = colors[color] || colors.slate;
  return (
    <div className={`rounded-xl border p-4 ${c.bg} ${c.border}`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${c.label}`}>{label}</p>
      <p className={`text-3xl font-black leading-none mt-1 ${c.text}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function ExamResults() {
  const [selectedExamId, setSelectedExamId] = useState("");
  const [search, setSearch] = useState("");

  const { data: exams = [], isLoading: loadingExams } = useQuery({
    queryKey: ["exams"],
    queryFn: () => dataClient.entities.Exam.list("-created_at"),
  });

  const { data: submissions = [], isLoading: loadingSubs } = useQuery({
    queryKey: ["examSubmissions", selectedExamId],
    queryFn: () =>
      selectedExamId
        ? dataClient.entities.ExamSubmission.filter({ exam_id: selectedExamId }, "-submitted_at")
        : Promise.resolve([]),
    enabled: !!selectedExamId,
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["examQuestions", selectedExamId],
    queryFn: () =>
      selectedExamId
        ? dataClient.entities.ExamQuestion.filter({ exam_id: selectedExamId }, "ordem")
        : Promise.resolve([]),
    enabled: !!selectedExamId,
  });

  const selectedExam = exams.find((e) => e.id === selectedExamId);

  // ── Derived stats ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!submissions.length) return null;
    const passed  = submissions.filter((s) => s.passed).length;
    const failed  = submissions.length - passed;
    const avgPct  = submissions.reduce((acc, s) => acc + Number(s.percentage || 0), 0) / submissions.length;
    const highest = Math.max(...submissions.map((s) => Number(s.percentage || 0)));
    const lowest  = Math.min(...submissions.map((s) => Number(s.percentage || 0)));
    return { total: submissions.length, passed, failed, avgPct, highest, lowest };
  }, [submissions]);

  const pieData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: "Aprovados", value: stats.passed  },
      { name: "Reprovados", value: stats.failed },
    ];
  }, [stats]);

  const scoreDistribution = useMemo(() =>
    SCORE_BINS.map(({ label, min, max }) => ({
      label,
      count: submissions.filter((s) => {
        const p = Number(s.percentage || 0);
        return p >= min && (max === 101 ? p >= 100 : p < max);
      }).length,
    })),
    [submissions]
  );

  const questionAccuracy = useMemo(() => {
    if (!questions.length || !submissions.length) return [];
    return questions
      .filter((q) => q.type !== "essay")
      .map((q, i) => {
        const correct = submissions.filter((s) => {
          const ans = s.answers?.[q.id];
          if (!ans) return false;
          if (q.type === "true_false") return ans === q.correct_answer;
          if (q.type === "multiple_choice") {
            const correctOpt = (q.options || []).find((o) => o.is_correct);
            return ans === correctOpt?.id;
          }
          return false;
        }).length;
        return {
          name: `Q${i + 1}`,
          pct: Math.round((correct / submissions.length) * 100),
          correct,
          total: submissions.length,
        };
      });
  }, [questions, submissions]);

  // ── Filtered table ────────────────────────────────────────────────────────────
  const filteredSubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return submissions;
    return submissions.filter(
      (s) =>
        String(s.participant_name || "").toLowerCase().includes(q) ||
        String(s.participant_cpf  || "").toLowerCase().includes(q)
    );
  }, [submissions, search]);

  // ── Export CSV ────────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [
      ["Nome", "CPF", "Nota (%)", "Aprovado", "Data"],
      ...submissions.map((s) => [
        s.participant_name,
        s.participant_cpf || "",
        Math.round(Number(s.percentage || 0)),
        s.passed ? "Sim" : "Não",
        s.submitted_at ? format(new Date(s.submitted_at), "dd/MM/yyyy HH:mm") : "",
      ]),
    ];
    const csv  = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g,'""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `resultados_${selectedExam?.title?.replace(/\s+/g,"_") || "prova"}.csv`;
    a.click();
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Resultados de Provas"
        subtitle="Análise de desempenho e estatísticas por prova"
      />

      {/* Exam selector */}
      <div className="max-w-sm">
        <Select value={selectedExamId} onValueChange={setSelectedExamId}>
          <SelectTrigger>
            <SelectValue placeholder={loadingExams ? "Carregando..." : "Selecione uma prova"} />
          </SelectTrigger>
          <SelectContent>
            {exams.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedExamId && (
        <div className="flex flex-col items-center py-20 gap-3 text-slate-400">
          <BarChart2 className="h-14 w-14 text-slate-200" />
          <p>Selecione uma prova para ver os resultados.</p>
        </div>
      )}

      {selectedExamId && loadingSubs && (
        <div className="flex justify-center py-12 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando resultados...
        </div>
      )}

      {selectedExamId && !loadingSubs && (
        <>
          {/* Stats cards */}
          {!stats ? (
            <div className="flex flex-col items-center py-16 gap-3 text-slate-400">
              <Users className="h-12 w-12 text-slate-200" />
              <p>Nenhuma resposta enviada ainda para esta prova.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Total"      value={stats.total}                    color="blue" />
                <StatCard label="Aprovados"  value={stats.passed}  sub={`${Math.round((stats.passed/stats.total)*100)}%`}  color="green" />
                <StatCard label="Reprovados" value={stats.failed}  sub={`${Math.round((stats.failed/stats.total)*100)}%`}  color="red" />
                <StatCard label="Média"      value={`${Math.round(stats.avgPct)}%`} sub={`Mínimo: ${selectedExam?.passing_score}%`} color="slate" />
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Pie: aprovados vs reprovados */}
                <Card className="border-slate-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-600">Aprovação</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                          dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                          {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Bar: score distribution */}
                <Card className="border-slate-200 lg:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-600">Distribuição de Notas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={scoreDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" name="Participantes" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Bar: per-question accuracy */}
                {questionAccuracy.length > 0 && (
                  <Card className="border-slate-200 lg:col-span-3">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-slate-600">
                        Acerto por Questão (% corretos)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={questionAccuracy}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v, name) => [`${v}%`, "Acertos"]} />
                          <Bar dataKey="pct" name="Acertos" radius={[4,4,0,0]}>
                            {questionAccuracy.map((entry, i) => (
                              <Cell key={i} fill={entry.pct >= Number(selectedExam?.passing_score || 60) ? "#22c55e" : "#f97316"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <p className="text-xs text-slate-400 mt-2">
                        Verde = acerto ≥ {selectedExam?.passing_score}% dos participantes · Laranja = abaixo do esperado
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Submissions table */}
              <Card className="border-slate-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-sm font-semibold text-slate-600">
                      Respostas enviadas ({submissions.length})
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)}
                          placeholder="Buscar participante..." className="h-8 pl-8 text-xs w-48" />
                      </div>
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={exportCSV}>
                        <Download className="h-3.5 w-3.5" /> CSV
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
                          <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 hidden sm:table-cell">CPF</th>
                          <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500">Nota</th>
                          <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500">Resultado</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 hidden md:table-cell">Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSubs.length === 0 ? (
                          <tr><td colSpan={5} className="py-8 text-center text-slate-400 text-sm">Nenhum resultado encontrado</td></tr>
                        ) : (
                          filteredSubs.map((s, i) => (
                            <tr key={s.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/30"}>
                              <td className="py-2.5 px-3 font-medium text-slate-800">{s.participant_name}</td>
                              <td className="py-2.5 px-3 text-slate-500 text-xs hidden sm:table-cell">{s.participant_cpf || "—"}</td>
                              <td className="py-2.5 px-3 text-center font-bold tabular-nums">
                                {Math.round(Number(s.percentage || 0))}%
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <Badge className={s.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                                  {s.passed ? "Aprovado" : "Reprovado"}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-3 text-right text-xs text-slate-400 hidden md:table-cell">
                                {s.submitted_at ? format(new Date(s.submitted_at), "dd/MM/yyyy HH:mm") : "—"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
