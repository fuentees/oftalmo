import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Loader2,
  Plus,
  Search,
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
  buildAnswerKeyCollections,
  normalizeAnswerKeyCode,
  normalizeBinaryAnswer,
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

const parseStoredAnswers = (value, totalQuestions = TRACOMA_TOTAL_QUESTIONS) => {
  if (!Array.isArray(value) || value.length !== totalQuestions) return null;
  const parsed = value.map((item) => normalizeBinaryAnswer(item));
  if (parsed.some((item) => item === null)) return null;
  return parsed;
};

const matrixChartFromResult = (result) => [
  { label: "a (1/1)", total: Number(result?.matrix_a || 0) },
  { label: "b (0/1)", total: Number(result?.matrix_b || 0) },
  { label: "c (1/0)", total: Number(result?.matrix_c || 0) },
  { label: "d (0/0)", total: Number(result?.matrix_d || 0) },
];

const buildQuestionColumns = (totalQuestions = TRACOMA_TOTAL_QUESTIONS) => {
  const items = Array.from({ length: totalQuestions }, (_, index) => index + 1);
  const half = Math.ceil(totalQuestions / 2);
  return [items.slice(0, half), items.slice(half)];
};

export default function TracomaExaminerEvaluationPage() {
  const queryString =
    window.location.search || window.location.hash.split("?")[1] || "";
  const urlParams = new URLSearchParams(queryString);
  const trainingId = String(urlParams.get("training") || "").trim();
  const initialKeyCode = normalizeAnswerKeyCode(urlParams.get("key"));

  const [activeTab, setActiveTab] = useState("mask");
  const [search, setSearch] = useState("");
  const [historyKeyFilter, setHistoryKeyFilter] = useState("all");
  const [monitorKeyFilter, setMonitorKeyFilter] = useState("all");
  const [monitorPersonFilter, setMonitorPersonFilter] = useState("");
  const [selectedMaskKeyCode, setSelectedMaskKeyCode] = useState("");
  const [selectedResult, setSelectedResult] = useState(null);
  const [newMaskDialogOpen, setNewMaskDialogOpen] = useState(false);
  const [newMaskCode, setNewMaskCode] = useState("");
  const [newMaskAnswers, setNewMaskAnswers] = useState({});
  const [maskActionStatus, setMaskActionStatus] = useState(null);
  const queryClient = useQueryClient();

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
    queryFn: () => dataClient.entities.TracomaExamAnswerKey.list("question_number"),
  });
  const answerKeyRows = answerKeyQuery.data || [];
  const answerKeyLoadError = answerKeyQuery.isError
    ? isMissingSupabaseTableError(answerKeyQuery.error, "tracoma_exam_answer_keys")
      ? "A tabela do gabarito de tracoma nao foi encontrada. Execute o script supabase/create_tracoma_exam_tables.sql."
      : getSupabaseErrorMessage(answerKeyQuery.error) ||
        "Nao foi possivel carregar o gabarito."
    : "";

  const answerKeyCollections = useMemo(
    () => buildAnswerKeyCollections(answerKeyRows, TRACOMA_TOTAL_QUESTIONS),
    [answerKeyRows]
  );

  useEffect(() => {
    if (!answerKeyCollections.length) return;
    const hasInitial = answerKeyCollections.some(
      (item) => item.code === initialKeyCode
    );
    if (!selectedMaskKeyCode) {
      setSelectedMaskKeyCode(hasInitial ? initialKeyCode : answerKeyCollections[0].code);
      return;
    }
    const hasCurrent = answerKeyCollections.some(
      (item) => item.code === selectedMaskKeyCode
    );
    if (!hasCurrent) {
      setSelectedMaskKeyCode(answerKeyCollections[0].code);
    }
  }, [answerKeyCollections, initialKeyCode, selectedMaskKeyCode]);

  const selectedMaskKey = useMemo(
    () =>
      answerKeyCollections.find((item) => item.code === selectedMaskKeyCode) || null,
    [answerKeyCollections, selectedMaskKeyCode]
  );

  const answerKeyByCode = useMemo(() => {
    const map = new Map();
    answerKeyCollections.forEach((item) => {
      if (item.answers && !item.error) {
        map.set(item.code, item.answers);
      }
    });
    return map;
  }, [answerKeyCollections]);

  const testLink = trainingId
    ? `${window.location.origin}/TracomaExaminerTest?training=${encodeURIComponent(
        trainingId
      )}${selectedMaskKeyCode ? `&key=${encodeURIComponent(selectedMaskKeyCode)}` : ""}`
    : "";

  const resultsQuery = useQuery({
    queryKey: ["tracoma-exam-results", trainingId],
    queryFn: () =>
      dataClient.entities.TracomaExamResult.filter(
        { training_id: trainingId },
        "-created_at"
      ),
    enabled: Boolean(trainingId),
  });
  const rawResults = resultsQuery.data || [];
  const results = useMemo(
    () =>
      rawResults.map((row) => ({
        ...row,
        answer_key_code: normalizeAnswerKeyCode(row?.answer_key_code || "E2"),
      })),
    [rawResults]
  );

  const resultsLoadError = resultsQuery.isError
    ? isMissingSupabaseTableError(resultsQuery.error, "tracoma_exam_results")
      ? "A tabela de resultados de tracoma nao foi encontrada. Execute o script supabase/create_tracoma_exam_tables.sql."
      : getSupabaseErrorMessage(resultsQuery.error) ||
        "Nao foi possivel carregar o historico de desempenho."
    : "";

  const availableKeyCodes = useMemo(() => {
    const codes = new Set(answerKeyCollections.map((item) => item.code));
    results.forEach((row) => {
      if (row.answer_key_code) codes.add(row.answer_key_code);
    });
    return Array.from(codes).sort((a, b) =>
      String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base" })
    );
  }, [answerKeyCollections, results]);

  const existingAnswerKeyCodes = useMemo(
    () => new Set(answerKeyCollections.map((item) => item.code)),
    [answerKeyCollections]
  );

  const maskQuestionColumns = useMemo(
    () => buildQuestionColumns(TRACOMA_TOTAL_QUESTIONS),
    []
  );

  const newMaskAnsweredCount = useMemo(
    () =>
      Array.from({ length: TRACOMA_TOTAL_QUESTIONS }, (_, index) => index + 1).filter(
        (questionNumber) =>
          normalizeBinaryAnswer(newMaskAnswers[questionNumber]) !== null
      ).length,
    [newMaskAnswers]
  );

  const filteredHistory = useMemo(() => {
    const searchTerm = String(search || "").trim().toLowerCase();
    return results.filter((row) => {
      const matchesKey =
        historyKeyFilter === "all" || row.answer_key_code === historyKeyFilter;
      const matchesSearch =
        !searchTerm ||
        String(row?.participant_name || "").toLowerCase().includes(searchTerm);
      return matchesKey && matchesSearch;
    });
  }, [results, historyKeyFilter, search]);

  const historySummary = useMemo(() => {
    const total = filteredHistory.length;
    const aptCount = filteredHistory.filter(
      (row) => String(row?.aptitude_status || "").toLowerCase() === "apto"
    ).length;
    const retrainingCount = total - aptCount;
    const validKappas = filteredHistory
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
  }, [filteredHistory]);

  const monitorFilteredResults = useMemo(() => {
    const personTerm = String(monitorPersonFilter || "").trim().toLowerCase();
    return results.filter((row) => {
      const matchesKey =
        monitorKeyFilter === "all" || row.answer_key_code === monitorKeyFilter;
      const matchesPerson =
        !personTerm ||
        String(row?.participant_name || "").toLowerCase().includes(personTerm);
      return matchesKey && matchesPerson;
    });
  }, [results, monitorKeyFilter, monitorPersonFilter]);

  const monitorQuestionStats = useMemo(() => {
    const totals = Array.from({ length: TRACOMA_TOTAL_QUESTIONS }, (_, index) => ({
      questionNumber: index + 1,
      correct: 0,
      wrong: 0,
      total: 0,
    }));

    monitorFilteredResults.forEach((row) => {
      const keyCode = normalizeAnswerKeyCode(row?.answer_key_code || "E2");
      const answerKey = answerKeyByCode.get(keyCode);
      const traineeAnswers = parseStoredAnswers(row?.answers);
      if (!answerKey || !traineeAnswers) return;

      for (let i = 0; i < TRACOMA_TOTAL_QUESTIONS; i += 1) {
        const expected = answerKey[i];
        const observed = traineeAnswers[i];
        const item = totals[i];
        item.total += 1;
        if (observed === expected) {
          item.correct += 1;
        } else {
          item.wrong += 1;
        }
      }
    });

    return totals.map((item) => ({
      ...item,
      accuracyPercent:
        item.total > 0 ? (item.correct / item.total) * 100 : null,
    }));
  }, [monitorFilteredResults, answerKeyByCode]);

  const selectedResultDetails = useMemo(() => {
    if (!selectedResult) return null;
    const keyCode = normalizeAnswerKeyCode(selectedResult?.answer_key_code || "E2");
    const answerKey = answerKeyByCode.get(keyCode);
    const traineeAnswers = parseStoredAnswers(selectedResult?.answers);
    if (!answerKey || !traineeAnswers) {
      return {
        keyCode,
        rows: [],
        wrongQuestions: [],
        error:
          "Nao foi possivel reconstruir as respostas deste teste (gabarito ou respostas invalidas).",
      };
    }

    const rows = Array.from({ length: TRACOMA_TOTAL_QUESTIONS }, (_, index) => {
      const questionNumber = index + 1;
      const expected = answerKey[index];
      const observed = traineeAnswers[index];
      const isCorrect = expected === observed;
      return {
        questionNumber,
        expected,
        observed,
        isCorrect,
      };
    });
    const wrongQuestions = rows
      .filter((row) => !row.isCorrect)
      .map((row) => row.questionNumber);

    return {
      keyCode,
      rows,
      wrongQuestions,
      error: "",
    };
  }, [selectedResult, answerKeyByCode]);

  const historyColumns = [
    {
      header: "Formando",
      accessor: "participant_name",
      cellClassName: "font-medium",
    },
    {
      header: "Teste",
      accessor: "answer_key_code",
      render: (row) => row.answer_key_code || "-",
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

  const monitorQuestionColumns = [
    {
      header: "Questao",
      render: (row) => String(row.questionNumber).padStart(2, "0"),
      sortType: "number",
    },
    {
      header: "Acertos",
      accessor: "correct",
      sortType: "number",
    },
    {
      header: "Erros",
      accessor: "wrong",
      sortType: "number",
    },
    {
      header: "Taxa de acerto",
      render: (row) =>
        row.accuracyPercent === null
          ? "-"
          : `${formatNumber(row.accuracyPercent, 2)}%`,
      sortType: "number",
    },
  ];

  const detailColumns = [
    {
      header: "Questao",
      render: (row) => String(row.questionNumber).padStart(2, "0"),
      sortType: "number",
    },
    {
      header: "Gabarito",
      accessor: "expected",
      sortType: "number",
    },
    {
      header: "Formando",
      accessor: "observed",
      sortType: "number",
    },
    {
      header: "Status",
      render: (row) =>
        row.isCorrect ? (
          <Badge className="bg-green-100 text-green-700">Correta</Badge>
        ) : (
          <Badge className="bg-red-100 text-red-700">Errada</Badge>
        ),
    },
  ];

  const createAnswerKeyModel = useMutation({
    mutationFn: async () => {
      const normalizedCode = normalizeAnswerKeyCode(newMaskCode);
      if (!normalizedCode) {
        throw new Error("Informe o codigo do novo teste (ex.: E2_RETAKE).");
      }
      if (normalizedCode === "ALL") {
        throw new Error("Codigo de teste invalido.");
      }
      if (existingAnswerKeyCodes.has(normalizedCode)) {
        throw new Error(`Ja existe um gabarito com o codigo "${normalizedCode}".`);
      }

      const expectedAnswers = [];
      for (let i = 1; i <= TRACOMA_TOTAL_QUESTIONS; i += 1) {
        const answer = normalizeBinaryAnswer(newMaskAnswers[i]);
        if (answer === null) {
          throw new Error(
            `A questao ${i} esta em branco ou invalida. Preencha com 0 ou 1.`
          );
        }
        expectedAnswers.push(answer);
      }

      const payload = expectedAnswers.map((answer, index) => ({
        answer_key_code: normalizedCode,
        question_number: index + 1,
        expected_answer: answer,
        is_locked: true,
      }));

      await dataClient.entities.TracomaExamAnswerKey.bulkCreate(payload);
      return normalizedCode;
    },
    onSuccess: async (createdCode) => {
      await queryClient.invalidateQueries({
        queryKey: ["tracoma-exam-answer-key-management"],
      });
      setSelectedMaskKeyCode(createdCode);
      setMaskActionStatus({
        type: "success",
        message: `Modelo "${createdCode}" criado com sucesso.`,
      });
      setNewMaskDialogOpen(false);
      setNewMaskCode("");
      setNewMaskAnswers({});
    },
    onError: (error) => {
      setMaskActionStatus({
        type: "error",
        message: error?.message || "Nao foi possivel criar o novo modelo.",
      });
    },
  });

  const openNewMaskDialog = () => {
    setMaskActionStatus(null);
    setNewMaskCode("");
    setNewMaskAnswers({});
    setNewMaskDialogOpen(true);
  };

  const handleMaskAnswerChange = (questionNumber, value) => {
    setNewMaskAnswers((prev) => ({
      ...prev,
      [questionNumber]: normalizeBinaryAnswer(value),
    }));
  };

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
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-64 space-y-2">
            <Label>Teste</Label>
            <Select value={selectedMaskKeyCode} onValueChange={setSelectedMaskKeyCode}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o teste" />
              </SelectTrigger>
              <SelectContent>
                  {answerKeyCollections.map((item) => (
                    <SelectItem key={item.code} value={item.code}>
                      {item.code}
                    </SelectItem>
                  ))}
                  {answerKeyCollections.length === 0 &&
                    availableKeyCodes.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                    ))}
              </SelectContent>
            </Select>
          </div>
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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="mask">Gabarito padrao ouro</TabsTrigger>
          <TabsTrigger value="history">Historico</TabsTrigger>
          <TabsTrigger value="monitor">Monitoria</TabsTrigger>
        </TabsList>

        <TabsContent value="mask" className="space-y-4 mt-6">
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={openNewMaskDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Novo modelo (padrão ouro)
            </Button>
          </div>

          {maskActionStatus && (
            <Alert
              className={
                maskActionStatus.type === "error"
                  ? "border-red-200 bg-red-50"
                  : "border-green-200 bg-green-50"
              }
            >
              <AlertDescription
                className={
                  maskActionStatus.type === "error"
                    ? "text-red-800"
                    : "text-green-800"
                }
              >
                {maskActionStatus.message}
              </AlertDescription>
            </Alert>
          )}

          {answerKeyLoadError && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {answerKeyLoadError}
              </AlertDescription>
            </Alert>
          )}

          {!answerKeyLoadError && selectedMaskKey?.error && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                {selectedMaskKey.error}
              </AlertDescription>
            </Alert>
          )}

          {!answerKeyLoadError && !selectedMaskKey && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                Nenhum gabarito de teste foi encontrado. Cadastre ao menos um teste
                (ex.: E2) na tabela tracoma_exam_answer_keys.
              </AlertDescription>
            </Alert>
          )}

          {!answerKeyLoadError && selectedMaskKey?.answers && (
            <>
              <Alert>
                <AlertDescription>
                  Gabarito bloqueado para edicao no sistema. Para novo teste,
                  utilize o botao "Novo modelo (padrao ouro)".
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-slate-500">Teste selecionado</p>
                    <p className="text-2xl font-semibold">{selectedMaskKey.code}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-slate-500">Respostas positivas (1)</p>
                    <p className="text-3xl font-semibold">{selectedMaskKey.positives}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-slate-500">Respostas negativas (0)</p>
                    <p className="text-3xl font-semibold">{selectedMaskKey.negatives}</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Gabarito somente leitura
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
                    {selectedMaskKey.answers.map((value, index) => (
                      <div
                        key={`answer-key-${selectedMaskKey.code}-${index + 1}`}
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
              <div className="flex flex-col lg:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar formando..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <div className="w-full lg:w-56">
                  <Select value={historyKeyFilter} onValueChange={setHistoryKeyFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filtrar teste" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os testes</SelectItem>
                      {availableKeyCodes.map((code) => (
                        <SelectItem key={`history-${code}`} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

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
                <CardContent>
                  <DataTable
                    columns={historyColumns}
                    data={filteredHistory}
                    isLoading={resultsQuery.isLoading}
                    emptyMessage="Nenhum resultado registrado ainda."
                    onRowClick={(row) => setSelectedResult(row)}
                  />
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="monitor" className="space-y-4 mt-6">
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
              <div className="flex flex-col lg:flex-row gap-3">
                <div className="w-full lg:w-56">
                  <Select value={monitorKeyFilter} onValueChange={setMonitorKeyFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filtrar teste" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os testes</SelectItem>
                      {availableKeyCodes.map((code) => (
                        <SelectItem key={`monitor-${code}`} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Input
                    placeholder="Filtrar por pessoa (nome)..."
                    value={monitorPersonFilter}
                    onChange={(event) => setMonitorPersonFilter(event.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-slate-500">Tentativas analisadas</p>
                    <p className="text-3xl font-semibold">
                      {monitorFilteredResults.length}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-slate-500">Questoes monitoradas</p>
                    <p className="text-3xl font-semibold">{TRACOMA_TOTAL_QUESTIONS}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-slate-500">Filtro atual</p>
                    <p className="text-xl font-semibold">
                      {monitorKeyFilter === "all" ? "Todos" : monitorKeyFilter}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Acertos e erros por questao
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={monitorQuestionColumns}
                    data={monitorQuestionStats}
                    isLoading={resultsQuery.isLoading}
                    emptyMessage="Nenhuma estatistica disponivel."
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tentativas para reanalise</CardTitle>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={historyColumns}
                    data={monitorFilteredResults}
                    isLoading={resultsQuery.isLoading}
                    emptyMessage="Nenhuma tentativa encontrada para o filtro."
                    onRowClick={(row) => setSelectedResult(row)}
                  />
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={newMaskDialogOpen} onOpenChange={setNewMaskDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo modelo de padrão ouro (50 questões)</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-mask-code">Código do teste</Label>
              <Input
                id="new-mask-code"
                value={newMaskCode}
                onChange={(event) => setNewMaskCode(event.target.value)}
                placeholder="Ex.: E2_RETAKE"
              />
              <p className="text-xs text-slate-500">
                Use um código único para identificar este gabarito.
              </p>
            </div>

            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="text-sm text-slate-600">
                Respondidas:{" "}
                <span className="font-semibold">
                  {newMaskAnsweredCount}/{TRACOMA_TOTAL_QUESTIONS}
                </span>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {maskQuestionColumns.map((column, columnIndex) => (
                <div key={`mask-column-${columnIndex}`} className="space-y-2">
                  {column.map((questionNumber) => {
                    const selectedValue =
                      newMaskAnswers[questionNumber] === 0 ||
                      newMaskAnswers[questionNumber] === 1
                        ? String(newMaskAnswers[questionNumber])
                        : "";
                    return (
                      <div
                        key={`new-mask-question-${questionNumber}`}
                        className="rounded-md border bg-white px-3 py-2"
                      >
                        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                          <p className="text-sm font-medium">
                            Questão {String(questionNumber).padStart(2, "0")}
                          </p>
                          <RadioGroup
                            value={selectedValue}
                            onValueChange={(value) =>
                              handleMaskAnswerChange(questionNumber, value)
                            }
                            className="flex items-center gap-2"
                          >
                            <div className="flex items-center gap-1 rounded border px-2 py-1">
                              <RadioGroupItem
                                id={`new-mask-q-${questionNumber}-0`}
                                value="0"
                              />
                              <Label
                                htmlFor={`new-mask-q-${questionNumber}-0`}
                                className="font-normal"
                              >
                                0
                              </Label>
                            </div>
                            <div className="flex items-center gap-1 rounded border px-2 py-1">
                              <RadioGroupItem
                                id={`new-mask-q-${questionNumber}-1`}
                                value="1"
                              />
                              <Label
                                htmlFor={`new-mask-q-${questionNumber}-1`}
                                className="font-normal"
                              >
                                1
                              </Label>
                            </div>
                          </RadioGroup>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewMaskDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => createAnswerKeyModel.mutate()}
                disabled={createAnswerKeyModel.isPending}
              >
                {createAnswerKeyModel.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Salvar novo modelo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedResult)} onOpenChange={() => setSelectedResult(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Reanalise detalhada da tentativa</DialogTitle>
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
                    <p className="text-xs text-slate-500">Teste</p>
                    <p className="font-semibold">{selectedResult.answer_key_code}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Acertos</p>
                    <p className="font-semibold">
                      {selectedResult.total_matches}/{selectedResult.total_questions}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Concordancia</p>
                    <p className="font-semibold">
                      {formatNumber(Number(selectedResult.observed_agreement) * 100, 2)}%
                    </p>
                  </div>
                </CardContent>
              </Card>

              {selectedResultDetails?.error ? (
                <Alert className="border-red-200 bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    {selectedResultDetails.error}
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Questoes erradas para reanalise
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedResultDetails?.wrongQuestions?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedResultDetails.wrongQuestions.map((questionNumber) => (
                            <Badge
                              key={`wrong-question-${questionNumber}`}
                              className="bg-red-100 text-red-700"
                            >
                              Q{String(questionNumber).padStart(2, "0")}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-green-700">
                          Nenhuma questao errada. Concordancia total.
                        </p>
                      )}
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

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Resposta por questao (certa/errada)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <DataTable
                        columns={detailColumns}
                        data={selectedResultDetails?.rows || []}
                        isLoading={false}
                        emptyMessage="Nenhum detalhe encontrado."
                      />
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
