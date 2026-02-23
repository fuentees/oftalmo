import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { supabase } from "@/api/supabaseClient";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
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
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
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
  computeTracomaKappaMetrics,
  normalizeAnswerKeyCode,
  normalizeBinaryAnswer,
} from "@/lib/tracomaExamKappa";
import {
  getSupabaseErrorMessage,
  isMissingSupabaseTableError,
} from "@/lib/supabaseErrors";
import { formatDateSafe } from "@/lib/date";
import { isRepadronizacaoTraining } from "@/lib/trainingType";
import { useNavigate } from "react-router-dom";

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

const normalizeIdentityText = (value) => String(value || "").trim().toLowerCase();

const normalizeDigits = (value) => String(value || "").replace(/\D/g, "");

const toSafeFileName = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

const normalizeImportHeader = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");

const normalizeImportRow = (row) =>
  Object.entries(row || {}).reduce((acc, [key, value]) => {
    const normalizedKey = normalizeImportHeader(key);
    if (!normalizedKey) return acc;
    acc[normalizedKey] = value;
    return acc;
  }, {});

const pickImportValue = (normalizedRow, candidates) => {
  for (let i = 0; i < candidates.length; i += 1) {
    const key = normalizeImportHeader(candidates[i]);
    if (!key) continue;
    const value = normalizedRow[key];
    if (value === undefined || value === null) continue;
    if (String(value).trim() === "") continue;
    return value;
  }
  return "";
};

const parseAnswersFromImportRow = (
  normalizedRow,
  totalQuestions = TRACOMA_TOTAL_QUESTIONS
) => {
  const answers = [];
  for (let question = 1; question <= totalQuestions; question += 1) {
    const padded = String(question).padStart(2, "0");
    const rawValue = pickImportValue(normalizedRow, [
      `q${question}`,
      `q${padded}`,
      `questao${question}`,
      `questao${padded}`,
      `resposta${question}`,
      `resposta${padded}`,
      `pergunta${question}`,
      `pergunta${padded}`,
      String(question),
      padded,
    ]);
    const normalized = normalizeBinaryAnswer(rawValue);
    if (normalized === null) {
      throw new Error(
        `Questao ${question} ausente ou invalida (use apenas 0 ou 1).`
      );
    }
    answers.push(normalized);
  }
  return answers;
};

const parseSpreadsheetRows = async (file) => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.SheetNames?.[0];
  if (!firstSheet) return [];
  const worksheet = workbook.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json(worksheet, { defval: "" });
};

