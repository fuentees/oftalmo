import React, { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Loader2,
  Star,
  User,
} from "lucide-react";
import { formatDateSafe, parseDateSafe } from "@/lib/date";
import {
  getSupabaseErrorMessage,
  isMissingSupabaseTableError,
} from "@/lib/supabaseErrors";
import { extractQuestionMeta } from "@/lib/trainingFeedbackSchema";

const StarRating = ({ value, onChange, label }) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="focus:outline-none"
        >
          <Star
            className={`h-8 w-8 ${
              star <= value ? "fill-yellow-400 text-yellow-400" : "text-slate-300"
            }`}
          />
        </button>
      ))}
    </div>
  </div>
);

const normalizeCpf = (value) => String(value || "").replace(/\D/g, "");
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

export default function TrainingFeedback() {
  const queryString =
    window.location.search || window.location.hash.split("?")[1] || "";
  const urlParams = new URLSearchParams(queryString);
  const trainingId = urlParams.get("training");

  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [comments, setComments] = useState("");
  const [wouldRecommend, setWouldRecommend] = useState(false);
  const [lookupError, setLookupError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [answers, setAnswers] = useState({});

  const { data: training, isLoading } = useQuery({
    queryKey: ["feedback-training-public", trainingId],
    queryFn: async () => {
      const trainings = await dataClient.entities.Training.list();
      return trainings.find((item) => item.id === trainingId);
    },
    enabled: !!trainingId,
  });

  const {
    data: questions = [],
    error: questionsError,
    isError: hasQuestionsError,
  } = useQuery({
    queryKey: ["training-feedback-questions-public", trainingId],
    queryFn: async () => {
      const allQuestions =
        await dataClient.entities.TrainingFeedbackQuestion.list("order");
      return allQuestions.filter(
        (question) =>
          question.is_active && (!question.training_id || question.training_id === trainingId)
      );
    },
    enabled: !!trainingId,
  });
  const isQuestionsTableMissing = isMissingSupabaseTableError(
    questionsError,
    "training_feedback_questions"
  );
  const questionsLoadErrorMessage = hasQuestionsError
    ? isQuestionsTableMissing
      ? "A tabela training_feedback_questions nao foi encontrada no Supabase. Solicite ao administrador a criacao da tabela de perguntas de avaliacao."
      : getSupabaseErrorMessage(questionsError) ||
        "Nao foi possivel carregar as perguntas da avaliacao."
    : "";

  const trainingDates = useMemo(() => {
    const list = Array.isArray(training?.dates) ? [...training.dates] : [];
    return list.sort((a, b) => {
      const dateA = parseDateSafe(a?.date);
      const dateB = parseDateSafe(b?.date);
      const timeA = Number.isNaN(dateA.getTime()) ? 0 : dateA.getTime();
      const timeB = Number.isNaN(dateB.getTime()) ? 0 : dateB.getTime();
      return timeA - timeB;
    });
  }, [training?.dates]);

  const trainingDateSummary = useMemo(() => {
    if (trainingDates.length > 0) {
      return trainingDates
        .map((item) => {
          const dateLabel = formatDateSafe(item?.date) || "Data a definir";
          if (item?.start_time && item?.end_time) {
            return `${dateLabel} (${item.start_time} - ${item.end_time})`;
          }
          return dateLabel;
        })
        .join(" | ");
    }
    return formatDateSafe(training?.date) || "Data a definir";
  }, [training?.date, trainingDates]);

  const activeQuestions = useMemo(
    () => [...questions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [questions]
  );

  const submitFeedback = useMutation({
    mutationFn: async () => {
      setLookupError(null);

      const cpfDigits = normalizeCpf(cpf);
      const emailValue = normalizeEmail(email);
      if (!cpfDigits && !emailValue) {
        throw new Error("Informe CPF ou e-mail para identificar sua inscricao.");
      }

      const scopedParticipants = await dataClient.entities.TrainingParticipant.filter(
        { training_id: trainingId },
        "-enrollment_date"
      );

      const participants = scopedParticipants.filter((participant) => {
        const cpfMatch =
          cpfDigits &&
          normalizeCpf(participant.professional_cpf) === normalizeCpf(cpfDigits);
        const emailMatch =
          emailValue &&
          normalizeEmail(participant.professional_email) === normalizeEmail(emailValue);

        if (cpfDigits && emailValue) return cpfMatch || emailMatch;
        if (cpfDigits) return cpfMatch;
        return emailMatch;
      });

      if (participants.length === 0) {
        throw new Error("Inscricao nao encontrada para este treinamento.");
      }
      if (participants.length > 1) {
        throw new Error("Encontramos mais de uma inscricao. Use o CPF completo.");
      }

      if (activeQuestions.length === 0) {
        throw new Error("Nenhuma pergunta foi configurada para este treinamento.");
      }

      const requiredErrors = activeQuestions.filter((question) => {
        if (!question.required) return false;
        const value = answers[question.id];

        if (question.question_type === "rating") {
          return !value || Number(value) === 0;
        }
        if (question.question_type === "text") {
          return !value || !String(value).trim();
        }
        if (question.question_type === "yesno") {
          return value !== true && value !== false;
        }
        if (question.question_type === "choice") {
          const selected = String(value || "").trim();
          if (!selected) return true;
          const { options } = extractQuestionMeta(question);
          if (!options.length) return false;
          return !options.includes(selected);
        }
        return false;
      });

      if (requiredErrors.length > 0) {
        throw new Error("Responda todas as perguntas obrigatorias.");
      }

      const ratingQuestions = activeQuestions.filter(
        (question) => question.question_type === "rating"
      );
      const ratingAverage =
        ratingQuestions.length > 0
          ? Math.round(
              ratingQuestions.reduce(
                (sum, question) => sum + Number(answers[question.id] || 0),
                0
              ) / ratingQuestions.length
            )
          : null;

      const answersPayload = activeQuestions.map((question) => {
        const meta = extractQuestionMeta(question);
        return {
          id: question.id,
          question: meta.label || question.question_text,
          type: question.question_type,
          options: meta.options,
          value: answers[question.id] ?? null,
        };
      });

      const participant = participants[0];
      await dataClient.entities.TrainingFeedback.create({
        training_id: trainingId,
        training_title: training.title,
        participant_id: participant.id,
        participant_name: participant.professional_name,
        rating: ratingAverage,
        comments,
        would_recommend: wouldRecommend,
        answers: answersPayload,
      });
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (error) => {
      if (isMissingSupabaseTableError(error, "training_feedback")) {
        setLookupError(
          "A tabela training_feedback nao existe no banco. Solicite ao administrador a atualizacao do schema."
        );
        return;
      }
      setLookupError(error.message || "Erro ao enviar avaliacao.");
    },
  });

  if (!trainingId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                Link invalido. Informe o treinamento corretamente.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!training) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                Treinamento nao encontrado.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Avaliacao enviada!</h2>
              <p className="text-slate-600 mt-2">Obrigado pelo seu feedback.</p>
            </div>
            <Button onClick={() => setSubmitted(false)} variant="outline">
              Enviar outra avaliacao
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{training.title}</CardTitle>
            <p className="text-sm text-slate-600 mt-1">Formulario de avaliacao do treinamento</p>
            <div className="pt-2 flex flex-wrap justify-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {trainingDateSummary}
              </span>
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                Coordenador: {training.coordinator || "-"}
              </span>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF (opcional)</Label>
                <Input
                  id="cpf"
                  value={cpf}
                  onChange={(event) => setCpf(event.target.value)}
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail (opcional)</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nome@email.com"
                />
              </div>
            </div>

            {activeQuestions.length === 0 ? (
              hasQuestionsError ? (
                <Alert className="border-red-200 bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    {questionsLoadErrorMessage}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    Nenhuma pergunta configurada para este treinamento.
                  </AlertDescription>
                </Alert>
              )
            ) : (
              activeQuestions.map((question) => {
                const meta = extractQuestionMeta(question);
                const label = meta.label || question.question_text;

                if (question.question_type === "text") {
                  return (
                    <div key={question.id} className="space-y-2">
                      <Label>
                        {label} {question.required ? "*" : ""}
                      </Label>
                      <Textarea
                        value={answers[question.id] || ""}
                        onChange={(event) =>
                          setAnswers((prev) => ({
                            ...prev,
                            [question.id]: event.target.value,
                          }))
                        }
                        rows={3}
                      />
                    </div>
                  );
                }

                if (question.question_type === "yesno") {
                  const yesNoValue =
                    answers[question.id] === true
                      ? "sim"
                      : answers[question.id] === false
                      ? "nao"
                      : "";

                  return (
                    <div key={question.id} className="space-y-2">
                      <Label>
                        {label} {question.required ? "*" : ""}
                      </Label>
                      <RadioGroup
                        value={yesNoValue}
                        onValueChange={(value) =>
                          setAnswers((prev) => ({
                            ...prev,
                            [question.id]: value === "sim",
                          }))
                        }
                        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                      >
                        <div className="flex items-center gap-3 rounded-md border px-3 py-2">
                          <RadioGroupItem id={`question-${question.id}-sim`} value="sim" />
                          <Label
                            htmlFor={`question-${question.id}-sim`}
                            className="font-normal"
                          >
                            Sim
                          </Label>
                        </div>
                        <div className="flex items-center gap-3 rounded-md border px-3 py-2">
                          <RadioGroupItem id={`question-${question.id}-nao`} value="nao" />
                          <Label
                            htmlFor={`question-${question.id}-nao`}
                            className="font-normal"
                          >
                            Nao
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>
                  );
                }

                if (question.question_type === "choice") {
                  return (
                    <div key={question.id} className="space-y-2">
                      <Label>
                        {label} {question.required ? "*" : ""}
                      </Label>
                      {meta.options.length > 0 ? (
                        <RadioGroup
                          value={String(answers[question.id] || "")}
                          onValueChange={(value) =>
                            setAnswers((prev) => ({ ...prev, [question.id]: value }))
                          }
                          className="space-y-2"
                        >
                          {meta.options.map((option, index) => {
                            const optionId = `question-${question.id}-option-${index}`;
                            return (
                              <div
                                key={optionId}
                                className="flex items-center gap-3 rounded-md border px-3 py-2"
                              >
                                <RadioGroupItem id={optionId} value={option} />
                                <Label htmlFor={optionId} className="font-normal">
                                  {option}
                                </Label>
                              </div>
                            );
                          })}
                        </RadioGroup>
                      ) : (
                        <Input
                          value={String(answers[question.id] || "")}
                          onChange={(event) =>
                            setAnswers((prev) => ({
                              ...prev,
                              [question.id]: event.target.value,
                            }))
                          }
                          placeholder="Digite sua resposta"
                        />
                      )}
                    </div>
                  );
                }

                return (
                  <StarRating
                    key={question.id}
                    label={`${label}${question.required ? " *" : ""}`}
                    value={Number(answers[question.id] || 0)}
                    onChange={(value) =>
                      setAnswers((prev) => ({ ...prev, [question.id]: value }))
                    }
                  />
                );
              })
            )}

            <div className="space-y-2">
              <Label>Comentarios e sugestoes</Label>
              <Textarea
                value={comments}
                onChange={(event) => setComments(event.target.value)}
                rows={4}
                placeholder="Compartilhe sua experiencia..."
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="would_recommend"
                checked={wouldRecommend}
                onCheckedChange={(checked) => setWouldRecommend(Boolean(checked))}
              />
              <Label htmlFor="would_recommend" className="font-normal">
                Eu recomendaria este treinamento
              </Label>
            </div>

            {lookupError && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">{lookupError}</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={() => submitFeedback.mutate()}
              className="w-full"
              disabled={
                submitFeedback.isPending ||
                activeQuestions.length === 0 ||
                hasQuestionsError
              }
            >
              {submitFeedback.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar Avaliacao"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
