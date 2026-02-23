import React, { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  ClipboardCheck,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  TRACOMA_TOTAL_QUESTIONS,
  buildAnswerKeyFromRows,
  computeTracomaKappaMetrics,
  normalizeBinaryAnswer,
} from "@/lib/tracomaExamKappa";
import {
  getSupabaseErrorMessage,
  isMissingSupabaseTableError,
} from "@/lib/supabaseErrors";

const normalizeCpf = (value) => String(value || "").replace(/\D/g, "");
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const formatNumber = (value, digits = 3) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number(value).toFixed(digits);
};

const matrixChartFromResult = (result) => [
  { label: "a (1/1)", total: Number(result?.matrix?.a || 0) },
  { label: "b (0/1)", total: Number(result?.matrix?.b || 0) },
  { label: "c (1/0)", total: Number(result?.matrix?.c || 0) },
  { label: "d (0/0)", total: Number(result?.matrix?.d || 0) },
];

export default function TracomaExaminerTest() {
  const queryString =
    window.location.search || window.location.hash.split("?")[1] || "";
  const urlParams = new URLSearchParams(queryString);
  const trainingId = String(urlParams.get("training") || "").trim();

  const [participantName, setParticipantName] = useState("");
  const [participantEmail, setParticipantEmail] = useState("");
  const [participantCpf, setParticipantCpf] = useState("");
  const [answers, setAnswers] = useState({});
  const [formError, setFormError] = useState("");
  const [submissionResult, setSubmissionResult] = useState(null);

  const { data: training, isLoading: trainingLoading } = useQuery({
    queryKey: ["tracoma-exam-training-public", trainingId],
    queryFn: async () => {
      const trainings = await dataClient.entities.Training.list("-date");
      return trainings.find((item) => String(item?.id || "") === trainingId) || null;
    },
    enabled: Boolean(trainingId),
  });

  const answerKeyQuery = useQuery({
    queryKey: ["tracoma-exam-answer-key-public"],
    queryFn: () =>
      dataClient.entities.TracomaExamAnswerKey.list("question_number"),
  });
  const answerKeyRows = answerKeyQuery.data || [];

  const answerKeyErrorMessage = answerKeyQuery.isError
    ? isMissingSupabaseTableError(answerKeyQuery.error, "tracoma_exam_answer_keys")
      ? "A tabela do gabarito de tracoma nao foi encontrada. Execute o script supabase/create_tracoma_exam_tables.sql."
      : getSupabaseErrorMessage(answerKeyQuery.error) ||
        "Nao foi possivel carregar o gabarito padrao."
    : "";

  const answerKeyStatus = useMemo(() => {
    try {
      const values = buildAnswerKeyFromRows(answerKeyRows, TRACOMA_TOTAL_QUESTIONS);
      return { values, error: "" };
    } catch (error) {
      return {
        values: null,
        error:
          error?.message ||
          "Gabarito padrao ouro nao esta completo para as 50 questoes.",
      };
    }
  }, [answerKeyRows]);

  const resultTableMissingError = (error) =>
    isMissingSupabaseTableError(error, "tracoma_exam_results")
      ? "A tabela de resultados de tracoma nao foi encontrada. Execute o script supabase/create_tracoma_exam_tables.sql."
      : "";

  const saveResult = useMutation({
    mutationFn: async () => {
      setFormError("");

      const cleanName = String(participantName || "").trim();
      if (!cleanName) {
        throw new Error("Informe o nome do formando.");
      }
      if (!trainingId) {
        throw new Error("Treinamento nao identificado no link.");
      }
      if (!training) {
        throw new Error("Treinamento nao encontrado.");
      }
      if (!answerKeyStatus.values) {
        throw new Error(answerKeyStatus.error || "Gabarito nao disponivel.");
      }

      const candidateAnswers = [];
      for (let question = 1; question <= TRACOMA_TOTAL_QUESTIONS; question += 1) {
        const rawValue = answers[question];
        const normalized = normalizeBinaryAnswer(rawValue);
        if (normalized === null) {
          throw new Error(
            `A questao ${question} esta em branco ou invalida. Responda com 0 ou 1.`
          );
        }
        candidateAnswers.push(normalized);
      }

      const computed = computeTracomaKappaMetrics({
        answerKey: answerKeyStatus.values,
        traineeAnswers: candidateAnswers,
      });

      const payload = {
        training_id: trainingId,
        training_title: training.title || null,
        participant_name: cleanName,
        participant_email: normalizeEmail(participantEmail) || null,
        participant_cpf: normalizeCpf(participantCpf) || null,
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
        answer_key_code: "TF_PADRAO_OURO_V1",
        answers: candidateAnswers,
      };

      const created = await dataClient.entities.TracomaExamResult.create(payload);
      return { computed, created };
    },
    onSuccess: (data) => {
      setSubmissionResult({
        ...data.computed,
        createdAt: data.created?.created_at || new Date().toISOString(),
        participantName: data.created?.participant_name || participantName,
      });
    },
    onError: (error) => {
      const tableError = resultTableMissingError(error);
      setFormError(
        tableError ||
          error?.message ||
          "Nao foi possivel enviar o teste de avaliacao."
      );
    },
  });

  const handleAnswerChange = (questionNumber, value) => {
    setAnswers((prev) => ({
      ...prev,
      [questionNumber]: normalizeBinaryAnswer(value),
    }));
  };

  const questionItems = useMemo(
    () =>
      Array.from({ length: TRACOMA_TOTAL_QUESTIONS }, (_, index) => ({
        number: index + 1,
      })),
    []
  );

  if (!trainingId) {
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              Link invalido. Abra o teste a partir da pagina do treinamento.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (trainingLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!training) {
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              Treinamento nao encontrado para este link.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (submissionResult) {
    const chartData = matrixChartFromResult(submissionResult);
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <div className="max-w-3xl mx-auto space-y-4">
          <Card>
            <CardContent className="pt-6 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle className="h-7 w-7 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Teste enviado!</h2>
              <p className="text-slate-600">
                Resultado de {submissionResult.participantName}
              </p>
              <Badge
                className={
                  submissionResult.aptitudeStatus === "Apto"
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
                }
              >
                {submissionResult.aptitudeStatus}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resumo do resultado</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-slate-500">Total de acertos</p>
                <p className="text-2xl font-semibold">{submissionResult.totalMatches}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-slate-500">Concordancia observada</p>
                <p className="text-2xl font-semibold">
                  {formatNumber(submissionResult.rounded.poPercent, 2)}%
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-slate-500">Kappa</p>
                <p className="text-2xl font-semibold">
                  {formatNumber(submissionResult.rounded.kappa, 3)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-slate-500">Interpretacao</p>
                <p className="text-lg font-semibold">{submissionResult.interpretation}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-slate-500">Sensibilidade</p>
                <p className="text-lg font-semibold">
                  {formatNumber(submissionResult.rounded.sensitivity, 3)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-slate-500">Especificidade</p>
                <p className="text-lg font-semibold">
                  {formatNumber(submissionResult.rounded.specificity, 3)}
                </p>
              </div>
              <div className="rounded-lg border p-3 sm:col-span-2">
                <p className="text-slate-500">IC95% do Kappa</p>
                <p className="text-lg font-semibold">
                  {formatNumber(submissionResult.rounded.ci95Low, 3)} a{" "}
                  {formatNumber(submissionResult.rounded.ci95High, 3)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Matriz 2x2</CardTitle>
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
                      <td className="border px-3 py-2">{submissionResult.matrix.a}</td>
                      <td className="border px-3 py-2">{submissionResult.matrix.c}</td>
                    </tr>
                    <tr>
                      <td className="border px-3 py-2 font-medium">Padrao = 0</td>
                      <td className="border px-3 py-2">{submissionResult.matrix.b}</td>
                      <td className="border px-3 py-2">{submissionResult.matrix.d}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
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

          <Button
            variant="outline"
            onClick={() => {
              setSubmissionResult(null);
              setAnswers({});
              setFormError("");
            }}
          >
            Realizar novo envio
          </Button>
        </div>
      </div>
    );
  }

  const blockByKeyIssue =
    Boolean(answerKeyErrorMessage) || Boolean(answerKeyStatus.error);

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2 text-blue-700">
              <ClipboardCheck className="h-5 w-5" />
              <span className="text-sm font-medium">
                Avaliacao de Examinadores de tracoma - Teste de 50 Questoes
              </span>
            </div>
            <CardTitle className="text-2xl">{training.title}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="participant-name">Nome do formando *</Label>
              <Input
                id="participant-name"
                value={participantName}
                onChange={(event) => setParticipantName(event.target.value)}
                placeholder="Nome completo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="participant-email">E-mail (opcional)</Label>
              <Input
                id="participant-email"
                type="email"
                value={participantEmail}
                onChange={(event) => setParticipantEmail(event.target.value)}
                placeholder="email@dominio.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="participant-cpf">CPF (opcional)</Label>
              <Input
                id="participant-cpf"
                value={participantCpf}
                onChange={(event) => setParticipantCpf(event.target.value)}
                placeholder="000.000.000-00"
              />
            </div>
          </CardContent>
        </Card>

        {answerKeyErrorMessage && (
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              {answerKeyErrorMessage}
            </AlertDescription>
          </Alert>
        )}

        {!answerKeyErrorMessage && answerKeyStatus.error && (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              {answerKeyStatus.error}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Questoes (0 = Ausencia | 1 = Presenca de sinal)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {questionItems.map((item) => {
                const selectedValue =
                  answers[item.number] === 0 || answers[item.number] === 1
                    ? String(answers[item.number])
                    : "";
                return (
                  <div
                    key={`question-${item.number}`}
                    className="rounded-lg border p-3 space-y-2"
                  >
                    <p className="text-sm font-medium">
                      Questao {String(item.number).padStart(2, "0")}
                    </p>
                    <RadioGroup
                      value={selectedValue}
                      onValueChange={(value) =>
                        handleAnswerChange(item.number, value)
                      }
                      className="grid grid-cols-2 gap-2"
                    >
                      <div className="flex items-center gap-2 rounded border px-3 py-2">
                        <RadioGroupItem
                          id={`q-${item.number}-0`}
                          value="0"
                        />
                        <Label
                          htmlFor={`q-${item.number}-0`}
                          className="font-normal"
                        >
                          0
                        </Label>
                      </div>
                      <div className="flex items-center gap-2 rounded border px-3 py-2">
                        <RadioGroupItem
                          id={`q-${item.number}-1`}
                          value="1"
                        />
                        <Label
                          htmlFor={`q-${item.number}-1`}
                          className="font-normal"
                        >
                          1
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                );
              })}
            </div>

            {formError && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">{formError}</AlertDescription>
              </Alert>
            )}

            <Button
              className="w-full"
              disabled={saveResult.isPending || blockByKeyIssue}
              onClick={() => saveResult.mutate()}
            >
              {saveResult.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando teste...
                </>
              ) : (
                "Enviar teste e calcular Kappa"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