export default function TracomaExaminerEvaluationPage() {
  const navigate = useNavigate();
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
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importSourceTrainingId, setImportSourceTrainingId] = useState("all");
  const [importSpreadsheetDialogOpen, setImportSpreadsheetDialogOpen] =
    useState(false);
  const [importSpreadsheetFile, setImportSpreadsheetFile] = useState(null);
  const [spreadsheetFallbackKeyCode, setSpreadsheetFallbackKeyCode] =
    useState("");
  const [editMaskDialogOpen, setEditMaskDialogOpen] = useState(false);
  const [editMaskOriginalCode, setEditMaskOriginalCode] = useState("");
  const [editMaskCode, setEditMaskCode] = useState("");
  const [editMaskAnswers, setEditMaskAnswers] = useState({});
  const [maskActionStatus, setMaskActionStatus] = useState(null);
  const [resultActionStatus, setResultActionStatus] = useState(null);
  const queryClient = useQueryClient();

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/Trainings");
  };

  const renderBackButton = () => (
    <div>
      <Button variant="ghost" size="sm" onClick={handleGoBack} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Voltar
      </Button>
    </div>
  );

  const trainingQuery = useQuery({
    queryKey: ["tracoma-exam-training-management", trainingId],
    queryFn: async () => {
      const trainings = await dataClient.entities.Training.list("-date");
      return trainings.find((item) => String(item?.id || "") === trainingId) || null;
    },
    enabled: Boolean(trainingId),
  });
  const training = trainingQuery.data;
  const trainingIsRepadronizacao = isRepadronizacaoTraining(training);

  const allTrainingsQuery = useQuery({
    queryKey: ["tracoma-exam-training-list"],
    queryFn: () => dataClient.entities.Training.list("-date"),
  });
  const allTrainings = allTrainingsQuery.data || [];

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

  const spreadsheetFallbackOptions = useMemo(() => {
    const codes = new Set();
    answerKeyCollections.forEach((item) => {
      if (item?.code) codes.add(item.code);
    });
    availableKeyCodes.forEach((code) => {
      if (code) codes.add(code);
    });
    return Array.from(codes).sort((a, b) =>
      String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base" })
    );
  }, [answerKeyCollections, availableKeyCodes]);

  const importSourceTrainings = useMemo(() => {
    const currentId = String(trainingId || "").trim();
    return allTrainings
      .filter((item) => {
        const id = String(item?.id || "").trim();
        if (!id || id === currentId) return false;
        return isRepadronizacaoTraining(item);
      })
      .map((item) => ({
        id: String(item.id),
        title: String(item.title || "Treinamento sem título"),
      }));
  }, [allTrainings, trainingId]);

  useEffect(() => {
    if (importSourceTrainingId === "all") return;
    const exists = importSourceTrainings.some(
      (item) => item.id === importSourceTrainingId
    );
    if (!exists) {
      setImportSourceTrainingId("all");
    }
  }, [importSourceTrainingId, importSourceTrainings]);

  useEffect(() => {
    const fallbackOptions = [
      selectedMaskKeyCode,
      ...spreadsheetFallbackOptions,
    ].filter(Boolean);
    if (!fallbackOptions.length) {
      setSpreadsheetFallbackKeyCode("");
      return;
    }
    if (fallbackOptions.includes(spreadsheetFallbackKeyCode)) return;
    setSpreadsheetFallbackKeyCode(fallbackOptions[0]);
  }, [
    selectedMaskKeyCode,
    spreadsheetFallbackOptions,
    spreadsheetFallbackKeyCode,
  ]);

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

  const editMaskAnsweredCount = useMemo(
    () =>
      Array.from({ length: TRACOMA_TOTAL_QUESTIONS }, (_, index) => index + 1).filter(
        (questionNumber) =>
          normalizeBinaryAnswer(editMaskAnswers[questionNumber]) !== null
      ).length,
    [editMaskAnswers]
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

  const buildResultDetailsFromRow = (resultRow) => {
    if (!resultRow) return null;
    const keyCode = normalizeAnswerKeyCode(resultRow?.answer_key_code || "E2");
    const answerKey = answerKeyByCode.get(keyCode);
    const traineeAnswers = parseStoredAnswers(resultRow?.answers);
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
  };

  const selectedResultDetails = useMemo(
    () => buildResultDetailsFromRow(selectedResult),
    [selectedResult, answerKeyByCode]
  );

  const deleteExamResult = useMutation({
    mutationFn: async (resultRow) => {
      const resultId = String(resultRow?.id || "").trim();
      if (!resultId) {
        throw new Error("Tentativa invalida para exclusao.");
      }
      await dataClient.entities.TracomaExamResult.delete(resultId);
      return resultRow;
    },
    onSuccess: async (deletedRow) => {
      await queryClient.invalidateQueries({
        queryKey: ["tracoma-exam-results", trainingId],
      });
      setSelectedResult((current) =>
        String(current?.id || "") === String(deletedRow?.id || "") ? null : current
      );
      setResultActionStatus({
        type: "success",
        message: `Tentativa de "${deletedRow?.participant_name || "formando"}" excluida com sucesso.`,
      });
    },
    onError: (error) => {
      setResultActionStatus({
        type: "error",
        message: error?.message || "Nao foi possivel excluir a tentativa.",
      });
    },
  });

  const buildResultFingerprint = (row) => {
    const answersArray = parseStoredAnswers(row?.answers) || [];
    return [
      normalizeIdentityText(row?.participant_name),
      normalizeIdentityText(row?.participant_email),
      normalizeDigits(row?.participant_cpf),
      normalizeAnswerKeyCode(row?.answer_key_code || "E2"),
      Number(row?.total_matches || 0),
      Number(row?.total_questions || TRACOMA_TOTAL_QUESTIONS),
      JSON.stringify(answersArray),
    ].join("|");
  };

  const importPastResults = useMutation({
    mutationFn: async () => {
      const sourceId = String(importSourceTrainingId || "all").trim() || "all";
      const currentId = String(trainingId || "").trim();
      if (!currentId) {
        throw new Error("Treinamento atual invalido para importacao.");
      }

      let query = supabase.from("tracoma_exam_results").select("*");
      if (sourceId === "all") {
        query = query.neq("training_id", currentId);
      } else {
        query = query.eq("training_id", sourceId);
      }
      const { data: sourceRows, error: sourceError } = await query;
      if (sourceError) throw sourceError;

      const validSourceRows = (sourceRows || []).filter(
        (row) => String(row?.training_id || "").trim() !== currentId
      );
      if (validSourceRows.length === 0) {
        throw new Error("Nenhuma resposta encontrada para importar.");
      }

      const existingRows = await dataClient.entities.TracomaExamResult.filter({
        training_id: currentId,
      });
      const existingFingerprints = new Set(
        (existingRows || []).map((row) => buildResultFingerprint(row))
      );

      let invalidCount = 0;
      let duplicateCount = 0;
      const payload = [];

      validSourceRows.forEach((row) => {
        const answersArray = parseStoredAnswers(row?.answers);
        if (!answersArray) {
          invalidCount += 1;
          return;
        }
        const cloned = {
          training_id: currentId,
          training_title: training?.title || row?.training_title || null,
          participant_name: row?.participant_name || "Formando sem nome",
          participant_email: row?.participant_email || null,
          participant_cpf: row?.participant_cpf || null,
          total_questions: Number(row?.total_questions || TRACOMA_TOTAL_QUESTIONS),
          total_matches: Number(row?.total_matches || 0),
          matrix_a: Number(row?.matrix_a || 0),
          matrix_b: Number(row?.matrix_b || 0),
          matrix_c: Number(row?.matrix_c || 0),
          matrix_d: Number(row?.matrix_d || 0),
          observed_agreement: row?.observed_agreement ?? null,
          expected_agreement: row?.expected_agreement ?? null,
          kappa: row?.kappa ?? null,
          kappa_ci_low: row?.kappa_ci_low ?? null,
          kappa_ci_high: row?.kappa_ci_high ?? null,
          sensitivity: row?.sensitivity ?? null,
          specificity: row?.specificity ?? null,
          interpretation: row?.interpretation || null,
          aptitude_status: row?.aptitude_status || null,
          answer_key_code: normalizeAnswerKeyCode(row?.answer_key_code || "E2"),
          answers: answersArray,
        };

        const fingerprint = buildResultFingerprint(cloned);
        if (existingFingerprints.has(fingerprint)) {
          duplicateCount += 1;
          return;
        }
        existingFingerprints.add(fingerprint);
        payload.push(cloned);
      });

      if (payload.length === 0) {
        throw new Error(
          "Nenhuma resposta nova para importar (todas ja existem ou estao invalidas)."
        );
      }

      await dataClient.entities.TracomaExamResult.bulkCreate(payload);
      return {
        importedCount: payload.length,
        duplicateCount,
        invalidCount,
      };
    },
    onSuccess: async ({ importedCount, duplicateCount, invalidCount }) => {
      await queryClient.invalidateQueries({
        queryKey: ["tracoma-exam-results", trainingId],
      });
      setImportDialogOpen(false);
      setImportSourceTrainingId("all");
      const details = [
        `${importedCount} resposta(s) importada(s)`,
        duplicateCount > 0 ? `${duplicateCount} duplicada(s) ignorada(s)` : null,
        invalidCount > 0 ? `${invalidCount} invalida(s) ignorada(s)` : null,
      ]
        .filter(Boolean)
        .join(" | ");
      setResultActionStatus({
        type: "success",
        message: `Importacao concluida: ${details}.`,
      });
    },
    onError: (error) => {
      setResultActionStatus({
        type: "error",
        message: error?.message || "Nao foi possivel importar respostas passadas.",
      });
    },
  });

  const importSpreadsheetResults = useMutation({
    mutationFn: async () => {
      if (!importSpreadsheetFile) {
        throw new Error("Selecione o arquivo Excel/CSV preenchido.");
      }
      const currentTrainingId = String(trainingId || "").trim();
      if (!currentTrainingId) {
        throw new Error("Treinamento atual invalido para importacao.");
      }

      const rows = await parseSpreadsheetRows(importSpreadsheetFile);
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error("A planilha esta vazia ou sem linhas de dados.");
      }

      const existingRows = await dataClient.entities.TracomaExamResult.filter({
        training_id: currentTrainingId,
      });
      const existingFingerprints = new Set(
        (existingRows || []).map((row) => buildResultFingerprint(row))
      );

      const payload = [];
      let duplicateCount = 0;
      let invalidCount = 0;
      const invalidPreview = [];

      rows.forEach((row, index) => {
        const lineNumber = index + 2;
        const normalizedRow = normalizeImportRow(row);
        const participantName = String(
          pickImportValue(normalizedRow, [
            "participant_name",
            "nome",
            "nome_participante",
            "nome_formando",
            "formando",
            "profissional",
          ]) || ""
        ).trim();

        if (!participantName) {
          invalidCount += 1;
          if (invalidPreview.length < 5) {
            invalidPreview.push(`Linha ${lineNumber}: nome do formando ausente.`);
          }
          return;
        }

        const rawKeyCode = pickImportValue(normalizedRow, [
          "answer_key_code",
          "codigo_teste",
          "codigo_do_teste",
          "teste",
          "gabarito",
          "modelo",
          "tipo_teste",
        ]);
        const answerKeyCode = normalizeAnswerKeyCode(
          rawKeyCode || spreadsheetFallbackKeyCode || "E2"
        );
        const answerKey = answerKeyByCode.get(answerKeyCode);
        if (!answerKey) {
          invalidCount += 1;
          if (invalidPreview.length < 5) {
            invalidPreview.push(
              `Linha ${lineNumber}: codigo de teste "${answerKeyCode || "-"}" sem gabarito.`
            );
          }
          return;
        }

        let answers = [];
        try {
          answers = parseAnswersFromImportRow(normalizedRow);
        } catch (error) {
          invalidCount += 1;
          if (invalidPreview.length < 5) {
            invalidPreview.push(`Linha ${lineNumber}: ${error?.message || "respostas invalidas."}`);
          }
          return;
        }

        let computed = null;
        try {
          computed = computeTracomaKappaMetrics({
            answerKey,
            traineeAnswers: answers,
          });
        } catch (error) {
          invalidCount += 1;
          if (invalidPreview.length < 5) {
            invalidPreview.push(
              `Linha ${lineNumber}: falha no calculo do Kappa (${error?.message || "erro"}).`
            );
          }
          return;
        }

        const participantEmail = String(
          pickImportValue(normalizedRow, [
            "participant_email",
            "email",
            "e_mail",
            "mail",
          ]) || ""
        )
          .trim()
          .toLowerCase();
        const participantCpf = normalizeDigits(
          pickImportValue(normalizedRow, ["participant_cpf", "cpf", "cpf_formando"])
        );

        const importedRow = {
          training_id: currentTrainingId,
          training_title: training?.title || null,
          participant_name: participantName,
          participant_email: participantEmail || null,
          participant_cpf: participantCpf || null,
          total_questions: computed.totalQuestions,
          total_matches: computed.totalMatches,
          matrix_a: computed.matrix.a,
          matrix_b: computed.matrix.b,
          matrix_c: computed.matrix.c,
          matrix_d: computed.matrix.d,
          observed_agreement: computed.po,
          expected_agreement: computed.pe,
          kappa: computed.kappa,
          kappa_ci_low: computed.ci95.low,
          kappa_ci_high: computed.ci95.high,
          sensitivity: computed.sensitivity,
          specificity: computed.specificity,
          interpretation: computed.interpretation,
          aptitude_status: computed.aptitudeStatus,
          answer_key_code: answerKeyCode,
          answers,
        };

        const fingerprint = buildResultFingerprint(importedRow);
        if (existingFingerprints.has(fingerprint)) {
          duplicateCount += 1;
          return;
        }
        existingFingerprints.add(fingerprint);
        payload.push(importedRow);
      });

      if (!payload.length) {
        const previewMessage = invalidPreview.length
          ? ` Detalhes: ${invalidPreview.join(" | ")}`
          : "";
        throw new Error(
          `Nenhuma linha valida para importar.${previewMessage}`
        );
      }

      await dataClient.entities.TracomaExamResult.bulkCreate(payload);
      return {
        importedCount: payload.length,
        duplicateCount,
        invalidCount,
        invalidPreview,
      };
    },
    onSuccess: async ({ importedCount, duplicateCount, invalidCount, invalidPreview }) => {
      await queryClient.invalidateQueries({
        queryKey: ["tracoma-exam-results", trainingId],
      });
      setImportSpreadsheetDialogOpen(false);
      setImportSpreadsheetFile(null);
      const details = [
        `${importedCount} resposta(s) importada(s)`,
        duplicateCount > 0 ? `${duplicateCount} duplicada(s) ignorada(s)` : null,
        invalidCount > 0 ? `${invalidCount} invalida(s) ignorada(s)` : null,
      ]
        .filter(Boolean)
        .join(" | ");
      const previewText =
        invalidPreview && invalidPreview.length
          ? ` Primeiros erros: ${invalidPreview.join(" | ")}`
          : "";
      setResultActionStatus({
        type: "success",
        message: `Importacao da planilha concluida: ${details}.${previewText}`,
      });
    },
    onError: (error) => {
      setResultActionStatus({
        type: "error",
        message:
          error?.message || "Nao foi possivel importar a planilha preenchida.",
      });
    },
  });

  const handleExportResultPdf = (resultRow) => {
    if (!resultRow) return;
    const details = buildResultDetailsFromRow(resultRow);
    if (!details || details.error) {
      window.alert(
        details?.error || "Nao foi possivel reconstruir os dados para exportar."
      );
      return;
    }

    const pdf = new jsPDF("p", "mm", "a4");
    const marginX = 14;
    const maxX = 196;
    let y = 14;

    const addLine = (text, size = 10, spacing = 6) => {
      pdf.setFontSize(size);
      const lines = pdf.splitTextToSize(String(text || ""), maxX - marginX);
      pdf.text(lines, marginX, y);
      y += lines.length * (size * 0.35 + 2) + (spacing - 4);
    };

    const ensureSpace = (minHeight = 10) => {
      if (y + minHeight > 285) {
        pdf.addPage();
        y = 14;
      }
    };

    pdf.setFont("helvetica", "bold");
    addLine("Relatorio de resposta - Avaliacao de Tracoma", 14, 7);
    pdf.setFont("helvetica", "normal");
    addLine(`Treinamento: ${resultRow?.training_title || training?.title || "-"}`, 10, 5);
    addLine(`Data do envio: ${formatDateSafe(resultRow?.created_at, "dd/MM/yyyy HH:mm") || "-"}`, 10, 6);

    pdf.setFont("helvetica", "bold");
    addLine("Resumo", 12, 6);
    pdf.setFont("helvetica", "normal");
    addLine(`Formando: ${resultRow?.participant_name || "-"}`, 10, 5);
    addLine(`Teste: ${resultRow?.answer_key_code || "-"}`, 10, 5);
    addLine(
      `Acertos: ${resultRow?.total_matches || 0}/${resultRow?.total_questions || TRACOMA_TOTAL_QUESTIONS}`,
      10,
      5
    );
    addLine(
      `Concordancia observada: ${formatNumber(Number(resultRow?.observed_agreement) * 100, 2)}%`,
      10,
      5
    );
    addLine(`Kappa: ${formatNumber(resultRow?.kappa, 3)}`, 10, 5);
    addLine(`Classificacao: ${resultRow?.aptitude_status || "-"}`, 10, 7);

    ensureSpace(28);
    pdf.setFont("helvetica", "bold");
    addLine("Matriz 2x2", 12, 6);
    pdf.setFont("helvetica", "normal");
    addLine(
      `a (1/1): ${Number(resultRow?.matrix_a || 0)} | b (0/1): ${Number(resultRow?.matrix_b || 0)}`,
      10,
      5
    );
    addLine(
      `c (1/0): ${Number(resultRow?.matrix_c || 0)} | d (0/0): ${Number(resultRow?.matrix_d || 0)}`,
      10,
      7
    );

    pdf.setFont("helvetica", "bold");
    addLine("Questoes erradas para reanalise", 12, 6);
    pdf.setFont("helvetica", "normal");
    addLine(
      details.wrongQuestions.length > 0
        ? details.wrongQuestions.map((item) => `Q${String(item).padStart(2, "0")}`).join(", ")
        : "Nenhuma questao errada.",
      10,
      7
    );

    pdf.setFont("helvetica", "bold");
    addLine("Respostas por questao", 12, 6);
    pdf.setFont("helvetica", "normal");
    details.rows.forEach((row) => {
      ensureSpace(6);
      addLine(
        `Q${String(row.questionNumber).padStart(2, "0")} | Gabarito: ${row.expected} | Formando: ${row.observed} | ${row.isCorrect ? "Correta" : "Errada"}`,
        9,
        4
      );
    });

    const safeName = toSafeFileName(resultRow?.participant_name || "formando");
    const dateStamp = new Date().toISOString().split("T")[0];
    pdf.save(`tracoma-resposta-${safeName || "formando"}-${dateStamp}.pdf`);
  };

  const createAnswerPayload = (answerMap, code, contextLabel) => {
    const payload = [];
    for (let i = 1; i <= TRACOMA_TOTAL_QUESTIONS; i += 1) {
      const answer = normalizeBinaryAnswer(answerMap[i]);
      if (answer === null) {
        throw new Error(
          `A questao ${i} esta em branco ou invalida no ${contextLabel}. Preencha com 0 ou 1.`
        );
      }
      payload.push({
        answer_key_code: code,
        question_number: i,
        expected_answer: answer,
        is_locked: true,
      });
    }
    return payload;
  };

  const editAnswerKeyModel = useMutation({
    mutationFn: async () => {
      const previousCode = normalizeAnswerKeyCode(editMaskOriginalCode);
      const nextCode = normalizeAnswerKeyCode(editMaskCode);
      if (!previousCode) {
        throw new Error("Modelo original invalido.");
      }
      if (!nextCode) {
        throw new Error("Informe o codigo do teste.");
      }
      if (nextCode === "ALL") {
        throw new Error("Codigo de teste invalido.");
      }
      if (previousCode !== nextCode && existingAnswerKeyCodes.has(nextCode)) {
        throw new Error(`Ja existe um modelo com o codigo "${nextCode}".`);
      }

      const payload = createAnswerPayload(editMaskAnswers, nextCode, "modelo editado");
      const { error: upsertError } = await supabase
        .from("tracoma_exam_answer_keys")
        .upsert(payload, { onConflict: "answer_key_code,question_number" });
      if (upsertError) throw upsertError;

      if (previousCode !== nextCode) {
        const { error: deleteOldModelError } = await supabase
          .from("tracoma_exam_answer_keys")
          .delete()
          .eq("answer_key_code", previousCode);
        if (deleteOldModelError) throw deleteOldModelError;

        const { error: renameResultsError } = await supabase
          .from("tracoma_exam_results")
          .update({ answer_key_code: nextCode })
          .eq("answer_key_code", previousCode);
        if (renameResultsError) throw renameResultsError;
      }

      return { previousCode, nextCode };
    },
    onSuccess: async ({ previousCode, nextCode }) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["tracoma-exam-answer-key-management"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["tracoma-exam-results", trainingId],
        }),
      ]);
      setSelectedMaskKeyCode(nextCode);
      setEditMaskDialogOpen(false);
      setEditMaskOriginalCode("");
      setEditMaskCode("");
      setEditMaskAnswers({});
      setMaskActionStatus({
        type: "success",
        message:
          previousCode === nextCode
            ? `Modelo "${nextCode}" atualizado com sucesso.`
            : `Modelo renomeado de "${previousCode}" para "${nextCode}" com sucesso.`,
      });
    },
    onError: (error) => {
      setMaskActionStatus({
        type: "error",
        message: error?.message || "Nao foi possivel editar o modelo selecionado.",
      });
    },
  });

  const deleteAnswerKeyModel = useMutation({
    mutationFn: async (maskCode) => {
      const normalizedCode = normalizeAnswerKeyCode(maskCode);
      if (!normalizedCode) {
        throw new Error("Modelo invalido para exclusao.");
      }
      const { count, error: countError } = await supabase
        .from("tracoma_exam_results")
        .select("id", { count: "exact", head: true })
        .eq("answer_key_code", normalizedCode);
      if (countError) throw countError;
      const filledTestsCount = Number(count || 0);
      if (filledTestsCount > 0) {
        throw new Error(
          `Existem ${filledTestsCount} teste(s) preenchido(s) com "${normalizedCode}". Exclua as tentativas no historico antes de remover o modelo.`
        );
      }
      const { error: deleteError } = await supabase
        .from("tracoma_exam_answer_keys")
        .delete()
        .eq("answer_key_code", normalizedCode);
      if (deleteError) throw deleteError;
      return normalizedCode;
    },
    onSuccess: async (deletedCode) => {
      await queryClient.invalidateQueries({
        queryKey: ["tracoma-exam-answer-key-management"],
      });
      if (selectedMaskKeyCode === deletedCode) {
        setSelectedMaskKeyCode("");
      }
      setMaskActionStatus({
        type: "success",
        message: `Modelo "${deletedCode}" excluido com sucesso.`,
      });
    },
    onError: (error) => {
      setMaskActionStatus({
        type: "error",
        message: error?.message || "Nao foi possivel excluir o modelo selecionado.",
      });
    },
  });

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
    {
      header: "Acoes",
      sortable: false,
      cellClassName: "text-right",
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={(event) => {
              event.stopPropagation();
              handleExportResultPdf(row);
            }}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-red-600 hover:text-red-700"
            onClick={(event) => {
              event.stopPropagation();
              handleDeleteResult(row);
            }}
            disabled={deleteExamResult.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
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

      const payload = createAnswerPayload(
        newMaskAnswers,
        normalizedCode,
        "novo modelo"
      );

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

  const openEditMaskDialog = (maskModel) => {
    if (!maskModel?.answers) return;
    const answerState = {};
    maskModel.answers.forEach((answer, index) => {
      answerState[index + 1] = normalizeBinaryAnswer(answer);
    });
    setMaskActionStatus(null);
    setEditMaskOriginalCode(maskModel.code);
    setEditMaskCode(maskModel.code);
    setEditMaskAnswers(answerState);
    setEditMaskDialogOpen(true);
  };

  const handleMaskAnswerChange = (questionNumber, value) => {
    setNewMaskAnswers((prev) => ({
      ...prev,
      [questionNumber]: normalizeBinaryAnswer(value),
    }));
  };

  const handleEditMaskAnswerChange = (questionNumber, value) => {
    setEditMaskAnswers((prev) => ({
      ...prev,
      [questionNumber]: normalizeBinaryAnswer(value),
    }));
  };

  const handleDeleteMaskModel = (maskCode) => {
    const normalizedCode = normalizeAnswerKeyCode(maskCode);
    if (!normalizedCode) return;
    const confirmed = window.confirm(
      `Tem certeza que deseja excluir o modelo "${normalizedCode}"?`
    );
    if (!confirmed) return;
    setMaskActionStatus(null);
    deleteAnswerKeyModel.mutate(normalizedCode);
  };

  const handleDeleteResult = (resultRow) => {
    const resultId = String(resultRow?.id || "").trim();
    if (!resultId) return;
    const candidateName = String(resultRow?.participant_name || "formando").trim();
    const confirmed = window.confirm(
      `Excluir o teste preenchido de "${candidateName}"? Esta acao nao pode ser desfeita.`
    );
    if (!confirmed) return;
    setResultActionStatus(null);
    deleteExamResult.mutate(resultRow);
  };

  const handleOpenImportSpreadsheetDialog = () => {
    setResultActionStatus(null);
    setImportSpreadsheetFile(null);
    setImportSpreadsheetDialogOpen(true);
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
        {renderBackButton()}
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
        {renderBackButton()}
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

  if (!trainingIsRepadronizacao) {
    return (
      <div className="space-y-6">
        {renderBackButton()}
        <PageHeader
          title="Avaliacao de Examinadores de tracoma"
          subtitle={`Treinamento: ${training.title}`}
        />
        <Alert className="border-amber-200 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            Este formulario esta disponivel somente para treinamentos do tipo
            repadronizacao.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {renderBackButton()}
      <PageHeader
        title="Avaliacao de Examinadores de tracoma - Teste de 50 Questoes"
        subtitle={`Treinamento: ${training.title}`}
      />

      {resultActionStatus && (
        <Alert
          className={
            resultActionStatus.type === "error"
              ? "border-red-200 bg-red-50"
              : "border-green-200 bg-green-50"
          }
        >
          <AlertDescription
            className={
              resultActionStatus.type === "error"
                ? "text-red-800"
                : "text-green-800"
            }
          >
            {resultActionStatus.message}
          </AlertDescription>
        </Alert>
      )}

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
            <Button
              type="button"
              variant="outline"
              onClick={() => openEditMaskDialog(selectedMaskKey)}
              disabled={!selectedMaskKey?.answers}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Editar/renomear modelo
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-red-600 hover:text-red-700"
              onClick={() => handleDeleteMaskModel(selectedMaskKey?.code)}
              disabled={!selectedMaskKey?.code || deleteAnswerKeyModel.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir modelo
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
                  Voce pode editar respostas, renomear o codigo do teste e
                  excluir modelos (se nao houver testes preenchidos vinculados).
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

              <div className="flex justify-end gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setImportDialogOpen(true)}
                  disabled={importSourceTrainings.length === 0 || importPastResults.isPending}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Importar respostas de treinamentos passados
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleOpenImportSpreadsheetDialog}
                  disabled={answerKeyCollections.length === 0}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Importar formulario preenchido (Excel)
                </Button>
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

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Importar respostas de treinamentos passados</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Origem das respostas</Label>
              <Select
                value={importSourceTrainingId}
                onValueChange={setImportSourceTrainingId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os treinamentos passados</SelectItem>
                  {importSourceTrainings.map((item) => (
                    <SelectItem key={`import-training-${item.id}`} value={item.id}>
                      {item.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Alert>
              <AlertDescription>
                As respostas importadas serao copiadas para este treinamento.
                Itens duplicados ou invalidos sao ignorados automaticamente.
              </AlertDescription>
            </Alert>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setImportDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => importPastResults.mutate()}
                disabled={importPastResults.isPending}
              >
                {importPastResults.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Importar respostas
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importSpreadsheetDialogOpen}
        onOpenChange={setImportSpreadsheetDialogOpen}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Importar formulario preenchido (Excel/CSV)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-spreadsheet-file">Arquivo preenchido</Label>
              <Input
                id="import-spreadsheet-file"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(event) => {
                  const selectedFile = event.target.files?.[0] || null;
                  setImportSpreadsheetFile(selectedFile);
                }}
              />
              <p className="text-xs text-slate-500">
                Use colunas para nome do formando e respostas Q1..Q50 (0/1).
              </p>
            </div>

            <div className="space-y-2">
              <Label>Codigo de teste padrao (se a planilha nao tiver coluna)</Label>
              <Select
                value={spreadsheetFallbackKeyCode}
                onValueChange={setSpreadsheetFallbackKeyCode}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o codigo" />
                </SelectTrigger>
                <SelectContent>
                  {spreadsheetFallbackOptions.map((code) => (
                    <SelectItem key={`spreadsheet-key-${code}`} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Alert>
              <AlertDescription>
                O sistema recalcula Kappa automaticamente para cada linha valida.
                Duplicados e linhas invalidas sao ignorados.
              </AlertDescription>
            </Alert>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setImportSpreadsheetDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => importSpreadsheetResults.mutate()}
                disabled={importSpreadsheetResults.isPending || !importSpreadsheetFile}
              >
                {importSpreadsheetResults.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Importar planilha
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editMaskDialogOpen} onOpenChange={setEditMaskDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar modelo de padrão ouro (50 questões)</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-mask-code">Código do teste</Label>
              <Input
                id="edit-mask-code"
                value={editMaskCode}
                onChange={(event) => setEditMaskCode(event.target.value)}
                placeholder="Ex.: E2_RETAKE"
              />
              <p className="text-xs text-slate-500">
                Altere o codigo para renomear o teste.
              </p>
            </div>

            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="text-sm text-slate-600">
                Respondidas:{" "}
                <span className="font-semibold">
                  {editMaskAnsweredCount}/{TRACOMA_TOTAL_QUESTIONS}
                </span>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {maskQuestionColumns.map((column, columnIndex) => (
                <div key={`edit-mask-column-${columnIndex}`} className="space-y-2">
                  {column.map((questionNumber) => {
                    const selectedValue =
                      editMaskAnswers[questionNumber] === 0 ||
                      editMaskAnswers[questionNumber] === 1
                        ? String(editMaskAnswers[questionNumber])
                        : "";
                    return (
                      <div
                        key={`edit-mask-question-${questionNumber}`}
                        className="rounded-md border bg-white px-3 py-2"
                      >
                        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                          <p className="text-sm font-medium">
                            Questão {String(questionNumber).padStart(2, "0")}
                          </p>
                          <RadioGroup
                            value={selectedValue}
                            onValueChange={(value) =>
                              handleEditMaskAnswerChange(questionNumber, value)
                            }
                            className="flex items-center gap-2"
                          >
                            <div className="flex items-center gap-1 rounded border px-2 py-1">
                              <RadioGroupItem
                                id={`edit-mask-q-${questionNumber}-0`}
                                value="0"
                              />
                              <Label
                                htmlFor={`edit-mask-q-${questionNumber}-0`}
                                className="font-normal"
                              >
                                0
                              </Label>
                            </div>
                            <div className="flex items-center gap-1 rounded border px-2 py-1">
                              <RadioGroupItem
                                id={`edit-mask-q-${questionNumber}-1`}
                                value="1"
                              />
                              <Label
                                htmlFor={`edit-mask-q-${questionNumber}-1`}
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
                onClick={() => setEditMaskDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => editAnswerKeyModel.mutate()}
                disabled={editAnswerKeyModel.isPending}
              >
                {editAnswerKeyModel.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Salvar alterações
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
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleExportResultPdf(selectedResult)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Exportar resposta em PDF
                </Button>
              </div>
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
