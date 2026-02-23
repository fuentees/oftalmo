import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  BarChart3,
  ClipboardCheck,
  Copy,
  Loader2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  TRACOMA_TOTAL_QUESTIONS,
  buildAnswerKeyFromRows,
} from "@/lib/tracomaExamKappa";
import {
  getSupabaseErrorMessage,
  isMissingSupabaseTableError,
} from "@/lib/supabaseErrors";
import { formatDateSafe } from "@/lib/date";

const CHART_COLORS = ["#16a34a", "#f59e0b", "#2563eb", "#ef4444"];

const formatNumber = (value, digits = 3) => {
  if (value === null || value === undefined) return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return numeric.toFixed(digits);
};

const matrixChartFromResult = (result) => [
  { label: "a (1/1)", total: Number(result?.matrix_a || 0) },
  { label: "b (0/1)", total: Number(result?.matrix_b || 0) },
  { label: "c (1/0)", total: Number(result?.matrix_c || 0) },
  { label: "d (0/0)", total: Number(result?.matrix_d || 0) },
];

export default function TracomaExaminerEvaluationPage() {
  const queryString =
    window.location.search || window.location.hash.split("?")[1] || "";
  const urlParams = new URLSearchParams(queryString);
  const trainingId = String(urlParams.get("training") || "").trim();
  const [activeTab, setActiveTab] = useState("mask");
  const [search, setSearch] = useState("");
  const [selectedResult, setSelectedResult] = useState(null);

  const testLink = trainingId
    ? `${window.location.origin}/TracomaExaminerTest?training=${encodeURIComponent(
        trainingId
      )}`
    : "";

  const trainingQuery = useQuery({
    queryKey: ["tracoma-exam-training-management", trainingId],
    queryFn: async () => {
      const trainings = await dataClient.entities.Training.list("-date");
      return trainings.find((item) => String(item?.id || "") === trainingId) || null;
    },
    enabled: Boolean(trainingId),
  });
  const training = trainingQuery.data;

  const answerKeyQuery = useQuery({
    queryKey: ["tracoma-exam-answer-key-management"],
    queryFn: () =>
      dataClient.entities.TracomaExamAnswerKey.list("question_number"),
  });
  const answerKeyRows = answerKeyQuery.data || [];
  const answerKeyLoadError = answerKeyQuery.isError
    ? isMissingSupabaseTableError(answerKeyQuery.error, "tracoma_exam_answer_keys")
      ? "A tabela do gabarito de tracoma nao foi encontrada. Execute o script supabase/create_tracoma_exam_tables.sql."
      : getSupabaseErrorMessage(answerKeyQuery.error) ||
        "Nao foi possivel carregar o gabarito."
    : "";

  const answerKeyStatus = useMemo(() => {
    try {
      const values = buildAnswerKeyFromRows(answerKeyRows, TRACOMA_TOTAL_QUESTIONS);
      const positives = values.filter((value) => value === 1).length;
      const negatives = values.length - positives;
      return {
        values,
        positives,
        negatives,
        error: "",
      };
    } catch (error) {
      return {
        values: [],
        positives: 0,
        negatives: 0,
        error:
          error?.message ||
          "Gabarito padrao ouro nao esta completo para as 50 questoes.",
      };
    }
  }, [answerKeyRows]);

  const resultsQuery = useQuery({
    queryKey: ["tracoma-exam-results", trainingId],
    queryFn: () =>
      dataClient.entities.TracomaExamResult.filter(
        { training_id: trainingId },
        "-created_at"
      ),
    enabled: Boolean(trainingId),
  });
  const results = resultsQuery.data || [];
  const resultsLoadError = resultsQuery.isError
    ? isMissingSupabaseTableError(resultsQuery.error, "tracoma_exam_results")
      ? "A tabela de resultados de tracoma nao foi encontrada. Execute o script supabase/create_tracoma_exam_tables.sql."
      : getSupabaseErrorMessage(resultsQuery.error) ||
        "Nao foi possivel carregar o historico de desempenho."
    : "";

  const filteredResults = useMemo(() => {
    const searchTerm = String(search || "").trim().toLowerCase();
    if (!searchTerm) return results;
    return results.filter((row) =>
      String(row?.participant_name || "").toLowerCase().includes(searchTerm)
    );
  }, [results, search]);

  const historySummary = useMemo(() => {
    const total = results.length;
    const aptCount = results.filter(
      (row) => String(row?.aptitude_status || "").toLowerCase() === "apto"
    ).length;
    const retrainingCount = total - aptCount;
    const validKappas = results
      .map((row) => Number(row?.kappa))
      .filter((value) => Number.isFinite(value));
    const kappaAverage =
      validKappas.length > 0
        ? validKappas.reduce((sum, value) => sum + value, 0) / validKappas.length
        : null;

    return {
      total,
      aptCount,
      retrainingCount,
      kappaAverage,
      aptitudeChart: [
        { label: "Apto", total: aptCount },
        { label: "Necessita retreinamento", total: retrainingCount },
      ],
    };
  }, [results]);

  const historyColumns = [
    {
      header: "Formando",
      accessor: "participant_name",
      cellClassName: "font-medium",
    },
    {
      header: "Acertos",
      render: (row) =>
        `${row.total_matches || 0}/${row.total_questions || TRACOMA_TOTAL_QUESTIONS}`,
      sortType: "number",
    },
    {
      header: "Concordancia",
      render: (row) => `${formatNumber(Number(row.observed_agreement) * 100, 2)}%`,
      sortType: "number",
    },
    {
      header: "Kappa",
      accessor: "kappa",
      render: (row) => formatNumber(row.kappa, 3),
      sortType: "number",
    },
    {
      header: "Interpretacao",
      accessor: "interpretation",
    },
    {
      header: "Status",
      render: (row) => (
        <Badge
          className={
            String(row?.aptitude_status || "").toLowerCase() === "apto"
              ? "bg-green-100 text-green-700"
              : "bg-amber-100 text-amber-700"
          }
        >
          {row.aptitude_status || "-"}
        </Badge>
      ),
    },
    {
      header: "Data",
      accessor: "created_at",
      render: (row) => formatDateSafe(row.created_at, "dd/MM/yyyy HH:mm") || "-",
      sortType: "date",
    },
  ];

  const handleCopyLink = async () => {
    if (!testLink) return;
    try {
      await navigator.clipboard.writeText(testLink);
      window.alert("Link do teste copiado com sucesso.");
    } catch {
      window.alert("Nao foi possivel copiar o link.");
    }
  };

  if (!trainingId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Avaliacao de Examinadores de tracoma"
          subtitle="Teste de 50 questoes"
        />
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            Link invalido. Abra esta pagina a partir das acoes do treinamento.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (trainingQuery.isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!training) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Avaliacao de Examinadores de tracoma"
          subtitle="Treinamento nao encontrado"
        />
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            Treinamento nao encontrado para este link.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Avaliacao de Examinadores de tracoma - Teste de 50 Questoes"
        subtitle={`Treinamento: ${training.title}`}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-blue-600" />
            Aplicacao do teste padronizado
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={handleCopyLink}>
            <Copy className="h-4 w-4 mr-2" />
            Copiar link do teste
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.open(testLink, "_blank", "noopener,noreferrer")}
          >
            Aplicar em nova aba
          </Button>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="mask">Gabarito padrao ouro</TabsTrigger>
          <TabsTrigger value="history">Historico e desempenho</TabsTrigger>
        </TabsList>

        <TabsContent value="mask" className="space-y-4 mt-6">
          {answerKeyLoadError && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {answerKeyLoadError}
              </AlertDescription>
            </Alert>
          )}

          {!answerKeyLoadError && answerKeyStatus.error && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                {answerKeyStatus.error}
              </AlertDescription>
            </Alert>
          )}

          {!answerKeyLoadError && !answerKeyStatus.error && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-slate-500">Total de questoes</p>
                    <p className="text-3xl font-semibold">{TRACOMA_TOTAL_QUESTIONS}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-slate-500">Respostas positivas (1)</p>
                    <p className="text-3xl font-semibold">{answerKeyStatus.positives}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-slate-500">Respostas negativas (0)</p>
                    <p className="text-3xl font-semibold">{answerKeyStatus.negatives}</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Gabarito bloqueado (somente leitura)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
                    {answerKeyStatus.values.map((value, index) => (
                      <div
                        key={`answer-key-${index + 1}`}
                        className="rounded-md border bg-slate-50 px-2 py-2 text-center"
                      >
                        <p className="text-xs text-slate-500">
                          Q{String(index + 1).padStart(2, "0")}
                        </p>
                        <p className="text-lg font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-6">
          {resultsLoadError && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {resultsLoadError}
              </AlertDescription>
            </Alert>
          )}

          {!resultsLoadError && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-slate-500">Total de testes</p>
                    <p className="text-3xl font-semibold">{historySummary.total}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-slate-500">Aptos</p>
                    <p className="text-3xl font-semibold text-green-700">
                      {historySummary.aptCount}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-slate-500">Necessita retreinamento</p>
                    <p className="text-3xl font-semibold text-amber-700">
                      {historySummary.retrainingCount}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-slate-500">Kappa medio</p>
                    <p className="text-3xl font-semibold">
                      {formatNumber(historySummary.kappaAverage, 3)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {historySummary.total > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Distribuicao de aptidao
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={historySummary.aptitudeChart}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                            {historySummary.aptitudeChart.map((entry, index) => (
                              <Cell
                                key={`aptitude-bar-${entry.label}`}
                                fill={CHART_COLORS[index % CHART_COLORS.length]}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={historySummary.aptitudeChart}
                            dataKey="total"
                            nameKey="label"
                            outerRadius={80}
                            label
                          >
                            {historySummary.aptitudeChart.map((entry, index) => (
                              <Cell
                                key={`aptitude-pie-${entry.label}`}
                                fill={CHART_COLORS[index % CHART_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Historico de desempenho</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="Buscar por nome do formando..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <DataTable
                    columns={historyColumns}
                    data={filteredResults}
                    isLoading={resultsQuery.isLoading}
                    emptyMessage="Nenhum resultado registrado ainda."
                    onRowClick={(row) => setSelectedResult(row)}
                  />
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(selectedResult)} onOpenChange={() => setSelectedResult(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalhes do desempenho</DialogTitle>
          </DialogHeader>

          {selectedResult && (
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Formando</p>
                    <p className="font-semibold">{selectedResult.participant_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Data</p>
                    <p className="font-semibold">
                      {formatDateSafe(selectedResult.created_at, "dd/MM/yyyy HH:mm") || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Kappa</p>
                    <p className="font-semibold">{formatNumber(selectedResult.kappa, 3)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">IC95%</p>
                    <p className="font-semibold">
                      {formatNumber(selectedResult.kappa_ci_low, 3)} a{" "}
                      {formatNumber(selectedResult.kappa_ci_high, 3)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Sensibilidade</p>
                    <p className="font-semibold">
                      {formatNumber(selectedResult.sensitivity, 3)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Especificidade</p>
                    <p className="font-semibold">
                      {formatNumber(selectedResult.specificity, 3)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Concordancia observada</p>
                    <p className="font-semibold">
                      {formatNumber(Number(selectedResult.observed_agreement) * 100, 2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Status</p>
                    <Badge
                      className={
                        String(selectedResult?.aptitude_status || "").toLowerCase() ===
                        "apto"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }
                    >
                      {selectedResult.aptitude_status || "-"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Matriz 2x2</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full border text-sm">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="border px-3 py-2"></th>
                          <th className="border px-3 py-2">Formando = 1</th>
                          <th className="border px-3 py-2">Formando = 0</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border px-3 py-2 font-medium">Padrao = 1</td>
                          <td className="border px-3 py-2">
                            {selectedResult.matrix_a || 0}
                          </td>
                          <td className="border px-3 py-2">
                            {selectedResult.matrix_c || 0}
                          </td>
                        </tr>
                        <tr>
                          <td className="border px-3 py-2 font-medium">Padrao = 0</td>
                          <td className="border px-3 py-2">
                            {selectedResult.matrix_b || 0}
                          </td>
                          <td className="border px-3 py-2">
                            {selectedResult.matrix_d || 0}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={matrixChartFromResult(selectedResult)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="total" fill="#2563eb" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
