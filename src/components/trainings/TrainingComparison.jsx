import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Users, GraduationCap, Star, TrendingUp, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function calcStats(participants, trainingId) {
  const ps = participants.filter((p) => p.training_id === trainingId);
  const active = ps.filter((p) => String(p.enrollment_status || "").toLowerCase() !== "cancelado");
  const present = active.filter((p) => p.attendance_percentage >= 75 || p.attendance === "presente");
  const approved = active.filter((p) => p.approved === true);

  const grades = active
    .map((p) => Number(p.grade))
    .filter((g) => Number.isFinite(g) && g >= 0);
  const avgGrade = grades.length
    ? Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10) / 10
    : null;

  const municipalities = new Set(active.map((p) => p.municipality).filter(Boolean));
  const states = new Set(active.map((p) => p.state).filter(Boolean));

  return {
    total: active.length,
    present: present.length,
    approved: approved.length,
    attendanceRate: active.length ? Math.round((present.length / active.length) * 100) : 0,
    approvalRate: active.length ? Math.round((approved.length / active.length) * 100) : 0,
    avgGrade,
    municipalities: municipalities.size,
    states: states.size,
  };
}

function Delta({ a, b, unit = "" }) {
  if (a == null || b == null) return <span className="text-slate-400">—</span>;
  const diff = a - b;
  if (diff === 0) return <span className="text-slate-400 flex items-center gap-0.5"><Minus className="h-3 w-3" /> Igual</span>;
  return (
    <span className={`flex items-center gap-0.5 font-semibold text-xs ${diff > 0 ? "text-green-600" : "text-red-500"}`}>
      {diff > 0 ? "+" : ""}{diff}{unit}
    </span>
  );
}

const STAT_ROWS = [
  { key: "total", label: "Inscritos ativos", unit: "" },
  { key: "attendanceRate", label: "Taxa de presença", unit: "%" },
  { key: "approvalRate", label: "Taxa de aprovação", unit: "%" },
  { key: "avgGrade", label: "Nota média", unit: "" },
  { key: "municipalities", label: "Municípios", unit: "" },
  { key: "states", label: "Estados", unit: "" },
];

export default function TrainingComparison({ trainings, participants }) {
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");

  const trainingA = trainings.find((t) => t.id === idA);
  const trainingB = trainings.find((t) => t.id === idB);

  const statsA = useMemo(
    () => (idA ? calcStats(participants, idA) : null),
    [participants, idA]
  );
  const statsB = useMemo(
    () => (idB ? calcStats(participants, idB) : null),
    [participants, idB]
  );

  const chartData = useMemo(() => {
    if (!statsA || !statsB) return [];
    return [
      { name: "Presença", A: statsA.attendanceRate, B: statsB.attendanceRate },
      { name: "Aprovação", A: statsA.approvalRate, B: statsB.approvalRate },
    ];
  }, [statsA, statsB]);

  const trainingOptions = trainings
    .filter((t) => t.status !== "cancelado")
    .sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));

  return (
    <div className="space-y-6">
      {/* Seleção de turmas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Turma A</label>
          <Select value={idA} onValueChange={setIdA}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar treinamento..." />
            </SelectTrigger>
            <SelectContent>
              {trainingOptions.map((t) => (
                <SelectItem key={t.id} value={t.id} disabled={t.id === idB}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Turma B</label>
          <Select value={idB} onValueChange={setIdB}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar treinamento..." />
            </SelectTrigger>
            <SelectContent>
              {trainingOptions.map((t) => (
                <SelectItem key={t.id} value={t.id} disabled={t.id === idA}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {(!idA || !idB) && (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-2 rounded-xl border border-dashed border-slate-200">
          <TrendingUp className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-400">Selecione duas turmas para comparar.</p>
        </div>
      )}

      {idA && idB && statsA && statsB && (
        <>
          {/* Gráfico de comparação */}
          <Card className="border-slate-200">
            <CardHeader className="pb-2 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-700">Comparação visual</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 pb-2">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} barGap={4} barCategoryGap="40%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="A" name={trainingA?.title?.slice(0, 20) || "Turma A"} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="B" name={trainingB?.title?.slice(0, 20) || "Turma B"} fill="#94a3b8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Tabela comparativa */}
          <Card className="border-slate-200">
            <CardHeader className="pb-2 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-700">Detalhes comparativos</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 w-40">Indicador</th>
                      <th className="text-center px-4 py-3">
                        <div className="flex flex-col items-center gap-1">
                          <Badge className="bg-blue-100 text-blue-700 text-[10px] font-bold">A</Badge>
                          <span className="text-xs font-semibold text-slate-700 max-w-[140px] text-center leading-tight">{trainingA?.title}</span>
                        </div>
                      </th>
                      <th className="text-center px-4 py-3">
                        <div className="flex flex-col items-center gap-1">
                          <Badge className="bg-slate-200 text-slate-700 text-[10px] font-bold">B</Badge>
                          <span className="text-xs font-semibold text-slate-700 max-w-[140px] text-center leading-tight">{trainingB?.title}</span>
                        </div>
                      </th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Diferença (A−B)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STAT_ROWS.map((row, idx) => {
                      const vA = statsA[row.key];
                      const vB = statsB[row.key];
                      return (
                        <tr key={row.key} className={`border-b border-slate-50 ${idx % 2 === 0 ? "" : "bg-slate-50/50"}`}>
                          <td className="px-4 py-3 text-slate-600 font-medium text-sm">{row.label}</td>
                          <td className="px-4 py-3 text-center font-semibold text-slate-800">
                            {vA != null ? `${vA}${row.unit}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-slate-800">
                            {vB != null ? `${vB}${row.unit}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Delta a={vA} b={vB} unit={row.unit} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
