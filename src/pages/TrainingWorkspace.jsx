import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { dataClient } from "@/api/dataClient";
import { extractTrainingIdFromEventNotes } from "@/lib/eventMetadata";
import { getEffectiveTrainingStatus } from "@/lib/statusRules";
import { isRepadronizacaoTraining } from "@/lib/trainingType";
import { resolveTrainingParticipantMatch } from "@/lib/trainingParticipantMatch";
import { formatDateSafe } from "@/lib/date";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import TrainingDetails from "@/components/trainings/TrainingDetails";
import EnrollmentManager from "@/components/trainings/EnrollmentManager";
import AttendanceControl from "@/components/trainings/AttendanceControl";
import CertificateManager from "@/components/trainings/CertificateManager";
import MaterialsManager from "@/components/trainings/MaterialsManager";
import TrainingForm from "@/components/trainings/TrainingForm";
import SendLinkButton from "@/components/trainings/SendLinkButton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  Award,
  ArrowLeft,
  ClipboardCheck,
  Copy,
  Eye,
  ExternalLink,
  Loader2,
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

const REPAD_APPROVAL_KAPPA = 0.7;

const toNumeric = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const hasCloseNumeric = (a, b, tolerance = 0.05) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(Number(a) - Number(b)) <= tolerance;

