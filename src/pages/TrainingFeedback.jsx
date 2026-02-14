import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, AlertCircle, Loader2, Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import DataTable from "@/components/common/DataTable";
import { toast } from "sonner";

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

const CHOICE_SPLIT_TOKEN = "||";
const CHOICE_OPTION_TOKEN = "|";

const normalizeChoiceOptions = (options) =>
  Array.from(
    new Set(
      (options || [])
        .map((option) => String(option || "").trim())
        .filter(Boolean)
    )
  );

const parseChoiceOptionsFromText = (value) =>
  normalizeChoiceOptions(
    String(value || "")
      .split(CHOICE_OPTION_TOKEN)
      .map((item) => item.trim())
  );

const buildChoiceQuestionText = (label, options) => {
  const cleanLabel = String(label || "").trim();
  const cleanOptions = normalizeChoiceOptions(options);
  if (!cleanOptions.length) return cleanLabel;
  return `${cleanLabel} ${CHOICE_SPLIT_TOKEN} ${cleanOptions.join(` ${CHOICE_OPTION_TOKEN} `)}`;
};

const extractQuestionMeta = (question) => {
  const rawText = String(question?.question_text || "");
  const questionType = String(question?.question_type || "").trim().toLowerCase();

  if (questionType !== "choice") {
    return {
      label: rawText.trim(),
      options: [],
    };
  }

  const fromColumn = normalizeChoiceOptions(question?.question_options);
  if (fromColumn.length > 0) {
    return {
      label: rawText.trim(),
      options: fromColumn,
    };
  }

  const [labelPart, optionsPart = ""] = rawText.split(CHOICE_SPLIT_TOKEN);
  const options = parseChoiceOptionsFromText(optionsPart);

  return {
    label: String(labelPart || rawText).trim(),
    options,
  };
};

