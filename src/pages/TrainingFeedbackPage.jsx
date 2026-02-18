import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertCircle,
  Copy,
  ExternalLink,
  Loader2,
  MessageSquare,
  Plus,
} from "lucide-react";
import { formatDateSafe } from "@/lib/date";
import {
  getSupabaseErrorMessage,
  isMissingSupabaseTableError,
} from "@/lib/supabaseErrors";
import {
  DEFAULT_TRAINING_FEEDBACK_QUESTIONS,
  buildChoiceQuestionText,
  extractQuestionMeta,
  normalizeChoiceOptions,
} from "@/lib/trainingFeedbackSchema";

const createDefaultQuestion = (trainingId) => ({
  training_id: trainingId || null,
  question_text: "",
  question_type: "rating",
  question_options_text: "",
  required: true,
  order: 0,
  is_active: true,
});

const resolveQuestionMutationError = (error, fallbackMessage) => {
  const message = getSupabaseErrorMessage(error);
  if (!message) return fallbackMessage;

  if (isMissingSupabaseTableError(error, "training_feedback_questions")) {
    return "A tabela de perguntas de avaliacao nao existe no banco. Execute o script SQL de criacao da tabela e recarregue o app.";
  }

  const normalized = message.toLowerCase();
  if (
    normalized.includes("permission") ||
    normalized.includes("permiss") ||
    normalized.includes("policy") ||
    normalized.includes("row level security") ||
    normalized.includes("rls") ||
    normalized.includes("42501")
  ) {
    return "Sem permissao para alterar perguntas de avaliacao. Solicite acesso de administrador.";
  }

  return message;
};

