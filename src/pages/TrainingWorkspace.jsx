import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { dataClient } from "@/api/dataClient";
import { extractTrainingIdFromEventNotes } from "@/lib/eventMetadata";
import { getEffectiveTrainingStatus } from "@/lib/statusRules";
import { isRepadronizacaoTraining } from "@/lib/trainingType";
import {
  TRACOMA_TOTAL_QUESTIONS,
  buildAnswerKeyCollections,
  computeTracomaKappaMetrics,
  normalizeAnswerKeyCode,
  normalizeBinaryAnswer,
} from "@/lib/tracomaExamKappa";
import { formatDateSafe } from "@/lib/date";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import TrainingDetails from "@/components/trainings/TrainingDetails";
import AttendanceControl from "@/components/trainings/AttendanceControl";
import CertificateManager from "@/components/trainings/CertificateManager";
import MaterialsManager from "@/components/trainings/MaterialsManager";
import TrainingForm from "@/components/trainings/TrainingForm";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  ClipboardCheck,
  Eye,
  FileText,
  Loader2,
  MessageSquare,
  Package,
  Pencil,
  Trash2,
  UserPlus,
} from "lucide-react";

const normalizeComparisonText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeDateKey = (value) => {
  if (!value) return "";
  const text = String(value).trim();
  if (!text) return "";
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getTrainingDateKeys = (training) => {
  const keys = new Set();
  if (Array.isArray(training?.dates)) {
    training.dates.forEach((item) => {
      const dateValue = typeof item === "object" ? item?.date : item;
      const normalized = normalizeDateKey(dateValue);
      if (normalized) keys.add(normalized);
    });
  }
  const baseDate = normalizeDateKey(training?.date);
  if (baseDate) keys.add(baseDate);
  const startDate = normalizeDateKey(training?.start_date);
  if (startDate) keys.add(startDate);
  return Array.from(keys);
};

const toValidRating = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
};

const resolveFeedbackRating = (feedbackItem) => {
  const directRating = toValidRating(feedbackItem?.rating);
  if (directRating) return directRating;

  const answers = Array.isArray(feedbackItem?.answers) ? feedbackItem.answers : [];
  const ratingValues = answers
    .filter((item) => String(item?.type || "").trim().toLowerCase() === "rating")
    .map((item) => toValidRating(item?.value))
    .filter(Boolean);

  if (!ratingValues.length) return null;
  const average =
    ratingValues.reduce((sum, current) => sum + current, 0) / ratingValues.length;
  return toValidRating(average);
};

const parseStoredAnswers = (value, totalQuestions = TRACOMA_TOTAL_QUESTIONS) => {
  if (!Array.isArray(value) || value.length !== totalQuestions) return null;
  const parsed = value.map((item) => normalizeBinaryAnswer(item));
  if (parsed.some((item) => item === null)) return null;
  return parsed;
};

const formatDecimal = (value, digits = 3) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return numeric.toFixed(digits);
};

const normalizeSearchText = (value) => String(value || "").trim().toLowerCase();

const isApprovedExamResult = (resultRow) => {
  const statusText = String(resultRow?.aptitude_status || "")
    .trim()
    .toLowerCase();
  if (statusText === "apto") return true;
  const kappa = Number(resultRow?.kappa);
  return Number.isFinite(kappa) && kappa >= 0.7;
};

