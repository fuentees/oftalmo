import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { extractTrainingIdFromEventNotes } from "@/lib/eventMetadata";
import { isRepadronizacaoTraining, isRepadronizacaoType } from "@/lib/trainingType";
import {
  getEffectiveTrainingStatus,
  getTrainingDateItems,
} from "@/lib/statusRules";
import { resolveTrainingParticipantMatch } from "@/lib/trainingParticipantMatch";
import {
  TRACOMA_TOTAL_QUESTIONS,
  buildAnswerKeyCollections,
  computeTracomaKappaMetrics,
  normalizeAnswerKeyCode,
  normalizeBinaryAnswer,
} from "@/lib/tracomaExamKappa";
import { format } from "date-fns";
import {
  Edit,
  Trash2,
  Eye,
  ExternalLink,
  Users,
  Calendar,
  MapPin,
  Video,
  UserPlus,
  ClipboardCheck,
  Award,
  MessageSquare,
  MoreVertical,
  FileText,
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PageHeader from "@/components/common/PageHeader";
import SearchFilter from "@/components/common/SearchFilter";
import DataTable from "@/components/common/DataTable";
import TrainingForm from "@/components/trainings/TrainingForm";
import TrainingDetails from "@/components/trainings/TrainingDetails";
import EnrollmentManager from "@/components/trainings/EnrollmentManager";
import AttendanceControl from "@/components/trainings/AttendanceControl";
import CertificateManager from "@/components/trainings/CertificateManager";
import SendLinkButton from "@/components/trainings/SendLinkButton";
import MaterialsManager from "@/components/trainings/MaterialsManager";

const KNOWN_TRAINING_TYPE_LABELS = {
  teorico: "Teórico",
  pratico: "Prático",
  teorico_pratico: "Teórico/Prático",
  repadronizacao: "Repadronização",
};

const KNOWN_TRAINING_TYPE_ORDER = [
  "teorico",
  "pratico",
  "teorico_pratico",
  "repadronizacao",
];

const parseStoredAnswers = (
  value,
  totalQuestions = TRACOMA_TOTAL_QUESTIONS
) => {
  if (!Array.isArray(value) || value.length !== totalQuestions) return null;
  const parsed = value.map((item) => normalizeBinaryAnswer(item));
  if (parsed.some((item) => item === null)) return null;
  return parsed;
};

export default function Trainings() {
  const currentYearValue = String(new Date().getFullYear());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState(currentYearValue);
  
  const [showForm, setShowForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [showCertificates, setShowCertificates] = useState(false);
  const [showMaterials, setShowMaterials] = useState(false);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [deleteStatus, setDeleteStatus] = useState(null);
  const [, forceStatusClockTick] = useState(0);

  const navigate = useNavigate();
  const autoUpdatedRef = React.useRef(new Map());
  const orphanCleanupDoneRef = React.useRef(false);

  const queryClient = useQueryClient();

  // Check URL params to auto-open form
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'create') {
      setShowForm(true);
    }
  }, []);

  const { data: trainings = [], isLoading } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => dataClient.entities.Training.list("-date"),
  });

  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => dataClient.entities.Professional.list(),
  });

  const { data: participants = [] } = useQuery({
    queryKey: ["participants"],
    queryFn: () => dataClient.entities.TrainingParticipant.list(),
  });

  const { data: tracomaResults = [] } = useQuery({
    queryKey: ["trainings-tracoma-results"],
    queryFn: () => dataClient.entities.TracomaExamResult.list("-created_at"),
  });

  const { data: tracomaAnswerKeys = [] } = useQuery({
    queryKey: ["trainings-tracoma-answer-keys"],
    queryFn: () => dataClient.entities.TracomaExamAnswerKey.list("question_number"),
  });

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

  const participantsByTrainingMap = React.useMemo(() => {
    const map = new Map();
    const trainingsById = new Map();
    const trainingsByTitle = new Map();

    (trainings || []).forEach((training) => {
      const trainingId = String(training?.id || "").trim();
      if (trainingId) {
        trainingsById.set(trainingId, training);
        map.set(trainingId, []);
      }
      const titleKey = normalizeComparisonText(training?.title);
      if (!titleKey) return;
      if (!trainingsByTitle.has(titleKey)) {
        trainingsByTitle.set(titleKey, []);
      }
      trainingsByTitle.get(titleKey).push(training);
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
        candidates.find((training) =>
          getTrainingDateKeys(training).includes(participantDate)
        ) || candidates[0]
      );
    };

    (participants || []).forEach((participant) => {
      const matchedTraining = resolveParticipantTraining(participant);
      const trainingId = String(matchedTraining?.id || "").trim();
      if (!trainingId) return;
      if (!map.has(trainingId)) map.set(trainingId, []);
      map.get(trainingId).push(participant);
    });

    return map;
  }, [participants, trainings]);

  const getTrainingParticipants = (training) => {
    const trainingId = String(training?.id || "").trim();
    if (!trainingId) return [];
    return participantsByTrainingMap.get(trainingId) || [];
  };

  const answerKeyByCode = React.useMemo(() => {
    const map = new Map();
    const collections = buildAnswerKeyCollections(
      Array.isArray(tracomaAnswerKeys) ? tracomaAnswerKeys : [],
      TRACOMA_TOTAL_QUESTIONS
    );
    collections.forEach((item) => {
      if (item?.answers && !item?.error) {
        map.set(item.code, item.answers);
      }
    });
    return map;
  }, [tracomaAnswerKeys]);

  const repadApprovalByTrainingId = React.useMemo(() => {
    const map = new Map();
    const rows = Array.isArray(tracomaResults) ? [...tracomaResults] : [];
    rows.sort(
      (a, b) =>
        new Date(b?.created_at || 0).getTime() -
        new Date(a?.created_at || 0).getTime()
    );

    rows.forEach((row) => {
      const trainingId = String(row?.training_id || "").trim();
      if (!trainingId) return;

      const trainingParticipants = participantsByTrainingMap.get(trainingId) || [];
      if (!trainingParticipants.length) return;

      const participant = resolveTrainingParticipantMatch(trainingParticipants, {
        name: row?.participant_name,
        email: row?.participant_email,
        rg: row?.participant_cpf,
      });
      if (!participant?.id) return;

      const participantId = String(participant.id).trim();
      if (!participantId) return;
      if (!map.has(trainingId)) map.set(trainingId, new Map());
      const trainingMap = map.get(trainingId);
      if (trainingMap.has(participantId)) return;

      const keyCode = normalizeAnswerKeyCode(row?.answer_key_code || "E2");
      const answerKey = answerKeyByCode.get(keyCode);
      const traineeAnswers = parseStoredAnswers(row?.answers);
      let latestKappa = Number(row?.kappa);
      if (!Number.isFinite(latestKappa)) latestKappa = null;

      if (answerKey && traineeAnswers) {
        try {
          const computed = computeTracomaKappaMetrics({
            answerKey,
            traineeAnswers,
          });
          latestKappa = Number(computed?.kappa);
        } catch {
          // Mantém o valor persistido quando não for possível recomputar.
        }
      }

      const statusText = String(row?.aptitude_status || "")
        .trim()
        .toLowerCase();
      const approved =
        statusText === "apto" ||
        (Number.isFinite(latestKappa) && latestKappa >= 0.7);

      trainingMap.set(participantId, { approved, latestKappa });
    });

    return map;
  }, [answerKeyByCode, participantsByTrainingMap, tracomaResults]);

  React.useEffect(() => {
    if (orphanCleanupDoneRef.current) return;
    if (isLoading) return;
    orphanCleanupDoneRef.current = true;

    const validTrainingIds = new Set(
      (trainings || [])
        .map((training) => String(training?.id || "").trim())
        .filter(Boolean)
    );
    if (!validTrainingIds.size) return;

    const orphanParticipantIds = (participants || [])
      .filter((participant) => {
        const trainingId = String(participant?.training_id || "").trim();
        if (!trainingId) return false;
        return !validTrainingIds.has(trainingId);
      })
      .map((participant) => String(participant?.id || "").trim())
      .filter(Boolean);

    if (orphanParticipantIds.length === 0) return;

    (async () => {
      const results = await Promise.allSettled(
        orphanParticipantIds.map((participantId) =>
          dataClient.entities.TrainingParticipant.delete(participantId)
        )
      );
      const deletedCount = results.filter(
        (result) => result.status === "fulfilled"
      ).length;
      const failedCount = results.length - deletedCount;

      if (deletedCount > 0) {
        queryClient.invalidateQueries({ queryKey: ["participants"] });
        queryClient.invalidateQueries({ queryKey: ["enrolled-participants"] });
        setDeleteStatus({
          type: failedCount > 0 ? "error" : "success",
          message:
            failedCount > 0
              ? `Limpeza automática removeu ${deletedCount} registro(s) órfão(s), mas ${failedCount} não puderam ser removidos.`
              : `Limpeza automática removeu ${deletedCount} registro(s) órfão(s) de treinamentos antigos.`,
        });
      }
    })();
  }, [isLoading, participants, trainings, queryClient]);

  const deleteTraining = useMutation({
    mutationFn: async (trainingToDelete) => {
      const trainingId = String(trainingToDelete?.id || "").trim();
      if (!trainingId) {
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
        (item) => extractTrainingIdFromEventNotes(item.notes) === trainingId
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
        if (participantTrainingId && participantTrainingId === trainingId) {
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
          if (String(item?.id || "").trim() === trainingId) return false;
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

      let deletedParticipantsCount = 0;
      if (participantIdsToDelete.length > 0) {
        const deleteParticipantRecord = async (participantId) => {
          const deleteResult = await dataClient.entities.TrainingParticipant.delete(
            participantId
          );
          if (deleteResult?.deleted === false) {
            throw new Error(
              "Registro de participante não foi removido do banco de dados."
            );
          }
          deletedParticipantsCount += 1;
        };

        const deleteResults = await Promise.allSettled(
          participantIdsToDelete.map((participantId) =>
            deleteParticipantRecord(participantId)
          )
        );
        const failedDeleteCount = deleteResults.filter(
          (result) => result.status === "rejected"
        ).length;
        if (failedDeleteCount > 0) {
          throw new Error(
            `Não foi possível remover ${failedDeleteCount} registro(s) de participante vinculados ao treinamento. Verifique as permissões do usuário.`
          );
        }
      }

      await dataClient.entities.Training.delete(trainingId);
      return {
        deletedEvents: relatedEvents.length,
        deletedParticipants: deletedParticipantsCount,
      };
    },
    onSuccess: ({ deletedEvents, deletedParticipants }) => {
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["participants"] });
      queryClient.invalidateQueries({ queryKey: ["enrolled-participants"] });
      setDeleteConfirm(null);
      setDeleteStatus({
        type: "success",
        message:
          deletedEvents > 0 || deletedParticipants > 0
            ? `Treinamento excluído com ${deletedEvents} evento(s) da agenda e ${deletedParticipants} inscrito(s) removido(s).`
            : "Treinamento excluído com sucesso.",
      });
    },
    onError: (error) => {
      setDeleteStatus({
        type: "error",
        message: error?.message || "Não foi possível excluir o treinamento.",
      });
    },
  });

  const statusOptions = [
    { value: "agendado", label: "Agendado" },
    { value: "confirmado", label: "Confirmado" },
    { value: "em_andamento", label: "Em andamento" },
    { value: "concluido", label: "Concluído" },
    { value: "cancelado", label: "Cancelado" },
  ];

  const normalizeHeader = (value) => {
    if (value === null || value === undefined) return "";
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  };

  const normalizeTrainingTypeValue = (value) => {
    const normalized = normalizeHeader(value);
    if (!normalized) return "";
    if (isRepadronizacaoType(value) || normalized.includes("repadronizacao")) {
      return "repadronizacao";
    }
    if (normalized.includes("teorico") && normalized.includes("pratico")) {
      return "teorico_pratico";
    }
    if (normalized.includes("teorico")) return "teorico";
    if (normalized.includes("pratico")) return "pratico";
    return normalized;
  };

  const formatTrainingTypeLabel = (value) => {
    const normalized = normalizeTrainingTypeValue(value);
    if (!normalized) return "Não informado";
    if (KNOWN_TRAINING_TYPE_LABELS[normalized]) {
      return KNOWN_TRAINING_TYPE_LABELS[normalized];
    }
    return normalized
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const normalizeRow = (row) => {
    const normalized = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      const normalizedKey = normalizeHeader(key);
      if (!normalizedKey) return;
      normalized[normalizedKey] = value;
    });
    return normalized;
  };

  const pickValue = (row, keys) => {
    for (const key of keys) {
      const value = row[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return null;
  };

  const cleanValue = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    }
    return value;
  };

  const toNumber = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const normalized = String(value).replace(",", ".").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const toInteger = (value) => {
    const numeric = toNumber(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
  };

  const normalizeDateValue = (value) => {
    if (value === undefined || value === null) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return format(value, "yyyy-MM-dd");
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      if (value >= 20000) {
        const excelDate = new Date(Math.round((value - 25569) * 86400 * 1000));
        if (!Number.isNaN(excelDate.getTime())) {
          return format(excelDate, "yyyy-MM-dd");
        }
      }
      return null;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
        const [day, month, year] = trimmed.split("/");
        return `${year}-${month}-${day}`;
      }
      const numeric = Number(trimmed.replace(",", "."));
      if (
        Number.isFinite(numeric) &&
        numeric >= 20000 &&
        /^\d+(\.\d+)?$/.test(trimmed)
      ) {
        const excelDate = new Date(
          Math.round((numeric - 25569) * 86400 * 1000)
        );
        if (!Number.isNaN(excelDate.getTime())) {
          return format(excelDate, "yyyy-MM-dd");
        }
      }
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return format(parsed, "yyyy-MM-dd");
      }
      return trimmed;
    }
    return null;
  };

  const normalizeType = (value) => {
    const normalized = normalizeTrainingTypeValue(value);
    return normalized || null;
  };

  const normalizeStatus = (value) => {
    const normalized = normalizeHeader(value);
    if (!normalized) return null;
    if (normalized.includes("agendado")) return "agendado";
    if (normalized.includes("confirmad")) return "confirmado";
    if (normalized.includes("andamento")) return "em_andamento";
    if (normalized.includes("concluido")) return "concluido";
    if (normalized.includes("cancelado")) return "cancelado";
    return normalized;
  };

  const normalizeDatesArray = (value) =>
    (Array.isArray(value) ? value : [])
      .map((item) => {
        if (!item) return null;
        if (typeof item === "object" && item.date) {
          return normalizeDateValue(item.date);
        }
        return normalizeDateValue(item);
      })
      .filter(Boolean)
      .map((date) => ({ date }));

  const parseDatesField = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return normalizeDatesArray(value);
    if (typeof value === "number") {
      const normalized = normalizeDateValue(value);
      return normalized ? [{ date: normalized }] : [];
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          return normalizeDatesArray(parsed);
        } catch {
          // Ignora JSON inválido
        }
      }
      return trimmed
        .split(/[;,|]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((date) => normalizeDateValue(date))
        .filter(Boolean)
        .map((date) => ({ date }));
    }
    return [];
  };

  const importTrainings = useMutation({
    mutationFn: async (/** @type {File} */ file) => {
      setImportStatus({ type: "loading", message: "Processando planilha..." });

      const { file_url } = await dataClient.integrations.Core.UploadFile({ file });
      const result = await dataClient.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
      });

      if (result.status === "error") {
        throw new Error(result.details || "Erro ao processar planilha");
      }

      const rows = result.output?.participants || result.output || [];
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error("Nenhum dado encontrado na planilha.");
      }

      const payloads = rows
        .map((rawRow) => {
          const row = normalizeRow(rawRow);
          const title = cleanValue(pickValue(row, ["title", "titulo"]));
          if (!title) return null;

          const dateValue = normalizeDateValue(pickValue(row, ["date", "data"]));
          const parsedDates = parseDatesField(pickValue(row, ["dates", "datas"]));
          const dates = parsedDates.length
            ? parsedDates
            : dateValue
            ? [{ date: dateValue }]
            : [];

          const payload = {
            title,
            code: cleanValue(pickValue(row, ["code", "codigo"])),
            type: normalizeType(pickValue(row, ["type", "tipo"])),
            category: cleanValue(pickValue(row, ["category", "categoria"])),
            description: cleanValue(pickValue(row, ["description", "descricao"])),
            duration_hours: toInteger(
              pickValue(row, ["duration_hours", "duracao_horas", "duracao"])
            ),
            location: cleanValue(pickValue(row, ["location", "local"])),
            online_link: cleanValue(
              pickValue(row, ["online_link", "link_online", "link"])
            ),
            coordinator: cleanValue(pickValue(row, ["coordinator", "coordenador"])),
            coordinator_email: cleanValue(
              pickValue(row, [
                "coordinator_email",
                "coordenador_email",
                "email_coordenador",
              ])
            ),
            instructor: cleanValue(pickValue(row, ["instructor", "instrutor"])),
            max_participants: toInteger(
              pickValue(row, ["max_participants", "maximo_participantes"])
            ),
            status: normalizeStatus(pickValue(row, ["status", "situacao"])) || "agendado",
            validity_months: toInteger(
              pickValue(row, ["validity_months", "validade_meses"])
            ),
            notes: cleanValue(pickValue(row, ["notes", "observacoes", "obs"])),
          };

          if (dates.length > 0) {
            payload.dates = dates;
            payload.date = dateValue || dates[0]?.date || null;
          } else if (dateValue) {
            payload.date = dateValue;
          }

          return payload;
        })
        .filter(Boolean);

      if (payloads.length === 0) {
        throw new Error("Nenhum treinamento válido encontrado.");
      }

      await dataClient.entities.Training.bulkCreate(payloads);

      const skipped = rows.length - payloads.length;
      setImportStatus({
        type: "success",
        message: `${payloads.length} treinamento(s) importado(s) com sucesso${
          skipped > 0 ? ` (${skipped} linha(s) ignoradas)` : ""
        }.`,
      });

      return payloads;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      setTimeout(() => {
        setShowImport(false);
        setImportFile(null);
        setImportStatus(null);
      }, 2000);
    },
    onError: (error) => {
      setImportStatus({
        type: "error",
        message: error.message || "Erro ao importar planilha",
      });
    },
  });

  const handleImportFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      setImportFile(file);
      setImportStatus(null);
    }
  };

  const handleImport = () => {
    if (importFile) {
      importTrainings.mutate(importFile);
    }
  };

  const downloadTemplate = () => {
    const template = `title,code,type,category,date,dates,duration_hours,location,online_link,coordinator,coordinator_email,instructor,max_participants,status,validity_months,notes
NR-10,TR-001,teorico,Segurança,2025-02-10,2025-02-10;2025-02-11,8,Sala 1,,Maria Silva,maria@email.com,João Santos,30,agendado,12,Turma manhã`;

    const blob = new Blob([template], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "modelo_treinamentos.csv";
    link.click();
  };

  const handleOpenImport = () => {
    setImportFile(null);
    setImportStatus(null);
    setShowImport(true);
  };

  const handleCloseImport = () => {
    setShowImport(false);
    setImportFile(null);
    setImportStatus(null);
  };

  React.useEffect(() => {
    let cancelled = false;

    const syncTrainingStatuses = async () => {
      if (!trainings.length) return;

      // Atualiza relógio local para refletir status visual em tempo real.
      forceStatusClockTick((value) => value + 1);

      const updates = trainings
        .map((training) => {
          const trainingId = String(training?.id || "").trim();
          const nextStatus = getEffectiveTrainingStatus(training);
          const currentStatus = String(training?.status || "").trim();
          if (!trainingId || training?.status === "cancelado") return null;
          if (!nextStatus || nextStatus === currentStatus) return null;
          const lastSentStatus = autoUpdatedRef.current.get(trainingId);
          if (lastSentStatus === nextStatus) return null;
          return { trainingId, nextStatus };
        })
        .filter(Boolean);

      if (!updates.length || cancelled) return;
      updates.forEach(({ trainingId, nextStatus }) => {
        autoUpdatedRef.current.set(trainingId, nextStatus);
      });

      try {
        await Promise.all(
          updates.map(({ trainingId, nextStatus }) =>
            dataClient.entities.Training.update(trainingId, { status: nextStatus })
          )
        );
        if (cancelled) return;
        queryClient.invalidateQueries({ queryKey: ["trainings"] });
      } catch (error) {
        // Se falhar (RLS), mantém apenas o status visual.
      }
    };

    syncTrainingStatuses();
    const timer = window.setInterval(syncTrainingStatuses, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [trainings, queryClient]);

  const getTrainingStatus = (training) => getEffectiveTrainingStatus(training);

  const toNumeric = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  const toGradePercent = (participant) => {
    const numeric = toNumeric(participant?.grade);
    if (numeric === null) return null;
    if (numeric >= 0 && numeric <= 1) return numeric * 100;
    return numeric;
  };

  const isCancelledEnrollment = (participant) =>
    String(participant?.enrollment_status || "").trim().toLowerCase() === "cancelado";

  const isApprovedParticipant = (participant, training) => {
    if (!participant || isCancelledEnrollment(participant)) return false;
    if (participant?.certificate_issued) return true;

    if (isRepadronizacaoTraining(training)) {
      const trainingId = String(training?.id || "").trim();
      const participantId = String(participant?.id || "").trim();
      const repadStatus = repadApprovalByTrainingId
        .get(trainingId)
        ?.get(participantId);
      if (repadStatus) return Boolean(repadStatus.approved);

      const gradePercent = toGradePercent(participant);
      if (gradePercent !== null) return gradePercent >= 70;
      return participant?.approved === true;
    }

    return participant?.approved === true;
  };

  const getTrainingYear = (training) => {
    if (!training) return null;
    const firstDateItem = getTrainingDateItems(training)[0] || null;
    const value = firstDateItem?.date || training.start_date || training.date;
    if (!value) return null;
    const parsed = parseDateSafe(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.getFullYear();
  };

  const yearOptions = React.useMemo(() => {
    const years = new Set([Number(currentYearValue)]);
    trainings.forEach((training) => {
      const year = getTrainingYear(training);
      if (year) years.add(year);
    });
    return Array.from(years)
      .sort((a, b) => b - a)
      .map((year) => ({ value: String(year), label: String(year) }));
  }, [trainings, currentYearValue]);

  const typeOptions = React.useMemo(() => {
    const knownOptions = KNOWN_TRAINING_TYPE_ORDER.map((value) => ({
      value,
      label: KNOWN_TRAINING_TYPE_LABELS[value],
    }));

    const dynamicTypes = new Set();
    (trainings || []).forEach((training) => {
      const normalized = normalizeTrainingTypeValue(training?.type);
      if (!normalized || KNOWN_TRAINING_TYPE_LABELS[normalized]) return;
      dynamicTypes.add(normalized);
    });

    const dynamicOptions = Array.from(dynamicTypes)
      .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }))
      .map((value) => ({
        value,
        label: formatTrainingTypeLabel(value),
      }));

    return [...knownOptions, ...dynamicOptions];
  }, [trainings]);

  const filteredTrainings = trainings
    .filter((t) => {
      const effectiveStatus = getTrainingStatus(t);
      const matchesSearch =
        t.title?.toLowerCase().includes(search.toLowerCase()) ||
        t.coordinator?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || effectiveStatus === statusFilter;
      const matchesType =
        typeFilter === "all" ||
        normalizeTrainingTypeValue(t.type) === typeFilter;
      const trainingYear = getTrainingYear(t);
      const matchesYear = yearFilter === "all" || String(trainingYear || "") === yearFilter;
      return matchesSearch && matchesStatus && matchesType && matchesYear;
    })
    .map((training) => {
      const rows = getTrainingParticipants(training);
      const enrolledCount = rows.filter((participant) => !isCancelledEnrollment(participant)).length;
      const approvedCount = rows.filter((participant) =>
        isApprovedParticipant(participant, training)
      ).length;
      const effectiveStatus = getTrainingStatus(training);
      const displayCount =
        effectiveStatus === "concluido" ? approvedCount : enrolledCount;
      return {
        ...training,
        participants_count: displayCount,
        enrolled_count: enrolledCount,
        approved_count: approvedCount,
      };
    });

  const statusColors = {
    agendado: "bg-blue-100 text-blue-700",
    confirmado: "bg-emerald-100 text-emerald-700",
    em_andamento: "bg-amber-100 text-amber-700",
    concluido: "bg-green-100 text-green-700",
    cancelado: "bg-red-100 text-red-700",
  };

  const statusLabels = {
    agendado: "Agendado",
    confirmado: "Confirmado",
    em_andamento: "Em andamento",
    concluido: "Concluído",
    cancelado: "Cancelado",
  };

  const formatDate = (value) => {
    if (!value) return "-";
    const parsed = parseDateSafe(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return format(parsed, "dd/MM/yyyy");
  };

  function parseDateSafe(value) {
    if (!value) return new Date(NaN);
    if (value instanceof Date) return new Date(value.getTime());
    if (typeof value === "string") {
      const trimmed = value.trim();
      const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        return new Date(year, month - 1, day);
      }
      return new Date(trimmed);
    }
    return new Date(value);
  }

  const columns = [
    {
      header: "Data(s)",
      render: (row) => {
        if (Array.isArray(row.dates) && row.dates.length > 0) {
          const parsedDates = row.dates
            .map((item) => parseDateSafe(item?.date))
            .filter((date) => !Number.isNaN(date.getTime()))
            .sort((a, b) => a.getTime() - b.getTime());
          if (parsedDates.length === 0) return "-";
          const startDate = formatDate(parsedDates[0]);
          const endDate = formatDate(parsedDates[parsedDates.length - 1]);
          const isSingleDay = startDate === endDate;
          return (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              <div>
                <div>
                  {startDate}
                  {!isSingleDay && ` até ${endDate}`}
                </div>
                {row.dates.length > 1 && (
                  <span className="text-xs text-slate-500">
                    {row.dates.length} data(s)
                  </span>
                )}
              </div>
            </div>
          );
        }
        return "-";
      },
    },
    { 
      header: "Treinamento", 
      accessor: "title",
      cellClassName: "font-medium",
      render: (row) => (
        <div>
          <button
            type="button"
            className="font-medium text-left text-slate-900 hover:text-blue-700 hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/TrainingWorkspace?training=${encodeURIComponent(row.id)}`);
            }}
          >
            {row.title}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {row.online_link && (
              <button
                type="button"
                title="Abrir sala online"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-700 transition-colors hover:bg-blue-100"
                onClick={(event) => {
                  event.stopPropagation();
                  window.open(row.online_link, "_blank", "noopener,noreferrer");
                }}
              >
                <Video className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      ),
    },
    {
      header: "Tipo",
      render: (row) => (
        <Badge variant="outline">{formatTrainingTypeLabel(row.type)}</Badge>
      ),
    },
    {
      header: "Coordenador",
      accessor: "coordinator",
    },
    {
      header: "Local",
      render: (row) => {
        const hasLocation = Boolean(String(row.location || "").trim());
        const hasOnlineRoom = Boolean(String(row.online_link || "").trim());
        if (!hasLocation && !hasOnlineRoom) return "-";
        return (
          <div className="space-y-1 text-sm">
            {hasLocation && (
              <div className="flex items-center gap-1 text-slate-600">
                <MapPin className="h-3 w-3" />
                {row.location}
              </div>
            )}
            {hasOnlineRoom && (
              <div className="flex items-center gap-1 text-blue-600">
                <Video className="h-3 w-3" />
                Online
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: "Participantes",
      render: (row) => {
        const effectiveStatus = getTrainingStatus(row);
        const isConcluded = effectiveStatus === "concluido";
        const count = isConcluded
          ? row.approved_count ?? row.participants_count ?? 0
          : row.enrolled_count ?? row.participants_count ?? 0;
        return (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4 text-slate-400" />
              {count}
              {!isConcluded && row.max_participants && (
                <span className="text-slate-400">/{row.max_participants}</span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              {isConcluded ? "aprovados" : "inscritos"}
            </p>
          </div>
        );
      },
    },
    {
      header: "Status",
      render: (row) => {
        const effectiveStatus = getTrainingStatus(row);
        return (
          <Badge className={statusColors[effectiveStatus]}>
            {statusLabels[effectiveStatus]}
          </Badge>
        );
      },
    },
    {
      header: "Ações",
      cellClassName: "text-right",
      sortable: false,
      render: (row) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/TrainingWorkspace?training=${encodeURIComponent(row.id)}`);
                }}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Abrir Painel
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTraining(row);
                  setShowDetails(true);
                }}
              >
                <Eye className="h-4 w-4 mr-2" />
                Ver Detalhes
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/EnrollmentPage?training=${encodeURIComponent(row.id)}`);
                }}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Página de Inscrição
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(
                    `/TrainingFeedbackPage?training=${encodeURIComponent(row.id)}`
                  );
                }}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Página de Avaliação
              </DropdownMenuItem>
              {isRepadronizacaoTraining(row) && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(
                      `/TracomaExaminerEvaluationPage?training=${encodeURIComponent(
                        row.id
                      )}`
                    );
                  }}
                >
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  Avaliação de Tracoma (50)
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTraining(row);
                  setShowAttendance(true);
                }}
              >
                <ClipboardCheck className="h-4 w-4 mr-2" />
                Controle de Presença
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTraining(row);
                  setShowCertificates(true);
                }}
              >
                <Award className="h-4 w-4 mr-2" />
                Certificados
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTraining(row);
                  setShowMaterials(true);
                }}
              >
                <FileText className="h-4 w-4 mr-2" />
                Materiais Didáticos
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTraining(row);
                  setShowForm(true);
                }}
              >
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteStatus(null);
                  setDeleteConfirm(row);
                }}
                className="text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treinamentos"
        subtitle="Gerencie treinamentos e participantes"
        action={() => {
          setSelectedTraining(null);
          setShowForm(true);
        }}
        actionLabel="Novo Treinamento"
      />

      <div className="flex flex-col lg:flex-row gap-3 justify-between">
        <div className="flex-1">
          <SearchFilter
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por título ou coordenador..."
            filters={[
              {
                value: yearFilter,
                onChange: setYearFilter,
                placeholder: "Ano",
                allLabel: "Todos os anos",
                options: yearOptions,
              },
              {
                value: statusFilter,
                onChange: setStatusFilter,
                placeholder: "Status",
                allLabel: "Todos os status",
                options: statusOptions,
              },
              {
                value: typeFilter,
                onChange: setTypeFilter,
                placeholder: "Tipo",
                allLabel: "Todos os tipos",
                options: typeOptions,
              },
            ]}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={downloadTemplate}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Modelo
          </Button>
          <Button
            onClick={handleOpenImport}
            className="bg-green-600 hover:bg-green-700 flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Importar Planilha
          </Button>
        </div>
      </div>

      {deleteStatus && (
        <Alert
          className={
            deleteStatus.type === "error"
              ? "border-red-200 bg-red-50"
              : "border-green-200 bg-green-50"
          }
        >
          <AlertDescription
            className={
              deleteStatus.type === "error"
                ? "text-red-800"
                : "text-green-800"
            }
          >
            {deleteStatus.message}
          </AlertDescription>
        </Alert>
      )}

      <DataTable
        columns={columns}
        data={filteredTrainings}
        isLoading={isLoading}
        emptyMessage="Nenhum treinamento cadastrado"
      />

      {/* Import Dialog */}
      <Dialog
        open={showImport}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseImport();
            return;
          }
          setShowImport(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Importar Treinamentos
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Baixe o modelo, preencha com os treinamentos e envie a planilha
                para importar.
              </AlertDescription>
            </Alert>

            <div className="flex">
              <Button
                variant="outline"
                onClick={downloadTemplate}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Baixar modelo
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="training-import-file">
                Selecione o arquivo (.xlsx, .csv)
              </Label>
              <Input
                id="training-import-file"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImportFileChange}
              />
              {importFile && (
                <p className="text-sm text-slate-500">
                  Arquivo selecionado: {importFile.name}
                </p>
              )}
            </div>

            {importStatus && (
              <Alert
                className={
                  importStatus.type === "error"
                    ? "border-red-200 bg-red-50"
                    : importStatus.type === "success"
                    ? "border-green-200 bg-green-50"
                    : "border-blue-200 bg-blue-50"
                }
              >
                {importStatus.type === "error" && (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                )}
                {importStatus.type === "success" && (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                )}
                {importStatus.type === "loading" && (
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                )}
                <AlertDescription
                  className={
                    importStatus.type === "error"
                      ? "text-red-800"
                      : importStatus.type === "success"
                      ? "text-green-800"
                      : "text-blue-800"
                  }
                >
                  {importStatus.message}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleCloseImport}>
                Cancelar
              </Button>
              <Button
                onClick={handleImport}
                disabled={!importFile || importTrainings.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {importTrainings.isPending ? (
                  <>
                    <AlertCircle className="h-4 w-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Importar
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Training Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedTraining ? "Editar Treinamento" : "Novo Treinamento"}
            </DialogTitle>
          </DialogHeader>
          <TrainingForm
            training={selectedTraining}
            professionals={professionals}
            onClose={() => {
              setShowForm(false);
              setSelectedTraining(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Training Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Treinamento</DialogTitle>
          </DialogHeader>
          <TrainingDetails
            training={selectedTraining}
            participants={getTrainingParticipants(selectedTraining)}
          />
        </DialogContent>
      </Dialog>

      {/* Enrollment Manager Dialog */}
      <Dialog open={showEnrollment} onOpenChange={setShowEnrollment}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Inscrições - {selectedTraining?.title}</span>
              {selectedTraining && (
                <SendLinkButton 
                  training={selectedTraining}
                  participants={getTrainingParticipants(selectedTraining)}
                />
              )}
            </DialogTitle>
          </DialogHeader>
          <EnrollmentManager
            training={selectedTraining}
            professionals={professionals}
            existingParticipants={getTrainingParticipants(selectedTraining)}
            onClose={() => {
              setShowEnrollment(false);
              setSelectedTraining(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Attendance Control Dialog */}
      <Dialog open={showAttendance} onOpenChange={setShowAttendance}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Controle de Presença</DialogTitle>
          </DialogHeader>
          <AttendanceControl
            training={selectedTraining}
            participants={getTrainingParticipants(selectedTraining)}
            onClose={() => {
              setShowAttendance(false);
              setSelectedTraining(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Certificate Manager Dialog */}
      <Dialog open={showCertificates} onOpenChange={setShowCertificates}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Emitir Certificados</DialogTitle>
          </DialogHeader>
          {selectedTraining ? (
            <CertificateManager
              training={selectedTraining}
              participants={getTrainingParticipants(selectedTraining)}
              onClose={() => {
                setShowCertificates(false);
                setSelectedTraining(null);
              }}
            />
          ) : (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertDescription className="text-amber-800">
                Treinamento não carregado. Feche e abra novamente a emissão de certificados.
              </AlertDescription>
            </Alert>
          )}
        </DialogContent>
      </Dialog>

      {/* Materials Manager Dialog */}
      <Dialog open={showMaterials} onOpenChange={setShowMaterials}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Materiais Didáticos - {selectedTraining?.title}</DialogTitle>
          </DialogHeader>
          {selectedTraining && <MaterialsManager training={selectedTraining} />}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o treinamento "{deleteConfirm?.title}"? 
              O evento correspondente na agenda também será removido (quando vinculado).
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTraining.mutate(deleteConfirm)}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}