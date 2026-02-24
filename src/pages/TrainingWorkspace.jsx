import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { dataClient } from "@/api/dataClient";
import { extractTrainingIdFromEventNotes } from "@/lib/eventMetadata";
import { getEffectiveTrainingStatus } from "@/lib/statusRules";
import { isRepadronizacaoTraining } from "@/lib/trainingType";
import PageHeader from "@/components/common/PageHeader";
import TrainingDetails from "@/components/trainings/TrainingDetails";
import AttendanceControl from "@/components/trainings/AttendanceControl";
import CertificateManager from "@/components/trainings/CertificateManager";
import MaterialsManager from "@/components/trainings/MaterialsManager";
import TrainingForm from "@/components/trainings/TrainingForm";
import EnrollmentPage from "./EnrollmentPage";
import TrainingFeedbackPage from "./TrainingFeedbackPage";
import TracomaExaminerEvaluationPage from "./TracomaExaminerEvaluationPage";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const activeParticipantsCount = trainingParticipants.filter(
    (item) => String(item?.enrollment_status || "").trim().toLowerCase() !== "cancelado"
  ).length;

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
          <Badge variant="outline">{activeParticipantsCount} inscritos ativos</Badge>
        </div>
        <Button type="button" variant="outline" onClick={handleOpenMaskPage}>
          <FileText className="h-4 w-4 mr-2" />
          Abrir página de máscaras
        </Button>
      </div>

      <Alert className="border-blue-200 bg-blue-50">
        <AlertDescription className="text-blue-800">
          Máscaras de criação ficam separadas em uma página dedicada. Aqui no painel
          ficam os resultados e operações do treinamento.
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
          <TabsTrigger value="enrollment_page" className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            Inscrições
          </TabsTrigger>
          <TabsTrigger value="feedback_page" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Avaliação
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1.5">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Presença
          </TabsTrigger>
          {isRepadTraining && (
            <TabsTrigger value="exams_page" className="gap-1.5">
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

        <TabsContent value="enrollment_page" className="mt-6">
          <EnrollmentPage
            showBackButton={false}
            allowedTabs={["list"]}
            initialTab="list"
          />
        </TabsContent>

        <TabsContent value="feedback_page" className="mt-6">
          <TrainingFeedbackPage
            showBackButton={false}
            allowedTabs={["analytics", "preview"]}
            initialTab="analytics"
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
          <TabsContent value="exams_page" className="mt-6">
            <TracomaExaminerEvaluationPage
              showBackButton={false}
              allowedTabs={["history", "monitor"]}
              initialTab="history"
            />
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