export default function TrainingFeedback() {
  const queryString =
    window.location.search || window.location.hash.split("?")[1] || "";
  const urlParams = new URLSearchParams(queryString);
  const trainingId = urlParams.get("training");
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [lookupError, setLookupError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const [formData, setFormData] = useState({
    rating: 0,
    content_quality: 0,
    instructor_rating: 0,
    comments: "",
    would_recommend: false,
  });

  const [questionFormOpen, setQuestionFormOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [questionDeleteConfirm, setQuestionDeleteConfirm] = useState(null);
  const [questionSearch, setQuestionSearch] = useState("");

  const defaultQuestions = [
    { question_text: "Conteúdo apresentado", question_type: "rating", order: 1 },
    { question_text: "Didática do instrutor", question_type: "rating", order: 2 },
    { question_text: "Material de apoio", question_type: "rating", order: 3 },
    { question_text: "Duração/carga horária do curso", question_type: "choice", order: 4, question_options: ["Muito curta", "Adequada", "Muito longa"] },
    { question_text: "Horário/tempo do treinamento", question_type: "choice", order: 5, question_options: ["Muito ruim", "Ruim", "Adequado", "Muito bom"] },
    { question_text: "Local e infraestrutura", question_type: "choice", order: 6, question_options: ["Ruim", "Regular", "Bom", "Excelente"] },
    { question_text: "Assuntos mais importantes para sua prática", question_type: "text", order: 7 },
    { question_text: "Assuntos menos importantes", question_type: "text", order: 8, required: false },
    { question_text: "Sugestões para próximos treinamentos", question_type: "text", order: 9, required: false },
  ];

  const getDefaultQuestion = () => ({
    training_id: trainingId,
    question_text: "",
    question_type: "rating",
    question_options_text: "",
    required: true,
    order: 0,
    is_active: true,
  });

  const [questionFormData, setQuestionFormData] = useState(getDefaultQuestion());

  const { data: training, isLoading } = useQuery({
    queryKey: ["feedback-training", trainingId],
    queryFn: async () => {
      const trainings = await dataClient.entities.Training.list();
      return trainings.find((t) => t.id === trainingId);
    },
    enabled: !!trainingId,
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["training-feedback-questions", trainingId],
    queryFn: async () => {
      const allQuestions = await dataClient.entities.TrainingFeedbackQuestion.list("order");
      return allQuestions.filter(
        (question) => question.is_active && (!question.training_id || question.training_id === trainingId)
      );
    },
    enabled: !!trainingId,
  });

  const activeQuestions = [...questions].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );

  const [answers, setAnswers] = useState({});

  const createQuestion = useMutation({
    mutationFn: (data) => dataClient.entities.TrainingFeedbackQuestion.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-feedback-questions"] });
      setQuestionFormData(getDefaultQuestion());
      setEditingQuestion(null);
      setQuestionFormOpen(false);
      toast.success("Pergunta criada.");
    },
    onError: (error) => toast.error(error?.message || "Erro ao criar pergunta."),
  });

  const updateQuestion = useMutation({
    mutationFn: ({ id, data }) =>
      dataClient.entities.TrainingFeedbackQuestion.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-feedback-questions"] });
      setQuestionFormData(getDefaultQuestion());
      setEditingQuestion(null);
      setQuestionFormOpen(false);
      toast.success("Pergunta atualizada.");
    },
    onError: (error) => toast.error(error?.message || "Erro ao atualizar pergunta."),
  });

  const deleteQuestion = useMutation({
    mutationFn: (id) => dataClient.entities.TrainingFeedbackQuestion.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-feedback-questions"] });
      setQuestionDeleteConfirm(null);
      toast.success("Pergunta excluída.");
    },
    onError: (error) => toast.error(error?.message || "Erro ao excluir pergunta."),
  });

  const applyDefaultQuestions = useMutation({
    mutationFn: (payload) =>
      dataClient.entities.TrainingFeedbackQuestion.bulkCreate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-feedback-questions"] });
      toast.success("Perguntas padrão aplicadas.");
    },
    onError: (error) => toast.error(error?.message || "Erro ao aplicar perguntas."),
  });

  const handleSaveQuestion = (event) => {
    event.preventDefault();
    const cleanQuestionText = String(questionFormData.question_text || "").trim();
    if (!cleanQuestionText) {
      toast.error("Informe o texto da pergunta.");
      return;
    }

    let questionText = cleanQuestionText;
    if (questionFormData.question_type === "choice") {
      const options = normalizeChoiceOptions(
        String(questionFormData.question_options_text || "")
          .split(/\r?\n/)
          .map((item) => item.trim())
      );
      if (options.length < 2) {
        toast.error("Perguntas com alternativas precisam de pelo menos 2 opções.");
        return;
      }
      questionText = buildChoiceQuestionText(cleanQuestionText, options);
    }

    const { question_options_text, ...questionBase } = questionFormData;
    const payload = {
      ...questionBase,
      question_text: questionText,
      training_id: questionFormData.training_id || null,
      order: Number(questionFormData.order) || 0,
    };
    if (editingQuestion) {
      updateQuestion.mutate({ id: editingQuestion.id, data: payload });
    } else {
      createQuestion.mutate(payload);
    }
  };

  const handleEditQuestion = (question) => {
    const questionMeta = extractQuestionMeta(question);
    setEditingQuestion(question);
    setQuestionFormData({
      ...question,
      question_text: questionMeta.label,
      question_options_text: questionMeta.options.join("\n"),
      training_id: question.training_id ?? null,
      order: question.order ?? 0,
    });
    setQuestionFormOpen(true);
  };

  const handleApplyDefaults = () => {
    if (!trainingId) return;
    const existing = new Set(
      questions.map((question) =>
        String(extractQuestionMeta(question).label || "").trim().toLowerCase()
      )
    );
    const payload = defaultQuestions
      .map((question) => {
        const options = normalizeChoiceOptions(question.question_options);
        const { question_options, ...restQuestion } = question;
        return {
          ...restQuestion,
          question_text:
            question.question_type === "choice"
              ? buildChoiceQuestionText(question.question_text, options)
              : question.question_text,
        };
      })
      .filter((question) => {
        const questionLabel = String(
          extractQuestionMeta(question).label || question.question_text || ""
        )
          .trim()
          .toLowerCase();
        return !existing.has(questionLabel);
      })
      .map((q) => ({
        ...q,
        training_id: trainingId,
        required: q.required !== false,
        is_active: true,
      }));
    if (payload.length === 0) {
      toast.info("Perguntas padrão já estão configuradas.");
      return;
    }
    applyDefaultQuestions.mutate(payload);
  };

  const submitFeedback = useMutation({
    mutationFn: async () => {
      setLookupError(null);
      const cpfDigits = cpf.replace(/\D/g, "");
      const emailValue = email.trim().toLowerCase();
      if (!cpfDigits && !emailValue) {
        throw new Error("Informe CPF ou e-mail para identificar sua inscrição.");
      }

      let participants = [];
      if (cpfDigits) {
        participants = await dataClient.entities.TrainingParticipant.filter({
          training_id: trainingId,
          professional_cpf: cpfDigits,
        });
      } else if (emailValue) {
        participants = await dataClient.entities.TrainingParticipant.filter({
          training_id: trainingId,
          professional_email: emailValue,
        });
      }

      if (participants.length === 0) {
        throw new Error("Inscrição não encontrada para este treinamento.");
      }
      if (participants.length > 1) {
        throw new Error("Encontramos mais de uma inscrição. Use o CPF completo.");
      }

      const participant = participants[0];

      if (activeQuestions.length === 0) {
        throw new Error("Nenhuma pergunta foi configurada para este treinamento.");
      }

      const validationErrors = activeQuestions
        .filter((question) => question.required)
        .filter((question) => {
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

      if (validationErrors.length > 0) {
        throw new Error("Responda todas as perguntas obrigatórias.");
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

      await dataClient.entities.TrainingFeedback.create({
        training_id: trainingId,
        training_title: training.title,
        participant_id: participant.id,
        participant_name: participant.professional_name,
        rating: ratingAverage,
        comments: formData.comments,
        would_recommend: formData.would_recommend,
        answers: answersPayload,
      });
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (error) => {
      setLookupError(error.message || "Erro ao enviar avaliação.");
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
                Link inválido. Informe o treinamento corretamente.
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
                Treinamento não encontrado.
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
              <h2 className="text-2xl font-bold text-slate-900">Avaliação enviada!</h2>
              <p className="text-slate-600 mt-2">Obrigado pelo seu feedback.</p>
            </div>
            <Button onClick={() => setSubmitted(false)} variant="outline">
              Enviar outra avaliação
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const questionColumns = [
    {
      header: "Pergunta",
      render: (row) => {
        const meta = extractQuestionMeta(row);
        return <span className="font-medium">{meta.label || row.question_text}</span>;
      },
      cellClassName: "font-medium",
    },
    {
      header: "Tipo",
      render: (row) => {
        const labels = {
          rating: "Escala 1-5",
          text: "Texto",
          yesno: "Sim/Não",
          choice: "Alternativas",
        };
        return labels[row.question_type] || row.question_type;
      },
    },
    {
      header: "Obrigatória",
      cellClassName: "text-center",
      render: (row) => (row.required ? "✓" : "-"),
    },
    {
      header: "Ações",
      sortable: false,
      cellClassName: "text-right",
      render: (row) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => handleEditQuestion(row)}>
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600"
            onClick={() => setQuestionDeleteConfirm(row)}
          >
            Excluir
          </Button>
        </div>
      ),
    },
  ];

  const filteredQuestions = questions.filter((question) =>
    (extractQuestionMeta(question).label || question.question_text || "")
      .toLowerCase()
      .includes(questionSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Avaliação do Treinamento</CardTitle>
          <p className="text-sm text-slate-600 mt-1">{training.title}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {isAuthenticated && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Configurar Perguntas da Avaliação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => setQuestionFormOpen(true)}>
                    Nova Pergunta
                  </Button>
                  <Button variant="outline" onClick={handleApplyDefaults}>
                    Aplicar Modelo de Ficha
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const link = `${window.location.origin}/TrainingFeedback?training=${encodeURIComponent(trainingId)}`;
                      navigator.clipboard.writeText(link);
                      toast.success("Link de avaliação copiado.");
                    }}
                  >
                    Copiar Link da Avaliação
                  </Button>
                </div>
                <Alert>
                  <AlertDescription>
                    Modelo sugerido: didática, conteúdo, duração do curso, horário/tempo, local,
                    assuntos mais e menos importantes e sugestões para próximos treinamentos.
                  </AlertDescription>
                </Alert>
                <Input
                  placeholder="Buscar pergunta..."
                  value={questionSearch}
                  onChange={(e) => setQuestionSearch(e.target.value)}
                />
                <DataTable
                  columns={questionColumns}
                  data={filteredQuestions}
                  emptyMessage="Nenhuma pergunta cadastrada"
                />
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF (opcional)</Label>
              <Input
                id="cpf"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail (opcional)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@email.com"
              />
            </div>
          </div>

          {activeQuestions.length === 0 ? (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                Nenhuma pergunta configurada para este treinamento.
              </AlertDescription>
            </Alert>
          ) : (
            activeQuestions.map((question) => {
              const questionMeta = extractQuestionMeta(question);
              const questionLabel = questionMeta.label || question.question_text;

              if (question.question_type === "text") {
                return (
                  <div key={question.id} className="space-y-2">
                    <Label>
                      {questionLabel} {question.required && "*"}
                    </Label>
                    <Textarea
                      value={answers[question.id] || ""}
                      onChange={(e) =>
                        setAnswers({ ...answers, [question.id]: e.target.value })
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
                      {questionLabel} {question.required && "*"}
                    </Label>
                    <RadioGroup
                      value={yesNoValue}
                      onValueChange={(value) =>
                        setAnswers({ ...answers, [question.id]: value === "sim" })
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
                          Não
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                );
              }

              if (question.question_type === "choice") {
                const options = questionMeta.options;
                return (
                  <div key={question.id} className="space-y-2">
                    <Label>
                      {questionLabel} {question.required && "*"}
                    </Label>
                    {options.length > 0 ? (
                      <RadioGroup
                        value={String(answers[question.id] || "")}
                        onValueChange={(value) =>
                          setAnswers({ ...answers, [question.id]: value })
                        }
                        className="space-y-2"
                      >
                        {options.map((option, index) => {
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
                          setAnswers({
                            ...answers,
                            [question.id]: event.target.value,
                          })
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
                  label={`${questionLabel}${question.required ? " *" : ""}`}
                  value={Number(answers[question.id] || 0)}
                  onChange={(value) =>
                    setAnswers({ ...answers, [question.id]: value })
                  }
                />
              );
            })
          )}

          <div>
            <Label>Comentários e Sugestões</Label>
            <Textarea
              value={formData.comments}
              onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
              rows={4}
              placeholder="Compartilhe sua experiência..."
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="would_recommend"
              type="checkbox"
              checked={formData.would_recommend}
              onChange={(e) =>
                setFormData({ ...formData, would_recommend: e.target.checked })
              }
            />
            <Label htmlFor="would_recommend" className="font-normal">
              Eu recomendaria este treinamento
            </Label>
          </div>

          {lookupError && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {lookupError}
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={() => submitFeedback.mutate()}
            className="w-full"
            disabled={submitFeedback.isPending}
          >
            {submitFeedback.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              "Enviar Avaliação"
            )}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={questionFormOpen} onOpenChange={setQuestionFormOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingQuestion ? "Editar Pergunta" : "Nova Pergunta"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveQuestion} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="question-text">Pergunta</Label>
              <Input
                id="question-text"
                value={questionFormData.question_text}
                onChange={(e) =>
                  setQuestionFormData({
                    ...questionFormData,
                    question_text: e.target.value,
                  })
                }
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={questionFormData.question_type}
                  onValueChange={(value) =>
                    setQuestionFormData({ ...questionFormData, question_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rating">Escala 1-5</SelectItem>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="yesno">Sim/Não</SelectItem>
                    <SelectItem value="choice">Alternativas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ordem</Label>
                <Input
                  type="number"
                  value={questionFormData.order}
                  onChange={(e) =>
                    setQuestionFormData({
                      ...questionFormData,
                      order: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>

            {questionFormData.question_type === "choice" && (
              <div className="space-y-2">
                <Label htmlFor="question-options">
                  Alternativas (uma por linha)
                </Label>
                <Textarea
                  id="question-options"
                  value={questionFormData.question_options_text || ""}
                  onChange={(e) =>
                    setQuestionFormData({
                      ...questionFormData,
                      question_options_text: e.target.value,
                    })
                  }
                  placeholder={"Muito curta\nAdequada\nMuito longa"}
                  rows={4}
                />
                <p className="text-xs text-slate-500">
                  Adicione pelo menos 2 alternativas.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Checkbox
                id="question-required"
                checked={questionFormData.required}
                onCheckedChange={(checked) =>
                  setQuestionFormData({
                    ...questionFormData,
                    required: Boolean(checked),
                  })
                }
              />
              <Label htmlFor="question-required" className="font-normal">
                Pergunta obrigatória
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="question-active"
                checked={questionFormData.is_active}
                onCheckedChange={(checked) =>
                  setQuestionFormData({
                    ...questionFormData,
                    is_active: Boolean(checked),
                  })
                }
              />
              <Label htmlFor="question-active" className="font-normal">
                Pergunta ativa
              </Label>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setQuestionFormData(getDefaultQuestion());
                  setEditingQuestion(null);
                  setQuestionFormOpen(false);
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700"
                disabled={createQuestion.isPending || updateQuestion.isPending}
              >
                {editingQuestion ? "Salvar" : "Criar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!questionDeleteConfirm} onOpenChange={() => setQuestionDeleteConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir Pergunta</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Tem certeza que deseja excluir a pergunta "
            {questionDeleteConfirm?.question_text}"?
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setQuestionDeleteConfirm(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteQuestion.mutate(questionDeleteConfirm.id)}
            >
              Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
