import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { extractTrainingIdFromEventNotes } from "@/lib/eventMetadata";
import { format } from "date-fns";
import {
  Edit,
  Trash2,
  Eye,
  Users,
  Calendar,
  MapPin,
  Video,
  UserPlus,
  ClipboardCheck,
  Award,
  Link2,
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

  const navigate = useNavigate();
  const autoUpdatedRef = React.useRef(new Set());

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

  const deleteTraining = useMutation({
    mutationFn: async (trainingToDelete) => {
      const trainingId = String(trainingToDelete?.id || "").trim();
      if (!trainingId) {
        throw new Error("Treinamento inválido para exclusão.");
      }

      const normalizeComparisonText = (value) =>
        String(value ?? "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();

      const expectedStartDate = (() => {
        if (Array.isArray(trainingToDelete?.dates)) {
          const firstDate = trainingToDelete.dates.find((item) => item?.date)?.date;
          if (firstDate) return String(firstDate);
        }
        if (trainingToDelete?.date) return String(trainingToDelete.date);
        return "";
      })();

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
          if (!expectedStartDate) return true;
          return String(item.start_date || "") === expectedStartDate;
        });
      }

      if (relatedEvents.length > 0) {
        await Promise.all(
          relatedEvents.map((item) => dataClient.entities.Event.delete(item.id))
        );
      }

      await dataClient.entities.Training.delete(trainingId);
      return { deletedEvents: relatedEvents.length };
    },
    onSuccess: ({ deletedEvents }) => {
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setDeleteConfirm(null);
      setDeleteStatus({
        type: "success",
        message:
          deletedEvents > 0
            ? `Treinamento e ${deletedEvents} evento(s) da agenda foram excluídos.`
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
    { value: "em_andamento", label: "Em andamento" },
    { value: "concluido", label: "Concluído" },
    { value: "cancelado", label: "Cancelado" },
  ];

  const typeOptions = [
    { value: "teorico", label: "Teórico" },
    { value: "pratico", label: "Prático" },
    { value: "teorico_pratico", label: "Teórico/Prático" },
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
    const normalized = normalizeHeader(value);
    if (!normalized) return null;
    if (normalized.includes("teorico") && normalized.includes("pratico")) {
      return "teorico_pratico";
    }
    if (normalized.includes("teorico")) return "teorico";
    if (normalized.includes("pratico")) return "pratico";
    return normalized;
  };

  const normalizeStatus = (value) => {
    const normalized = normalizeHeader(value);
    if (!normalized) return null;
    if (normalized.includes("agendado")) return "agendado";
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

  const getLastTrainingDate = (training) => {
    if (!training) return null;
    const dates = [];
    if (Array.isArray(training.dates)) {
      training.dates.forEach((item) => {
        if (item?.date) dates.push(item.date);
      });
    }
    if (training.date) dates.push(training.date);
    if (dates.length === 0) return null;
    const parsedDates = dates
      .map((date) => parseDateSafe(date))
      .filter((date) => !Number.isNaN(date.getTime()));
    if (parsedDates.length === 0) return null;
    return new Date(Math.max(...parsedDates.map((date) => date.getTime())));
  };

  const shouldMarkConcluded = (training) => {
    if (!training) return false;
    if (training.status === "concluido" || training.status === "cancelado") {
      return false;
    }
    const lastDate = getLastTrainingDate(training);
    if (!lastDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return lastDate.getTime() < today.getTime();
  };

  React.useEffect(() => {
    if (!trainings.length) return;
    const pending = trainings.filter(
      (training) =>
        training.id &&
        shouldMarkConcluded(training) &&
        !autoUpdatedRef.current.has(training.id)
    );
    if (pending.length === 0) return;
    pending.forEach((training) => autoUpdatedRef.current.add(training.id));
    Promise.all(
      pending.map((training) =>
        dataClient.entities.Training.update(training.id, {
          status: "concluido",
        })
      )
    )
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["trainings"] });
      })
      .catch(() => {
        // Se falhar (RLS), mantém apenas o status visual.
      });
  }, [trainings, queryClient]);

  const getTrainingStatus = (training) =>
    shouldMarkConcluded(training) ? "concluido" : training.status;

  const getTrainingYear = (training) => {
    if (!training) return null;
    let value = null;
    if (Array.isArray(training.dates) && training.dates.length > 0) {
      const first = training.dates[0];
      value = first?.date || first;
    }
    if (!value) {
      value = training.start_date || training.date;
    }
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

  const filteredTrainings = trainings.filter((t) => {
    const effectiveStatus = getTrainingStatus(t);
    const matchesSearch = t.title?.toLowerCase().includes(search.toLowerCase()) ||
                          t.coordinator?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || effectiveStatus === statusFilter;
    const matchesType = typeFilter === "all" || t.type === typeFilter;
    const trainingYear = getTrainingYear(t);
    const matchesYear = yearFilter === "all" || String(trainingYear || "") === yearFilter;
    return matchesSearch && matchesStatus && matchesType && matchesYear;
  });

  const statusColors = {
    agendado: "bg-blue-100 text-blue-700",
    em_andamento: "bg-amber-100 text-amber-700",
    concluido: "bg-green-100 text-green-700",
    cancelado: "bg-red-100 text-red-700",
  };

  const statusLabels = {
    agendado: "Agendado",
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

  const typeLabels = {
    teorico: "Teórico",
    pratico: "Prático",
    teorico_pratico: "Teórico/Prático",
  };

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
          <p className="font-medium">{row.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {row.code && <p className="text-xs text-slate-500">{row.code}</p>}
            {row.online_link && (
              <Badge className="bg-blue-100 text-blue-700 border border-blue-200">
                <Video className="h-3 w-3 mr-1" />
                Online
              </Badge>
            )}
          </div>
        </div>
      ),
    },
    {
      header: "Tipo",
      render: (row) => <Badge variant="outline">{typeLabels[row.type]}</Badge>,
    },
    {
      header: "Coordenador",
      accessor: "coordinator",
    },
    {
      header: "Local",
      render: (row) => row.location && (
        <div className="flex items-center gap-1 text-sm text-slate-600">
          <MapPin className="h-3 w-3" />
          {row.location}
        </div>
      ),
    },
    {
      header: "Participantes",
      render: (row) => (
        <div className="flex items-center gap-1">
          <Users className="h-4 w-4 text-slate-400" />
          {row.participants_count || 0}
          {row.max_participants && <span className="text-slate-400">/{row.max_participants}</span>}
        </div>
      ),
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
                  const enrollUrl = `${window.location.origin}/PublicEnrollment?training=${encodeURIComponent(row.id)}`;
                  navigator.clipboard.writeText(enrollUrl);
                  alert("Link de inscrição copiado!");
                }}
              >
                <Link2 className="h-4 w-4 mr-2" />
                Copiar Link
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
            participants={participants.filter(p => p.training_id === selectedTraining?.id)}
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
                  participants={participants.filter(p => p.training_id === selectedTraining?.id)}
                />
              )}
            </DialogTitle>
          </DialogHeader>
          <EnrollmentManager
            training={selectedTraining}
            professionals={professionals}
            existingParticipants={participants.filter(p => p.training_id === selectedTraining?.id)}
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
            participants={participants.filter(p => p.training_id === selectedTraining?.id)}
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
              participants={participants.filter(p => p.training_id === selectedTraining?.id)}
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