export default function TrainingFeedbackPage() {
  const queryString =
    window.location.search || window.location.hash.split("?")[1] || "";
  const urlParams = new URLSearchParams(queryString);
  const trainingId = urlParams.get("training");
  const feedbackLink = trainingId
    ? `${window.location.origin}/TrainingFeedback?training=${encodeURIComponent(trainingId)}`
    : "";

  const queryClient = useQueryClient();

  const [questionFormOpen, setQuestionFormOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [questionDeleteConfirm, setQuestionDeleteConfirm] = useState(null);
  const [questionSearch, setQuestionSearch] = useState("");
  const [showInactiveQuestions, setShowInactiveQuestions] = useState(false);
  const [questionActionStatus, setQuestionActionStatus] = useState(null);
  const [questionFormData, setQuestionFormData] = useState(
    createDefaultQuestion(trainingId)
  );

  React.useEffect(() => {
    setQuestionFormData(createDefaultQuestion(trainingId));
    setEditingQuestion(null);
  }, [trainingId]);

  const { data: training, isLoading } = useQuery({
    queryKey: ["feedback-training-page", trainingId],
    queryFn: async () => {
      const trainings = await dataClient.entities.Training.list();
      return trainings.find((item) => item.id === trainingId);
    },
    enabled: !!trainingId,
  });

  const questionsQuery = useQuery({
    queryKey: ["training-feedback-questions", trainingId],
    queryFn: async () => {
      const allQuestions =
        await dataClient.entities.TrainingFeedbackQuestion.list("order");
      return allQuestions.filter(
        (question) => !question.training_id || question.training_id === trainingId
      );
    },
    enabled: !!trainingId,
  });
  const questionsData = questionsQuery.data || [];
  const questionsLoadingState = questionsQuery.isLoading;
  const questionsError = questionsQuery.error;
  const hasQuestionsError = questionsQuery.isError;
  const isQuestionsTableMissing = isMissingSupabaseTableError(
    questionsError,
    "training_feedback_questions"
  );
  const questionsLoadErrorMessage = hasQuestionsError
    ? isQuestionsTableMissing
      ? "A tabela training_feedback_questions nao foi encontrada no Supabase. Execute o script SQL de criacao da tabela e recarregue a pagina."
      : getSupabaseErrorMessage(questionsError) ||
        "Nao foi possivel carregar as perguntas da avaliacao."
    : "";
  const disableQuestionActions = hasQuestionsError;

  const resetQuestionForm = () => {
    setQuestionFormData(createDefaultQuestion(trainingId));
    setEditingQuestion(null);
    setQuestionFormOpen(false);
  };

  const createQuestion = useMutation({
    mutationFn: (payload) => dataClient.entities.TrainingFeedbackQuestion.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-feedback-questions"] });
      setQuestionActionStatus({
        type: "success",
        message: "Pergunta criada com sucesso.",
      });
      resetQuestionForm();
    },
    onError: (error) => {
      setQuestionActionStatus({
        type: "error",
        message: resolveQuestionMutationError(
          error,
          "Nao foi possivel criar a pergunta."
        ),
      });
    },
  });

  const updateQuestion = useMutation({
    mutationFn: ({ id, data }) =>
      dataClient.entities.TrainingFeedbackQuestion.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-feedback-questions"] });
      setQuestionActionStatus({
        type: "success",
        message: "Pergunta atualizada com sucesso.",
      });
      resetQuestionForm();
    },
    onError: (error) => {
      setQuestionActionStatus({
        type: "error",
        message: resolveQuestionMutationError(
          error,
          "Nao foi possivel atualizar a pergunta."
        ),
      });
    },
  });

  const deleteQuestion = useMutation({
    mutationFn: (id) => dataClient.entities.TrainingFeedbackQuestion.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-feedback-questions"] });
      setQuestionDeleteConfirm(null);
      setQuestionActionStatus({
        type: "success",
        message: "Pergunta excluida com sucesso.",
      });
    },
    onError: (error) => {
      setQuestionActionStatus({
        type: "error",
        message: resolveQuestionMutationError(
          error,
          "Nao foi possivel excluir a pergunta."
        ),
      });
    },
  });

  const applyDefaultQuestions = useMutation({
    mutationFn: (payload) =>
      dataClient.entities.TrainingFeedbackQuestion.bulkCreate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-feedback-questions"] });
      setQuestionActionStatus({
        type: "success",
        message: "Modelo de perguntas aplicado com sucesso.",
      });
    },
    onError: (error) => {
      setQuestionActionStatus({
        type: "error",
        message: resolveQuestionMutationError(
          error,
          "Nao foi possivel aplicar o modelo de perguntas."
        ),
      });
    },
  });

  const handleSaveQuestion = (event) => {
    event.preventDefault();
    setQuestionActionStatus(null);
    if (disableQuestionActions) {
      setQuestionActionStatus({
        type: "error",
        message:
          questionsLoadErrorMessage ||
          "Nao foi possivel salvar porque as perguntas nao puderam ser carregadas.",
      });
      return;
    }
    const cleanQuestionText = String(questionFormData.question_text || "").trim();
    if (!cleanQuestionText) {
      alert("Informe o texto da pergunta.");
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
        alert("Perguntas com alternativas precisam de pelo menos 2 opcoes.");
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
      required: questionFormData.required !== false,
      is_active: questionFormData.is_active !== false,
    };

    if (editingQuestion) {
      updateQuestion.mutate({ id: editingQuestion.id, data: payload });
      return;
    }
    createQuestion.mutate(payload);
  };

  const handleEditQuestion = (question) => {
    const meta = extractQuestionMeta(question);
    setEditingQuestion(question);
    setQuestionFormData({
      ...question,
      question_text: meta.label,
      question_options_text: meta.options.join("\n"),
      training_id:
        question.training_id === undefined
          ? trainingId || null
          : question.training_id,
      order: question.order ?? 0,
      required: question.required !== false,
      is_active: question.is_active !== false,
    });
    setQuestionFormOpen(true);
  };

  const handleApplyDefaults = () => {
    if (!trainingId) return;
    setQuestionActionStatus(null);
    if (disableQuestionActions) {
      setQuestionActionStatus({
        type: "error",
        message:
          questionsLoadErrorMessage ||
          "Nao foi possivel aplicar o modelo porque as perguntas nao puderam ser carregadas.",
      });
      return;
    }
    const existing = new Set(
      questionsData.map((question) =>
        String(extractQuestionMeta(question).label || "")
          .trim()
          .toLowerCase()
      )
    );

    const payload = DEFAULT_TRAINING_FEEDBACK_QUESTIONS.map((question) => {
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
        const label = String(
          extractQuestionMeta(question).label || question.question_text || ""
        )
          .trim()
          .toLowerCase();
        return !existing.has(label);
      })
      .map((question) => ({
        ...question,
        training_id: trainingId,
        required: question.required !== false,
        is_active: true,
      }));

    if (!payload.length) {
      setQuestionActionStatus({
        type: "info",
        message: "O modelo ja esta configurado para este treinamento.",
      });
      return;
    }

    applyDefaultQuestions.mutate(payload);
  };

  const handleCopyFeedbackLink = () => {
    if (!feedbackLink) return;
    navigator.clipboard.writeText(feedbackLink);
    alert("Link de avaliacao copiado!");
  };

  const filteredQuestions = useMemo(() => {
    const searchTerm = questionSearch.trim().toLowerCase();
    return [...questionsData]
      .filter((question) => {
        if (!showInactiveQuestions && !question.is_active) return false;
        if (!searchTerm) return true;
        const label = extractQuestionMeta(question).label || question.question_text;
        return String(label || "").toLowerCase().includes(searchTerm);
      })
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [questionsData, questionSearch, showInactiveQuestions]);

  const questionColumns = [
    {
      header: "Ordem",
      accessor: "order",
      cellClassName: "font-mono text-center",
    },
    {
      header: "Pergunta",
      cellClassName: "font-medium",
      render: (row) => {
        const meta = extractQuestionMeta(row);
        return (
          <div>
            <p className="font-medium">{meta.label || row.question_text}</p>
            {row.question_type === "choice" && meta.options.length > 0 && (
              <p className="text-xs text-slate-500">
                Opcoes: {meta.options.join(" | ")}
              </p>
            )}
          </div>
        );
      },
    },
    {
      header: "Tipo",
      render: (row) => {
        const labels = {
          rating: "Escala 1-5",
          text: "Texto",
          yesno: "Sim/Nao",
          choice: "Alternativas",
        };
        return labels[row.question_type] || row.question_type;
      },
    },
    {
      header: "Obrigatoria",
      cellClassName: "text-center",
      render: (row) => (row.required ? "Sim" : "-"),
    },
    {
      header: "Status",
      render: (row) => (
        <Badge
          className={
            row.is_active
              ? "bg-green-100 text-green-700"
              : "bg-slate-100 text-slate-700"
          }
        >
          {row.is_active ? "Ativa" : "Inativa"}
        </Badge>
      ),
    },
    {
      header: "Acoes",
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
            className="text-red-600 hover:text-red-700"
            onClick={() => setQuestionDeleteConfirm(row)}
          >
            Excluir
          </Button>
        </div>
      ),
    },
  ];

  if (!trainingId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Pagina de Avaliacao"
          subtitle="Configure o treinamento para gerar o link publico"
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

  if (isLoading) {
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
          title="Pagina de Avaliacao"
          subtitle="Treinamento nao encontrado"
        />
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            Treinamento nao encontrado.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const firstTrainingDate =
    Array.isArray(training.dates) && training.dates.length > 0
      ? training.dates[0]?.date
      : training.date;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Avaliacao - ${training.title}`}
        subtitle="Configure a mascara e visualize o formulario de avaliacao"
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-600" />
            Configuracao da Avaliacao
          </CardTitle>
          <p className="text-sm text-slate-500">
            {formatDateSafe(firstTrainingDate) || "Data a definir"}
            {training.coordinator ? ` | Coord.: ${training.coordinator}` : ""}
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="mask" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="mask">Mascara</TabsTrigger>
              <TabsTrigger value="preview">Visualizacao</TabsTrigger>
            </TabsList>

            <TabsContent value="mask" className="mt-6 space-y-6">
              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="outline" onClick={handleCopyFeedbackLink}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copiar Link da Avaliacao
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleApplyDefaults}
                  disabled={disableQuestionActions}
                >
                  Aplicar Modelo de Ficha
                </Button>
                <Button
                  type="button"
                  disabled={disableQuestionActions}
                  onClick={() => {
                    setQuestionActionStatus(null);
                    setEditingQuestion(null);
                    setQuestionFormData(createDefaultQuestion(trainingId));
                    setQuestionFormOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Pergunta
                </Button>
              </div>

              {hasQuestionsError && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertDescription className="text-red-800">
                    {questionsLoadErrorMessage}
                  </AlertDescription>
                </Alert>
              )}

              {questionActionStatus && (
                <Alert
                  className={
                    questionActionStatus.type === "error"
                      ? "border-red-200 bg-red-50"
                      : questionActionStatus.type === "success"
                      ? "border-green-200 bg-green-50"
                      : "border-blue-200 bg-blue-50"
                  }
                >
                  <AlertDescription
                    className={
                      questionActionStatus.type === "error"
                        ? "text-red-800"
                        : questionActionStatus.type === "success"
                        ? "text-green-800"
                        : "text-blue-800"
                    }
                  >
                    {questionActionStatus.message}
                  </AlertDescription>
                </Alert>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Perguntas da Avaliacao</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
                    <Input
                      placeholder="Buscar pergunta..."
                      value={questionSearch}
                      onChange={(event) => setQuestionSearch(event.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="show-inactive-questions"
                        checked={showInactiveQuestions}
                        onCheckedChange={(checked) =>
                          setShowInactiveQuestions(Boolean(checked))
                        }
                      />
                      <Label
                        htmlFor="show-inactive-questions"
                        className="text-sm font-normal"
                      >
                        Mostrar inativas
                      </Label>
                    </div>
                  </div>
                  <DataTable
                    columns={questionColumns}
                    data={filteredQuestions}
                    isLoading={questionsLoadingState}
                    emptyMessage="Nenhuma pergunta cadastrada"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="preview" className="mt-6 space-y-4">
              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="outline" onClick={handleCopyFeedbackLink}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copiar Link da Avaliacao
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    window.open(feedbackLink, "_blank", "noopener,noreferrer")
                  }
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Abrir em Nova Aba
                </Button>
              </div>

              <Alert>
                <AlertDescription>
                  Esta e a visualizacao do formulario publico que os participantes
                  receberao.
                </AlertDescription>
              </Alert>

              <div className="rounded-lg border bg-white overflow-hidden">
                <iframe
                  title={`Visualizacao da avaliacao - ${training.title}`}
                  src={feedbackLink}
                  className="w-full h-[760px]"
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog
        open={questionFormOpen}
        onOpenChange={(open) => {
          if (!open) {
            resetQuestionForm();
            return;
          }
          setQuestionFormOpen(true);
        }}
      >
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
                onChange={(event) =>
                  setQuestionFormData({
                    ...questionFormData,
                    question_text: event.target.value,
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
                    <SelectItem value="yesno">Sim/Nao</SelectItem>
                    <SelectItem value="choice">Alternativas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ordem</Label>
                <Input
                  type="number"
                  value={questionFormData.order}
                  onChange={(event) =>
                    setQuestionFormData({
                      ...questionFormData,
                      order: Number(event.target.value),
                    })
                  }
                />
              </div>
            </div>

            {questionFormData.question_type === "choice" && (
              <div className="space-y-2">
                <Label htmlFor="question-options">Alternativas (uma por linha)</Label>
                <Textarea
                  id="question-options"
                  value={questionFormData.question_options_text || ""}
                  onChange={(event) =>
                    setQuestionFormData({
                      ...questionFormData,
                      question_options_text: event.target.value,
                    })
                  }
                  placeholder={"Muito curta\nAdequada\nMuito longa"}
                  rows={4}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Aplicacao</Label>
              <Select
                value={questionFormData.training_id ? "training" : "global"}
                onValueChange={(value) =>
                  setQuestionFormData({
                    ...questionFormData,
                    training_id: value === "global" ? null : trainingId,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="training">Somente este treinamento</SelectItem>
                  <SelectItem value="global">Global (todos os treinamentos)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="question-required"
                  checked={questionFormData.required !== false}
                  onCheckedChange={(checked) =>
                    setQuestionFormData({
                      ...questionFormData,
                      required: Boolean(checked),
                    })
                  }
                />
                <Label htmlFor="question-required" className="font-normal">
                  Pergunta obrigatoria
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="question-active"
                  checked={questionFormData.is_active !== false}
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
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={resetQuestionForm}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700"
                disabled={
                  createQuestion.isPending ||
                  updateQuestion.isPending ||
                  disableQuestionActions
                }
              >
                {editingQuestion ? "Salvar" : "Criar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!questionDeleteConfirm}
        onOpenChange={() => setQuestionDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pergunta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a pergunta "
              {extractQuestionMeta(questionDeleteConfirm || {}).label ||
                questionDeleteConfirm?.question_text}
              "?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteQuestion.mutate(questionDeleteConfirm.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