export default function TrainingWorkspace() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const queryString =
    window.location.search || window.location.hash.split("?")[1] || "";
  const urlParams = new URLSearchParams(queryString);
  const trainingId = String(urlParams.get("training") || "").trim();

  const [activeTab, setActiveTab] = useState("overview");
  const [actionStatus, setActionStatus] = useState(null);
  const [enrollmentSearch, setEnrollmentSearch] = useState("");
  const [feedbackSearch, setFeedbackSearch] = useState("");
  const [examSearch, setExamSearch] = useState("");

  const { data: trainings = [], isLoading: loadingTrainings } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => dataClient.entities.Training.list("-date"),
  });

  const { data: participants = [], isLoading: loadingParticipants } = useQuery({
    queryKey: ["participants"],
    queryFn: () => dataClient.entities.TrainingParticipant.list(),
  });

  const { data: professionals = [], isLoading: loadingProfessionals } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => dataClient.entities.Professional.list(),
  });

  const training = useMemo(
    () =>
      (trainings || []).find(
        (item) => String(item?.id || "").trim() === String(trainingId || "").trim()
      ) || null,
    [trainings, trainingId]
  );

  const participantsByTrainingMap = useMemo(() => {
    const map = new Map();
    const trainingsById = new Map();
    const trainingsByTitle = new Map();

    (trainings || []).forEach((item) => {
      const id = String(item?.id || "").trim();
      if (id) {
        trainingsById.set(id, item);
        map.set(id, []);
      }
      const titleKey = normalizeComparisonText(item?.title);
      if (!titleKey) return;
      if (!trainingsByTitle.has(titleKey)) {
        trainingsByTitle.set(titleKey, []);
      }
      trainingsByTitle.get(titleKey).push(item);
    });

    const resolveParticipantTraining = (participant) => {
      const participantTrainingId = String(participant?.training_id || "").trim();
      if (participantTrainingId && trainingsById.has(participantTrainingId)) {
        return trainingsById.get(participantTrainingId);
      }

      const titleKey = normalizeComparisonText(participant?.training_title);
      if (!titleKey) return null;
      const candidates = trainingsByTitle.get(titleKey) || [];
      if (!candidates.length) return null;
      if (candidates.length === 1) return candidates[0];

      const participantDate = normalizeDateKey(participant?.training_date);
      if (!participantDate) return candidates[0];
      return (
        candidates.find((item) =>
          getTrainingDateKeys(item).includes(participantDate)
        ) || candidates[0]
      );
    };

    (participants || []).forEach((participant) => {
      const matchedTraining = resolveParticipantTraining(participant);
      const id = String(matchedTraining?.id || "").trim();
      if (!id) return;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(participant);
    });

    return map;
  }, [participants, trainings]);

  const trainingParticipants = useMemo(() => {
    const id = String(training?.id || "").trim();
    if (!id) return [];
    return participantsByTrainingMap.get(id) || [];
  }, [participantsByTrainingMap, training]);

  const activeParticipants = useMemo(
    () =>
      trainingParticipants.filter(
        (item) =>
          String(item?.enrollment_status || "").trim().toLowerCase() !== "cancelado"
      ),
    [trainingParticipants]
  );

  const loading = loadingTrainings || loadingParticipants || loadingProfessionals;
  const isRepadTraining = isRepadronizacaoTraining(training);

  const feedbackResponsesQuery = useQuery({
    queryKey: ["training-workspace-feedback-results", training?.id],
    queryFn: () =>
      dataClient.entities.TrainingFeedback.filter(
        { training_id: training?.id },
        "-created_at"
      ),
    enabled: Boolean(training?.id),
  });

  const tracomaResultsQuery = useQuery({
    queryKey: ["training-workspace-tracoma-results", training?.id],
    queryFn: () =>
      dataClient.entities.TracomaExamResult.filter(
        { training_id: training?.id },
        "-created_at"
      ),
    enabled: Boolean(training?.id) && isRepadTraining,
  });

  const tracomaAnswerKeysQuery = useQuery({
    queryKey: ["training-workspace-tracoma-answer-keys"],
    queryFn: () => dataClient.entities.TracomaExamAnswerKey.list("question_number"),
    enabled: Boolean(training?.id) && isRepadTraining,
  });

  const answerKeyByCode = useMemo(() => {
    const map = new Map();
    const collections = buildAnswerKeyCollections(
      Array.isArray(tracomaAnswerKeysQuery.data) ? tracomaAnswerKeysQuery.data : [],
      TRACOMA_TOTAL_QUESTIONS
    );
    collections.forEach((item) => {
      if (item?.answers && !item?.error) {
        map.set(item.code, item.answers);
      }
    });
    return map;
  }, [tracomaAnswerKeysQuery.data]);

  const examResults = useMemo(() => {
    const rows = Array.isArray(tracomaResultsQuery.data) ? tracomaResultsQuery.data : [];
    return rows.map((row) => {
      const keyCode = normalizeAnswerKeyCode(row?.answer_key_code || "E2");
      const answerKey = answerKeyByCode.get(keyCode);
      const traineeAnswers = parseStoredAnswers(row?.answers);
      if (!answerKey || !traineeAnswers) return row;
      try {
        const computed = computeTracomaKappaMetrics({
          answerKey,
          traineeAnswers,
        });
        return {
          ...row,
          answer_key_code: keyCode,
          total_questions: computed.totalQuestions,
          total_matches: computed.totalMatches,
          matrix_a: computed.matrix.a,
          matrix_b: computed.matrix.b,
          matrix_c: computed.matrix.c,
          matrix_d: computed.matrix.d,
          observed_agreement: computed.po,
          expected_agreement: computed.pe,
          kappa: computed.kappa,
          interpretation: computed.interpretation,
          aptitude_status: computed.aptitudeStatus,
        };
      } catch {
        return {
          ...row,
          answer_key_code: keyCode,
        };
      }
    });
  }, [answerKeyByCode, tracomaResultsQuery.data]);

  const filteredEnrolledParticipants = useMemo(() => {
    const searchTerm = normalizeSearchText(enrollmentSearch);
    if (!searchTerm) return activeParticipants;
    return activeParticipants.filter((participant) => {
      const haystack = [
        participant?.professional_name,
        participant?.professional_cpf,
        participant?.professional_email,
        participant?.municipality,
      ]
        .map((item) => String(item || "").toLowerCase())
        .join(" ");
      return haystack.includes(searchTerm);
    });
  }, [activeParticipants, enrollmentSearch]);

  const feedbackRows = useMemo(() => {
    const rows = Array.isArray(feedbackResponsesQuery.data)
      ? feedbackResponsesQuery.data
      : [];
    const searchTerm = normalizeSearchText(feedbackSearch);
    if (!searchTerm) return rows;
    return rows.filter((row) => {
      const haystack = [
        row?.participant_name,
        row?.comments,
        JSON.stringify(row?.answers || []),
      ]
        .map((item) => String(item || "").toLowerCase())
        .join(" ");
      return haystack.includes(searchTerm);
    });
  }, [feedbackResponsesQuery.data, feedbackSearch]);

  const feedbackSummary = useMemo(() => {
    const total = feedbackRows.length;
    const ratingValues = feedbackRows
      .map((row) => resolveFeedbackRating(row))
      .filter((value) => Number.isFinite(value));
    const averageRating =
      ratingValues.length > 0
        ? (
            ratingValues.reduce((sum, current) => sum + current, 0) /
            ratingValues.length
          ).toFixed(1)
        : "-";

    const recommendationResponses = feedbackRows.filter(
      (row) => row?.would_recommend === true || row?.would_recommend === false
    );
    const recommendationYes = recommendationResponses.filter(
      (row) => row?.would_recommend === true
    ).length;
    const recommendationRate =
      recommendationResponses.length > 0
        ? `${Math.round((recommendationYes / recommendationResponses.length) * 100)}%`
        : "-";

    return {
      total,
      averageRating,
      recommendationRate,
    };
  }, [feedbackRows]);

  const filteredExamRows = useMemo(() => {
    const searchTerm = normalizeSearchText(examSearch);
    if (!searchTerm) return examResults;
    return examResults.filter((row) => {
      const haystack = [
        row?.participant_name,
        row?.answer_key_code,
        row?.aptitude_status,
      ]
        .map((item) => String(item || "").toLowerCase())
        .join(" ");
      return haystack.includes(searchTerm);
    });
  }, [examResults, examSearch]);

  const examSummary = useMemo(() => {
    const total = filteredExamRows.length;
    const aptCount = filteredExamRows.filter((row) => isApprovedExamResult(row)).length;
    const kappaValues = filteredExamRows
      .map((row) => Number(row?.kappa))
      .filter((value) => Number.isFinite(value));
    const avgKappa =
      kappaValues.length > 0
        ? (
            kappaValues.reduce((sum, current) => sum + current, 0) /
            kappaValues.length
          ).toFixed(3)
        : "-";
    return { total, aptCount, avgKappa };
  }, [filteredExamRows]);

  const statusValue = training ? getEffectiveTrainingStatus(training) : "";
  const statusLabels = {
    agendado: "Agendado",
    em_andamento: "Em andamento",
    concluido: "Concluído",
    cancelado: "Cancelado",
  };
  const statusColors = {
    agendado: "bg-blue-100 text-blue-700",
    em_andamento: "bg-amber-100 text-amber-700",
    concluido: "bg-green-100 text-green-700",
    cancelado: "bg-red-100 text-red-700",
  };

  const deleteTraining = useMutation({
    mutationFn: async (trainingToDelete) => {
      const currentTrainingId = String(trainingToDelete?.id || "").trim();
      if (!currentTrainingId) {
        throw new Error("Treinamento inválido para exclusão.");
      }

      const expectedDateKeys = new Set();
      if (Array.isArray(trainingToDelete?.dates)) {
        trainingToDelete.dates.forEach((item) => {
          const dateKey = normalizeDateKey(item?.date || item);
          if (dateKey) expectedDateKeys.add(dateKey);
        });
      }
      const fallbackDateKey = normalizeDateKey(trainingToDelete?.date);
      if (fallbackDateKey) expectedDateKeys.add(fallbackDateKey);

      const trainingEvents = await dataClient.entities.Event.filter(
        { type: "treinamento" },
        "-start_date"
      );

      let relatedEvents = trainingEvents.filter(
        (item) => extractTrainingIdFromEventNotes(item.notes) === currentTrainingId
      );

      if (relatedEvents.length === 0) {
        const expectedTitle = normalizeComparisonText(trainingToDelete?.title);
        relatedEvents = trainingEvents.filter((item) => {
          if (extractTrainingIdFromEventNotes(item.notes)) return false;
          const sameTitle = normalizeComparisonText(item.title) === expectedTitle;
          if (!sameTitle) return false;
          if (expectedDateKeys.size === 0) return true;
          const eventDateKey = normalizeDateKey(item.start_date);
          return !eventDateKey || expectedDateKeys.has(eventDateKey);
        });
      }

      if (relatedEvents.length > 0) {
        await Promise.all(
          relatedEvents.map((item) => dataClient.entities.Event.delete(item.id))
        );
      }

      const allParticipants = await dataClient.entities.TrainingParticipant.list(
        "-enrollment_date"
      );
      const expectedTitle = normalizeComparisonText(trainingToDelete?.title);
      const participantsToCleanup = allParticipants.filter((item) => {
        const participantId = String(item?.id || "").trim();
        if (!participantId) return false;

        const participantTrainingId = String(item?.training_id || "").trim();
        if (participantTrainingId && participantTrainingId === currentTrainingId) {
          return true;
        }
        if (participantTrainingId) return false;

        if (!expectedTitle) return false;
        if (normalizeComparisonText(item?.training_title) !== expectedTitle) {
          return false;
        }

        if (expectedDateKeys.size === 0) return true;
        const participantDateKey = normalizeDateKey(item?.training_date);
        if (!participantDateKey) return true;
        return expectedDateKeys.has(participantDateKey);
      });

      const participantIdsToDelete = participantsToCleanup
        .map((item) => String(item.id || "").trim())
        .filter(Boolean);

      if (participantIdsToDelete.length > 0) {
        const deleteResults = await Promise.allSettled(
          participantIdsToDelete.map((participantId) =>
            dataClient.entities.TrainingParticipant.delete(participantId)
          )
        );
        const failedDeleteCount = deleteResults.filter(
          (result) => result.status === "rejected"
        ).length;
        if (failedDeleteCount > 0) {
          throw new Error(
            `Não foi possível remover ${failedDeleteCount} registro(s) de participante vinculados ao treinamento.`
          );
        }
      }

      await dataClient.entities.Training.delete(currentTrainingId);
      return {
        deletedEvents: relatedEvents.length,
        deletedParticipants: participantIdsToDelete.length,
      };
    },
    onSuccess: async ({ deletedEvents, deletedParticipants }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trainings"] }),
        queryClient.invalidateQueries({ queryKey: ["events"] }),
        queryClient.invalidateQueries({ queryKey: ["participants"] }),
        queryClient.invalidateQueries({ queryKey: ["enrolled-participants"] }),
      ]);
      window.alert(
        `Treinamento excluído com ${deletedEvents} evento(s) e ${deletedParticipants} inscrito(s) removido(s).`
      );
      navigate("/Trainings");
    },
    onError: (error) => {
      setActionStatus({
        type: "error",
        message: error?.message || "Não foi possível excluir o treinamento.",
      });
    },
  });

  const handleDeleteTraining = () => {
    if (!training) return;
    const confirmed = window.confirm(
      `Tem certeza que deseja excluir o treinamento "${training.title}"? Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;
    setActionStatus(null);
    deleteTraining.mutate(training);
  };

  const handleGoBack = () => navigate("/Trainings");

  const handleOpenMaskPage = () => {
    if (!trainingId) return;
    navigate(`/TrainingWorkspaceMasks?training=${encodeURIComponent(trainingId)}`);
  };

  if (!trainingId) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={handleGoBack} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar para Treinamentos
        </Button>
        <PageHeader
          title="Painel do Treinamento"
          subtitle="Abra esta página a partir de um treinamento específico."
        />
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-700" />
          <AlertDescription className="text-red-800">
            Link inválido. O ID do treinamento não foi informado.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!training) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={handleGoBack} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar para Treinamentos
        </Button>
        <PageHeader title="Painel do Treinamento" subtitle="Treinamento não encontrado" />
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-700" />
          <AlertDescription className="text-red-800">
            Não foi possível localizar esse treinamento.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const enrollmentColumns = [
    {
      header: "Nome",
      accessor: "professional_name",
      cellClassName: "font-medium",
    },
    {
      header: "Documento",
      render: (row) => row.professional_rg || row.professional_cpf || "-",
    },
    {
      header: "Contato",
      render: (row) => row.professional_email || "-",
    },
    {
      header: "Município",
      accessor: "municipality",
    },
    {
      header: "Data da inscrição",
      accessor: "enrollment_date",
      sortType: "date",
      render: (row) => formatDateSafe(row?.enrollment_date, "dd/MM/yyyy HH:mm") || "-",
    },
  ];

  const feedbackColumns = [
    {
      header: "Participante",
      accessor: "participant_name",
      cellClassName: "font-medium",
      render: (row) => row?.participant_name || "Participante",
    },
    {
      header: "Nota",
      render: (row) => {
        const rating = resolveFeedbackRating(row);
        return rating ? `${rating}/5` : "-";
      },
      sortType: "number",
    },
    {
      header: "Recomendaria",
      render: (row) => {
        if (row?.would_recommend === true) return "Sim";
        if (row?.would_recommend === false) return "Não";
        return "-";
      },
    },
    {
      header: "Comentário",
      render: (row) => {
        const text = String(row?.comments || "").trim();
        if (!text) return "-";
        return text.length > 140 ? `${text.slice(0, 140)}...` : text;
      },
    },
    {
      header: "Data",
      accessor: "created_at",
      sortType: "date",
      render: (row) => formatDateSafe(row?.created_at, "dd/MM/yyyy HH:mm") || "-",
    },
  ];

  const examColumns = [
    {
      header: "Formando",
      accessor: "participant_name",
      cellClassName: "font-medium",
      render: (row) => row?.participant_name || "-",
    },
    {
      header: "Teste",
      accessor: "answer_key_code",
      render: (row) => row?.answer_key_code || "-",
    },
    {
      header: "Acertos",
      render: (row) =>
        `${Number(row?.total_matches || 0)}/${Number(
          row?.total_questions || TRACOMA_TOTAL_QUESTIONS
        )}`,
      sortType: "number",
    },
    {
      header: "Kappa",
      accessor: "kappa",
      sortType: "number",
      render: (row) => formatDecimal(row?.kappa, 3),
    },
    {
      header: "Status",
      render: (row) => {
        const isApproved = isApprovedExamResult(row);
        return (
          <Badge
            className={
              isApproved ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
            }
          >
            {isApproved ? "Apto" : "Necessita retreinamento"}
          </Badge>
        );
      },
    },
    {
      header: "Data",
      accessor: "created_at",
      sortType: "date",
      render: (row) => formatDateSafe(row?.created_at, "dd/MM/yyyy HH:mm") || "-",
    },
  ];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={handleGoBack} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Voltar para Treinamentos
      </Button>

      <PageHeader
        title="Painel do Treinamento"
        subtitle={training.title || "Treinamento sem título"}
      />

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={statusColors[statusValue] || "bg-slate-100 text-slate-700"}>
            {statusLabels[statusValue] || "Status indefinido"}
          </Badge>
          <Badge variant="outline">{activeParticipants.length} inscritos ativos</Badge>
        </div>
        <Button type="button" variant="outline" onClick={handleOpenMaskPage}>
          <FileText className="h-4 w-4 mr-2" />
          Página de máscaras de criação
        </Button>
      </div>

      <Alert className="border-blue-200 bg-blue-50">
        <AlertDescription className="text-blue-800">
          As abas de Inscrições, Avaliação e Provas exibem somente listas/resultados.
          Para configurar máscaras de criação, use a página separada.
        </AlertDescription>
      </Alert>

      {actionStatus && (
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-800">
            {actionStatus.message}
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-lg bg-muted p-1">
          <TabsTrigger value="overview" className="gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            Resumo
          </TabsTrigger>
          <TabsTrigger value="enrollment_results" className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            Inscrições
          </TabsTrigger>
          <TabsTrigger value="feedback_results" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Avaliação
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1.5">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Presença
          </TabsTrigger>
          {isRepadTraining && (
            <TabsTrigger value="exam_results" className="gap-1.5">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Provas
            </TabsTrigger>
          )}
          <TabsTrigger value="certificates" className="gap-1.5">
            <Award className="h-3.5 w-3.5" />
            Certificados
          </TabsTrigger>
          <TabsTrigger value="materials" className="gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Materiais
          </TabsTrigger>
          <TabsTrigger value="edit" className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <TrainingDetails training={training} participants={trainingParticipants} />
        </TabsContent>

        <TabsContent value="enrollment_results" className="mt-6 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Inscritos do treinamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Buscar inscrito por nome, documento, e-mail ou município..."
                value={enrollmentSearch}
                onChange={(event) => setEnrollmentSearch(event.target.value)}
              />
              <DataTable
                columns={enrollmentColumns}
                data={filteredEnrolledParticipants}
                isLoading={loadingParticipants}
                emptyMessage="Nenhum inscrito encontrado para este treinamento."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feedback_results" className="mt-6 space-y-4">
          {feedbackResponsesQuery.isError && (
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">
                {feedbackResponsesQuery.error?.message ||
                  "Não foi possível carregar os resultados de avaliação."}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-500">Total de respostas</p>
                <p className="text-3xl font-semibold">{feedbackSummary.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-500">Nota média</p>
                <p className="text-3xl font-semibold">{feedbackSummary.averageRating}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-500">Recomendação</p>
                <p className="text-3xl font-semibold">
                  {feedbackSummary.recommendationRate}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resultados das avaliações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Buscar por participante, comentário ou respostas..."
                value={feedbackSearch}
                onChange={(event) => setFeedbackSearch(event.target.value)}
              />
              <DataTable
                columns={feedbackColumns}
                data={feedbackRows}
                isLoading={feedbackResponsesQuery.isLoading}
                emptyMessage="Nenhum resultado de avaliação encontrado."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="mt-6">
          <AttendanceControl
            training={training}
            participants={trainingParticipants}
            onClose={() => setActiveTab("overview")}
          />
        </TabsContent>

        {isRepadTraining && (
          <TabsContent value="exam_results" className="mt-6 space-y-4">
            {tracomaResultsQuery.isError && (
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription className="text-red-800">
                  {tracomaResultsQuery.error?.message ||
                    "Não foi possível carregar os resultados da prova."}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-slate-500">Total de provas</p>
                  <p className="text-3xl font-semibold">{examSummary.total}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-slate-500">Aptos</p>
                  <p className="text-3xl font-semibold text-green-700">
                    {examSummary.aptCount}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-slate-500">Kappa médio</p>
                  <p className="text-3xl font-semibold">{examSummary.avgKappa}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Resultados das provas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  placeholder="Buscar por formando, teste ou status..."
                  value={examSearch}
                  onChange={(event) => setExamSearch(event.target.value)}
                />
                <DataTable
                  columns={examColumns}
                  data={filteredExamRows}
                  isLoading={tracomaResultsQuery.isLoading}
                  emptyMessage="Nenhum resultado de prova encontrado."
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="certificates" className="mt-6">
          <CertificateManager
            training={training}
            participants={trainingParticipants}
            onClose={() => setActiveTab("overview")}
          />
        </TabsContent>

        <TabsContent value="materials" className="mt-6">
          <MaterialsManager training={training} />
        </TabsContent>

        <TabsContent value="edit" className="space-y-4 mt-6">
          <TrainingForm
            training={training}
            professionals={professionals}
            onClose={() => {
              setActiveTab("overview");
              queryClient.invalidateQueries({ queryKey: ["trainings"] });
              queryClient.invalidateQueries({ queryKey: ["events"] });
            }}
          />
          <Card className="border-red-200 bg-red-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-red-800">Zona de risco</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-red-700">
                Excluir este treinamento removerá também eventos e inscritos vinculados.
              </p>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteTraining}
                disabled={deleteTraining.isPending}
              >
                {deleteTraining.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Excluir treinamento
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