export default function TrainingWorkspace() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const queryString =
    window.location.search || window.location.hash.split("?")[1] || "";
  const urlParams = new URLSearchParams(queryString);
  const trainingId = String(urlParams.get("training") || "").trim();

  const [activeTab, setActiveTab] = useState("overview");
  const [actionStatus, setActionStatus] = useState(null);

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

  const loading = loadingTrainings || loadingParticipants || loadingProfessionals;
  const isRepadTraining = isRepadronizacaoTraining(training);
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

  const goBack = () => navigate("/Trainings");

  const openInternalRoute = (path) => {
    window.open(`${window.location.origin}${path}`, "_blank", "noopener,noreferrer");
  };

  const copyInternalRoute = async (path) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setActionStatus({
        type: "success",
        message: "Link copiado para a área de transferência.",
      });
    } catch {
      setActionStatus({
        type: "error",
        message: "Não foi possível copiar o link.",
      });
    }
  };

  const tracomaPath = trainingId
    ? `/TracomaExaminerEvaluationPage?training=${encodeURIComponent(trainingId)}`
    : "";

  const tracomaResultsQuery = useQuery({
    queryKey: ["trainingWorkspaceTracomaResults", trainingId],
    queryFn: () =>
      dataClient.entities.TracomaExamResult.filter(
        { training_id: trainingId },
        "-created_at"
      ),
    enabled: Boolean(trainingId && isRepadTraining),
  });

  const activeTrainingParticipants = useMemo(
    () =>
      (Array.isArray(trainingParticipants) ? trainingParticipants : []).filter(
        (item) => String(item?.enrollment_status || "").trim().toLowerCase() !== "cancelado"
      ),
    [trainingParticipants]
  );

  const repadLatestByParticipantId = useMemo(() => {
    const map = new Map();
    if (!isRepadTraining) return map;
    const rows = Array.isArray(tracomaResultsQuery.data)
      ? [...tracomaResultsQuery.data]
      : [];
    rows.sort(
      (a, b) =>
        new Date(b?.created_at || 0).getTime() -
        new Date(a?.created_at || 0).getTime()
    );

    rows.forEach((row) => {
      const linkedParticipant = resolveTrainingParticipantMatch(
        activeTrainingParticipants,
        {
          name: row?.participant_name,
          email: row?.participant_email,
          rg: row?.participant_cpf,
        }
      );
      if (!linkedParticipant?.id) return;
      if (map.has(linkedParticipant.id)) return;

      const rawKappa = toNumeric(row?.kappa);
      const kappa = rawKappa === null ? null : clamp(rawKappa, 0, 1);
      const score = kappa === null ? null : kappa * 100;
      const statusText = String(row?.aptitude_status || "").trim().toLowerCase();
      const approved =
        statusText === "apto" ||
        (Number.isFinite(kappa) && kappa >= REPAD_APPROVAL_KAPPA);

      map.set(linkedParticipant.id, {
        participantId: linkedParticipant.id,
        answerKeyCode: row?.answer_key_code || "",
        createdAt: row?.created_at || null,
        totalMatches: Number(row?.total_matches || 0),
        totalQuestions: Number(row?.total_questions || 50),
        kappa,
        score,
        approved,
      });
    });

    return map;
  }, [activeTrainingParticipants, isRepadTraining, tracomaResultsQuery.data]);

  const repadExamRows = useMemo(() => {
    if (!isRepadTraining) return [];
    return activeTrainingParticipants
      .map((participant) => {
        const exam = repadLatestByParticipantId.get(participant.id);
        const participantGrade = toNumeric(participant?.grade);
        const participantApproved = participant?.approved === true;
        const score = exam?.score ?? null;
        const kappa = exam?.kappa ?? null;
        const hasExam = Boolean(exam);
        const examApproved = Boolean(exam?.approved);
        const isApprovedSynced = hasExam ? participantApproved === examApproved : true;
        const isGradeSynced = hasExam
          ? hasCloseNumeric(participantGrade, score)
          : true;
        const needsSync = hasExam ? !isApprovedSynced || !isGradeSynced : false;

        return {
          id: participant.id,
          participant_id: participant.id,
          participant_name: participant.professional_name || "Sem nome",
          participant_email: participant.professional_email || "-",
          participant_rg:
            participant.professional_rg || participant.professional_cpf || "-",
          answer_key_code: exam?.answerKeyCode || "-",
          score,
          kappa,
          total_matches: exam?.totalMatches ?? null,
          total_questions: exam?.totalQuestions ?? null,
          exam_approved: examApproved,
          has_exam: hasExam,
          last_exam_at: exam?.createdAt || null,
          participant_grade: participantGrade,
          participant_approved: participantApproved,
          is_synced: !needsSync,
          needs_sync: needsSync,
        };
      })
      .sort((a, b) =>
        String(a.participant_name || "").localeCompare(
          String(b.participant_name || ""),
          "pt-BR",
          { sensitivity: "base" }
        )
      );
  }, [activeTrainingParticipants, isRepadTraining, repadLatestByParticipantId]);

  const repadStats = useMemo(() => {
    const total = repadExamRows.length;
    const withExam = repadExamRows.filter((row) => row.has_exam).length;
    const approved = repadExamRows.filter(
      (row) => row.has_exam && row.exam_approved
    ).length;
    const pendingExam = total - withExam;
    const pendingSync = repadExamRows.filter((row) => row.needs_sync).length;
    return { total, withExam, approved, pendingExam, pendingSync };
  }, [repadExamRows]);

  const repadExamColumns = [
    {
      header: "Participante",
      accessor: "participant_name",
      cellClassName: "font-medium",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.participant_name}</p>
          <p className="text-xs text-slate-500">
            {row.participant_email} • RG/CPF: {row.participant_rg}
          </p>
        </div>
      ),
    },
    {
      header: "Prova",
      accessor: "answer_key_code",
      render: (row) => row.answer_key_code || "-",
    },
    {
      header: "Nota (Kappa x100)",
      accessor: "score",
      sortType: "number",
      render: (row) =>
        Number.isFinite(row.score) ? `${Number(row.score).toFixed(1)}%` : "-",
    },
    {
      header: "Kappa",
      accessor: "kappa",
      sortType: "number",
      render: (row) =>
        Number.isFinite(row.kappa) ? Number(row.kappa).toFixed(3) : "-",
    },
    {
      header: "Status da prova",
      sortable: false,
      render: (row) => {
        if (!row.has_exam) {
          return <Badge className="bg-slate-100 text-slate-700">Sem prova</Badge>;
        }
        return row.exam_approved ? (
          <Badge className="bg-green-100 text-green-700">Aprovado</Badge>
        ) : (
          <Badge className="bg-amber-100 text-amber-700">
            Necessita retreinamento
          </Badge>
        );
      },
    },
    {
      header: "Vínculo",
      sortable: false,
      render: (row) =>
        !row.has_exam ? (
          <Badge variant="outline">Sem nota</Badge>
        ) : row.is_synced ? (
          <Badge className="bg-emerald-100 text-emerald-700">Sincronizado</Badge>
        ) : (
          <Badge className="bg-amber-100 text-amber-700">Pendente sincronizar</Badge>
        ),
    },
    {
      header: "Data da prova",
      accessor: "last_exam_at",
      sortType: "date",
      render: (row) => formatDateSafe(row.last_exam_at, "dd/MM/yyyy HH:mm") || "-",
    },
  ];

  const syncRepadParticipants = useMutation({
    mutationFn: async () => {
      if (!isRepadTraining) {
        throw new Error("Sincronização disponível apenas para repadronização.");
      }
      const rowsToSync = repadExamRows.filter((row) => row.has_exam);
      if (!rowsToSync.length) {
        throw new Error("Nenhuma prova encontrada para sincronizar.");
      }

      await Promise.all(
        rowsToSync.map((row) =>
          dataClient.entities.TrainingParticipant.update(row.participant_id, {
            approved: row.exam_approved,
            grade: Number.isFinite(row.score) ? Number(row.score).toFixed(1) : null,
          })
        )
      );

      return {
        synced: rowsToSync.length,
        approved: rowsToSync.filter((row) => row.exam_approved).length,
        pendingWithoutExam: activeTrainingParticipants.length - rowsToSync.length,
      };
    },
    onSuccess: async ({ synced, approved, pendingWithoutExam }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["participants"] }),
        queryClient.invalidateQueries({ queryKey: ["trainings"] }),
        queryClient.invalidateQueries({ queryKey: ["enrolled-participants"] }),
      ]);
      setActionStatus({
        type: "success",
        message: `Sincronização concluída: ${synced} participante(s) atualizados, ${approved} aprovado(s), ${pendingWithoutExam} sem prova.`,
      });
    },
    onError: (error) => {
      setActionStatus({
        type: "error",
        message: error?.message || "Não foi possível sincronizar as notas.",
      });
    },
  });

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
          const sameTitle =
            normalizeComparisonText(item.title) === expectedTitle;
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

      if (participantsToCleanup.length === 0 && expectedTitle) {
        const hasAnotherTrainingWithSameTitle = (trainings || []).some((item) => {
          if (String(item?.id || "").trim() === currentTrainingId) return false;
          return normalizeComparisonText(item?.title) === expectedTitle;
        });
        if (!hasAnotherTrainingWithSameTitle) {
          participantsToCleanup.push(
            ...(allParticipants || []).filter((item) => {
              const participantId = String(item?.id || "").trim();
              if (!participantId) return false;
              if (String(item?.training_id || "").trim()) return false;
              return normalizeComparisonText(item?.training_title) === expectedTitle;
            })
          );
        }
      }

      const participantsById = new Map(
        participantsToCleanup.map((item) => [String(item.id), item])
      );
      const participantIdsToDelete = Array.from(participantsById.keys());

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

  if (!trainingId) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={goBack} className="-ml-2">
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
        <Button variant="ghost" size="sm" onClick={goBack} className="-ml-2">
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

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={goBack} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Voltar para Treinamentos
      </Button>

      <PageHeader
        title="Painel do Treinamento"
        subtitle={training.title || "Treinamento sem título"}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge className={statusColors[statusValue] || "bg-slate-100 text-slate-700"}>
          {statusLabels[statusValue] || "Status indefinido"}
        </Badge>
        {training.code && <Badge variant="outline">Código: {training.code}</Badge>}
        <Badge variant="outline">
          {trainingParticipants.filter((item) => item.enrollment_status !== "cancelado").length}{" "}
          inscritos ativos
        </Badge>
      </div>

      {actionStatus && (
        <Alert
          className={
            actionStatus.type === "error"
              ? "border-red-200 bg-red-50"
              : actionStatus.type === "info"
              ? "border-blue-200 bg-blue-50"
              : "border-green-200 bg-green-50"
          }
        >
          <AlertDescription
            className={
              actionStatus.type === "error"
                ? "text-red-800"
                : actionStatus.type === "info"
                ? "text-blue-800"
                : "text-green-800"
            }
          >
            {actionStatus.message}
          </AlertDescription>
        </Alert>
      )}

      <Alert className="border-blue-200 bg-blue-50">
        <AlertDescription className="text-blue-800">
          As ações de importar/exportar ficam dentro de cada aba (Presença, Materiais e Provas).
        </AlertDescription>
      </Alert>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList
          className={
            isRepadTraining
              ? "grid w-full grid-cols-2 md:grid-cols-7"
              : "grid w-full grid-cols-2 md:grid-cols-6"
          }
        >
          <TabsTrigger value="overview" className="gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            Resumo
          </TabsTrigger>
          <TabsTrigger value="enrollments" className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            Inscrições
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1.5">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Presença
          </TabsTrigger>
          {isRepadTraining && (
            <TabsTrigger value="exams" className="gap-1.5">
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

        <TabsContent value="enrollments" className="space-y-4 mt-6">
          {training.online_link && (
            <SendLinkButton training={training} participants={trainingParticipants} />
          )}
          <EnrollmentManager
            training={training}
            professionals={professionals}
            existingParticipants={trainingParticipants}
            onClose={() => setActiveTab("overview")}
          />
        </TabsContent>

        <TabsContent value="attendance" className="mt-6">
          <AttendanceControl
            training={training}
            participants={trainingParticipants}
            onClose={() => setActiveTab("overview")}
          />
        </TabsContent>

        {isRepadTraining && (
          <TabsContent value="exams" className="space-y-4 mt-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Provas de repadronização (Tracoma)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-amber-200 text-amber-700 hover:bg-amber-50"
                    onClick={() => openInternalRoute(tracomaPath)}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Abrir gestão completa das provas
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-amber-200 text-amber-700 hover:bg-amber-50"
                    onClick={() => copyInternalRoute(tracomaPath)}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copiar link da gestão de provas
                  </Button>
                  <Button
                    type="button"
                    className="bg-emerald-700 hover:bg-emerald-800"
                    onClick={() => syncRepadParticipants.mutate()}
                    disabled={
                      syncRepadParticipants.isPending ||
                      tracomaResultsQuery.isLoading ||
                      repadStats.withExam === 0
                    }
                  >
                    {syncRepadParticipants.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ClipboardCheck className="h-4 w-4 mr-2" />
                    )}
                    Vincular aprovados com as notas
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <Card>
                    <CardContent className="pt-5">
                      <p className="text-xs text-slate-500">Inscritos ativos</p>
                      <p className="text-2xl font-semibold">{repadStats.total}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5">
                      <p className="text-xs text-slate-500">Com prova</p>
                      <p className="text-2xl font-semibold text-blue-700">
                        {repadStats.withExam}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5">
                      <p className="text-xs text-slate-500">Aprovados</p>
                      <p className="text-2xl font-semibold text-green-700">
                        {repadStats.approved}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5">
                      <p className="text-xs text-slate-500">Sem prova</p>
                      <p className="text-2xl font-semibold text-amber-700">
                        {repadStats.pendingExam}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5">
                      <p className="text-xs text-slate-500">Pendentes de vínculo</p>
                      <p className="text-2xl font-semibold text-violet-700">
                        {repadStats.pendingSync}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {tracomaResultsQuery.isError && (
                  <Alert className="border-red-200 bg-red-50">
                    <AlertCircle className="h-4 w-4 text-red-700" />
                    <AlertDescription className="text-red-800">
                      Não foi possível carregar os resultados das provas.
                    </AlertDescription>
                  </Alert>
                )}

                <DataTable
                  columns={repadExamColumns}
                  data={repadExamRows}
                  isLoading={tracomaResultsQuery.isLoading}
                  emptyMessage="Nenhuma prova encontrada para os inscritos deste treinamento."
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
              <CardTitle className="text-base text-red-800">
                Zona de risco
              </CardTitle>
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
