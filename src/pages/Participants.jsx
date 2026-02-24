import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PageHeader from "@/components/common/PageHeader";
import SearchFilter from "@/components/common/SearchFilter";
import DataTable from "@/components/common/DataTable";
import { useNavigate } from "react-router-dom";

export default function Participants() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [municipalityFilter, setMunicipalityFilter] = useState("all");
  const [gveFilter, setGveFilter] = useState("all");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [cleanupStatus, setCleanupStatus] = useState(null);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const cleanedInvalidParticipantIdsRef = useRef(new Set());

  const queryClient = useQueryClient();

  const { data: participants = [], isLoading } = useQuery({
    queryKey: ["participants"],
    queryFn: () => dataClient.entities.TrainingParticipant.list("-training_date"),
  });

  const { data: trainings = [], isLoading: loadingTrainings } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => dataClient.entities.Training.list(),
  });

  const normalizeText = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");

  const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();

  const normalizeRg = (value) =>
    String(value ?? "")
      .replace(/[^0-9a-zA-Z]/g, "")
      .toUpperCase()
      .trim();

  const toNumeric = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(String(value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const isSameParticipant = (base, candidate) => {
    if (!base || !candidate) return false;
    const baseName = normalizeText(base.professional_name);
    const baseEmail = normalizeEmail(base.professional_email);
    const baseRg = normalizeRg(base.professional_rg);
    const candName = normalizeText(candidate.professional_name);
    const candEmail = normalizeEmail(candidate.professional_email);
    const candRg = normalizeRg(candidate.professional_rg);

    const nameEmailMatch =
      baseName &&
      candName &&
      baseName === candName &&
      baseEmail &&
      candEmail &&
      baseEmail === candEmail;
    if (nameEmailMatch) return true;

    const rgMatch = baseRg && candRg && baseRg === candRg;
    if (rgMatch) return true;

    let matches = 0;
    if (baseName && candName && baseName === candName) matches += 1;
    if (baseEmail && candEmail && baseEmail === candEmail) matches += 1;
    if (baseRg && candRg && baseRg === candRg) matches += 1;
    return matches >= 2;
  };

  const scoreParticipant = (participant) => {
    if (!participant) return 0;
    const fields = [
      "professional_name",
      "professional_rg",
      "professional_cpf",
      "professional_email",
      "professional_registration",
      "professional_sector",
      "professional_formation",
      "institution",
      "state",
      "health_region",
      "municipality",
      "unit_name",
      "position",
      "work_address",
      "residential_address",
      "commercial_phone",
      "mobile_phone",
    ];
    return fields.reduce((acc, key) => (participant[key] ? acc + 1 : acc), 0);
  };

  const mergeParticipantData = (items) => {
    if (!items.length) return {};
    const sorted = [...items].sort(
      (a, b) => scoreParticipant(b) - scoreParticipant(a)
    );
    const merged = { ...sorted[0] };
    sorted.slice(1).forEach((participant) => {
      Object.entries(participant || {}).forEach(([key, value]) => {
        if (merged[key] === undefined || merged[key] === null || merged[key] === "") {
          if (value !== undefined && value !== null && value !== "") {
            merged[key] = value;
          }
        }
      });
    });
    return merged;
  };

  const typeLabels = {
    teorico: "Teórico",
    pratico: "Prático",
    teorico_pratico: "Teórico/Prático",
    repadronizacao: "Repadronização",
  };

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
    if (!training) return [];
    const keys = [];
    const baseDate = normalizeDateKey(training.date);
    if (baseDate) keys.push(baseDate);
    const trainingDates = Array.isArray(training.dates) ? training.dates : [];
    trainingDates.forEach((item) => {
      const value = typeof item === "object" ? item?.date : item;
      const dateKey = normalizeDateKey(value);
      if (dateKey) keys.push(dateKey);
    });
    return Array.from(new Set(keys));
  };

  const trainingMaps = useMemo(() => {
    const byId = new Map();
    const byTitle = new Map();
    const titleById = new Map();
    trainings.forEach((training) => {
      const trainingId = String(training?.id || "").trim();
      if (trainingId) {
        byId.set(trainingId, training);
        if (training.title) titleById.set(trainingId, training.title);
      }
      const titleKey = normalizeText(training.title);
      if (!titleKey) return;
      if (!byTitle.has(titleKey)) {
        byTitle.set(titleKey, []);
      }
      byTitle.get(titleKey).push(training);
    });
    return { byId, byTitle, titleById };
  }, [trainings]);

  const resolveTrainingFromParticipant = (participant) => {
    if (!participant) return null;
    const trainingId = String(participant.training_id || "").trim();
    if (trainingId) {
      return trainingMaps.byId.get(trainingId) || null;
    }
    const titleKey = normalizeText(participant.training_title);
    if (!titleKey) return null;
    const candidates = trainingMaps.byTitle.get(titleKey) || [];
    if (!candidates.length) return null;
    const participantDateKey = normalizeDateKey(participant.training_date);
    if (!participantDateKey) return candidates[0];
    const byDate = candidates.find((training) =>
      getTrainingDateKeys(training).includes(participantDateKey)
    );
    return byDate || null;
  };

  const resolveTrainingIdForImportRow = (row) => {
    const explicitTrainingId = String(row?.training_id || "").trim();
    if (explicitTrainingId) return explicitTrainingId;

    const titleKey = normalizeText(row?.training_title);
    if (!titleKey) return "";
    const candidates = trainingMaps.byTitle.get(titleKey) || [];
    if (!candidates.length) return "";

    const rowDateKey = normalizeDateKey(row?.training_date);
    if (rowDateKey) {
      const byDate = candidates.find((training) =>
        getTrainingDateKeys(training).includes(rowDateKey)
      );
      return String(byDate?.id || "").trim();
    }

    if (candidates.length === 1) {
      return String(candidates[0]?.id || "").trim();
    }

    return "";
  };

  const resolveTrainingType = (participant) => {
    if (!participant) return null;
    const training = resolveTrainingFromParticipant(participant);
    if (training?.type) return training.type;
    const title = String(participant.training_title || "").toLowerCase();
    if (title.includes("teorico") || title.includes("teórico")) return "teorico";
    if (title.includes("pratico") || title.includes("prático")) return "pratico";
    if (title.includes("repadronizacao") || title.includes("repadronização")) {
      return "repadronizacao";
    }
    return null;
  };

  const isApprovedParticipation = (participant) => {
    if (!participant) return false;
    if (participant.enrollment_status === "cancelado") return false;
    if (participant.certificate_issued) return true;
    if (participant.approved === true) return true;

    const trainingType = resolveTrainingType(participant);
    if (trainingType === "repadronizacao") {
      const gradeValue = toNumeric(participant.grade);
      return Number.isFinite(gradeValue) && gradeValue >= 70;
    }

    return false;
  };

  const { validParticipants, invalidParticipants } = useMemo(() => {
    const valid = [];
    const invalid = [];
    participants.forEach((participant) => {
      const trainingId = String(participant?.training_id || "").trim();
      if (trainingId) {
        if (trainingMaps.byId.has(trainingId)) {
          valid.push(participant);
        } else {
          invalid.push(participant);
        }
        return;
      }

      if (resolveTrainingFromParticipant(participant)) {
        valid.push(participant);
      } else {
        invalid.push(participant);
      }
    });
    return { validParticipants: valid, invalidParticipants: invalid };
  }, [participants, trainingMaps]);

  const approvedParticipants = useMemo(
    () => validParticipants.filter((participant) => isApprovedParticipation(participant)),
    [validParticipants]
  );

  const invalidParticipantIds = useMemo(
    () =>
      invalidParticipants
        .map((participant) => String(participant?.id || "").trim())
        .filter(Boolean),
    [invalidParticipants]
  );

  useEffect(() => {
    if (isLoading || loadingTrainings) return;
    if (!invalidParticipantIds.length) return;

    const pendingIds = invalidParticipantIds.filter(
      (id) => !cleanedInvalidParticipantIdsRef.current.has(id)
    );
    if (!pendingIds.length) return;

    pendingIds.forEach((id) => cleanedInvalidParticipantIdsRef.current.add(id));
    let isCancelled = false;

    (async () => {
      const results = await Promise.allSettled(
        pendingIds.map((id) => dataClient.entities.TrainingParticipant.delete(id))
      );
      if (isCancelled) return;

      const deletedCount = results.filter(
        (result) => result.status === "fulfilled"
      ).length;
      const failedCount = results.length - deletedCount;

      if (deletedCount > 0) {
        await queryClient.invalidateQueries({ queryKey: ["participants"] });
      }

      if (deletedCount > 0 || failedCount > 0) {
        setCleanupStatus({
          type: failedCount > 0 ? "error" : "success",
          message:
            failedCount > 0
              ? `Limpeza removeu ${deletedCount} registro(s) órfão(s), mas ${failedCount} não puderam ser excluídos.`
              : `Limpeza removeu ${deletedCount} registro(s) órfão(s) da listagem de participantes.`,
        });
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [invalidParticipantIds, isLoading, loadingTrainings, queryClient]);

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

  const uploadExcel = useMutation({
    mutationFn: async (file) => {
      setUploadStatus({ type: "loading", message: "Processando planilha..." });
      
      // Upload file
      const { file_url } = await dataClient.integrations.Core.UploadFile({ file });
      
      // Extract data from Excel
      const result = await dataClient.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: "object",
          properties: {
            participants: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  training_title: { type: "string" },
                  training_date: { type: "string" },
                  professional_name: { type: "string" },
                  professional_registration: { type: "string" },
                  professional_rg: { type: "string" },
                  professional_cpf: { type: "string" },
                  professional_email: { type: "string" },
                  professional_sector: { type: "string" },
                  attendance: { type: "string" },
                  approved: { type: "boolean" },
                }
              }
            }
          }
        }
      });

      if (result.status === "error") {
        throw new Error(result.details || "Erro ao processar planilha");
      }

      const participantsData = result.output.participants || result.output;
      const normalizedParticipants = (participantsData || []).map((item) => ({
        ...item,
        training_date: normalizeDateValue(item.training_date),
      })).map((item) => {
        const resolvedTrainingId = resolveTrainingIdForImportRow(item);
        return {
          ...item,
          training_id: resolvedTrainingId || null,
        };
      });
      
      // Create participants
      await dataClient.entities.TrainingParticipant.bulkCreate(
        normalizedParticipants
      );
      
      setUploadStatus({ 
        type: "success", 
        message: `${normalizedParticipants.length} participante(s) importado(s) com sucesso!` 
      });
      
      return normalizedParticipants;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participants"] });
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      setTimeout(() => {
        setShowUpload(false);
        setUploadFile(null);
        setUploadStatus(null);
      }, 2000);
    },
    onError: (error) => {
      setUploadStatus({ 
        type: "error", 
        message: error.message || "Erro ao importar participantes" 
      });
    },
  });

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setUploadStatus(null);
    }
  };

  const handleUpload = () => {
    if (uploadFile) {
      uploadExcel.mutate(uploadFile);
    }
  };

  const downloadTemplate = () => {
    const template = `training_title,training_date,professional_name,professional_registration,professional_rg,professional_cpf,professional_email,professional_sector,attendance,approved
NR-10,2025-01-15,João Silva,001234,12.345.678-9,123.456.789-00,joao@email.com,Manutenção,presente,true
NR-35,2025-01-20,Maria Souza,001235,98.765.432-1,987.654.321-00,maria@email.com,Produção,presente,true`;
    
    const blob = new Blob([template], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo_participantes.csv";
    a.click();
  };

  const handleExport = () => {
    const rows = filteredParticipants.map((group) => ({
      Nome: group.profile.professional_name || "",
      RG: group.profile.professional_rg || "",
      CPF: group.profile.professional_cpf || "",
      Email: group.profile.professional_email || "",
      Celular: group.profile.mobile_phone || "",
      Municipio: group.profile.municipality || "",
      GVE: group.profile.health_region || "",
      "Tipo de Curso": group.courseTypes
        .map((type) => typeLabels[type] || type)
        .join(", "),
      "Nome do Curso": group.courseTitles.join(", "),
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Participantes");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `participantes_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const groupedParticipants = useMemo(() => {
    const groups = [];
    approvedParticipants.forEach((participant) => {
      const existingGroup = groups.find((group) =>
        group.members.some((member) => isSameParticipant(member, participant))
      );
      if (existingGroup) {
        existingGroup.members.push(participant);
      } else {
        groups.push({
          id: participant.id,
          members: [participant],
        });
      }
    });

    return groups.map((group) => {
      const profile = mergeParticipantData(group.members);
      const typeSet = new Set();
      const titleSet = new Set();
      group.members.forEach((member) => {
        const type = resolveTrainingType(member);
        if (type) typeSet.add(type);
        const title =
          member.training_title ||
          trainingMaps.titleById.get(String(member.training_id || "").trim());
        if (title) titleSet.add(title);
      });
      return {
        id: group.id,
        profile,
        members: group.members,
        courseTypes: Array.from(typeSet),
        courseTitles: Array.from(titleSet),
      };
    });
  }, [approvedParticipants, trainingMaps]);

  const filteredParticipants = groupedParticipants
    .filter((group) => {
      if (!search) return true;
      const searchTerm = normalizeText(search);
      const courseTitles = group.courseTitles.join(" ");
      const courseLabel = group.courseTypes
        .map((type) => typeLabels[type] || type)
        .join(" ");
      const haystack = normalizeText(
        [
          group.profile.professional_name,
          group.profile.professional_email,
          group.profile.professional_rg,
          group.profile.municipality,
          group.profile.health_region,
          group.profile.mobile_phone,
          courseLabel,
          courseTitles,
        ]
          .filter(Boolean)
          .join(" ")
      );
      return haystack.includes(searchTerm);
    })
    .filter((group) => {
      if (typeFilter === "all") return true;
      return group.courseTypes.includes(typeFilter);
    })
    .filter((group) => {
      if (courseFilter === "all") return true;
      const normalizedFilter = normalizeText(courseFilter);
      return group.courseTitles.some(
        (title) => normalizeText(title) === normalizedFilter
      );
    })
    .filter((group) => {
      if (municipalityFilter === "all") return true;
      const value = normalizeText(group.profile.municipality);
      return value && value === normalizeText(municipalityFilter);
    })
    .filter((group) => {
      if (gveFilter === "all") return true;
      const value = normalizeText(group.profile.health_region);
      return value && value === normalizeText(gveFilter);
    })
    .sort((a, b) =>
      (a.profile.professional_name || "").localeCompare(
        b.profile.professional_name || "",
        "pt-BR",
        { sensitivity: "base" }
      )
    );

  const courseOptions = useMemo(() => {
    const titles = new Set();
    approvedParticipants.forEach((participant) => {
      if (participant.training_title) {
        titles.add(participant.training_title);
        return;
      }
      if (participant.training_id) {
        const title = trainingMaps.titleById.get(
          String(participant.training_id || "").trim()
        );
        if (title) titles.add(title);
      }
    });
    return Array.from(titles)
      .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }))
      .map((title) => ({ value: title, label: title }));
  }, [approvedParticipants, trainingMaps]);

  const municipalityOptions = useMemo(() => {
    const values = new Set();
    groupedParticipants.forEach((group) => {
      if (group.profile.municipality) values.add(group.profile.municipality);
    });
    return Array.from(values)
      .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }))
      .map((value) => ({ value, label: value }));
  }, [groupedParticipants]);

  const gveOptions = useMemo(() => {
    const values = new Set();
    groupedParticipants.forEach((group) => {
      if (group.profile.health_region) values.add(group.profile.health_region);
    });
    return Array.from(values)
      .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }))
      .map((value) => ({ value, label: value }));
  }, [groupedParticipants]);

  const totalItems = filteredParticipants.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, courseFilter, municipalityFilter, gveFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedParticipants = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredParticipants.slice(start, start + pageSize);
  }, [filteredParticipants, page, pageSize]);

  const pageRangeLabel = () => {
    if (totalItems === 0) return "0 de 0";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, totalItems);
    return `${start}-${end} de ${totalItems}`;
  };

  const columns = [
    {
      header: "Nome",
      render: (row) => (
        <div className="font-medium">{row.profile.professional_name || "-"}</div>
      ),
    },
    {
      header: "Município",
      render: (row) => row.profile.municipality || "-",
    },
    {
      header: "GVE",
      render: (row) => row.profile.health_region || "-",
    },
    {
      header: "E-mail",
      render: (row) => row.profile.professional_email || "-",
    },
    {
      header: "Celular",
      render: (row) => row.profile.mobile_phone || "-",
    },
    {
      header: "Tipo de Curso",
      render: (row) => {
        if (!row.courseTypes.length) return "-";
        return (
          <div className="flex flex-wrap gap-1">
            {row.courseTypes.map((type) => (
              <Badge key={type} variant="outline">
                {typeLabels[type] || type}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      header: "Ações",
      cellClassName: "text-right",
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/ParticipantProfile?id=${row.id}`);
          }}
        >
          Ver Perfil
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Participantes"
        subtitle="Somente participantes aprovados/concluintes"
      />

      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="flex-1">
          <SearchFilter
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por nome, RG, e-mail, município ou GVE..."
            filters={[
              {
                value: typeFilter,
                onChange: setTypeFilter,
                placeholder: "Tipo de curso",
                allLabel: "Todos os tipos",
                options: [
                  { value: "teorico", label: "Teórico" },
                  { value: "pratico", label: "Prático" },
                  { value: "teorico_pratico", label: "Teórico/Prático" },
                  { value: "repadronizacao", label: "Repadronização" },
                ],
              },
              {
                value: courseFilter,
                onChange: setCourseFilter,
                placeholder: "Curso",
                allLabel: "Todos os cursos",
                options: courseOptions,
              },
              {
                value: municipalityFilter,
                onChange: setMunicipalityFilter,
                placeholder: "Município",
                allLabel: "Todos os municípios",
                options: municipalityOptions,
              },
              {
                value: gveFilter,
                onChange: setGveFilter,
                placeholder: "GVE",
                allLabel: "Todas as GVE",
                options: gveOptions,
              },
            ]}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Exportar Planilha
          </Button>
          <Button
            onClick={() => setShowUpload(true)}
            className="bg-green-600 hover:bg-green-700 flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Importar Planilha
          </Button>
        </div>
      </div>

      {cleanupStatus && (
        <Alert
          className={
            cleanupStatus.type === "error"
              ? "border-amber-200 bg-amber-50"
              : "border-blue-200 bg-blue-50"
          }
        >
          {cleanupStatus.type === "error" ? (
            <AlertCircle className="h-4 w-4 text-amber-700" />
          ) : (
            <CheckCircle className="h-4 w-4 text-blue-700" />
          )}
          <AlertDescription
            className={
              cleanupStatus.type === "error"
                ? "text-amber-800"
                : "text-blue-800"
            }
          >
            {cleanupStatus.message}
          </AlertDescription>
        </Alert>
      )}

      <DataTable
        columns={columns}
        data={paginatedParticipants}
        isLoading={isLoading || loadingTrainings}
        emptyMessage="Nenhum participante aprovado encontrado"
      />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>Itens por página</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-slate-400">({pageRangeLabel()})</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Anterior
          </Button>
          <span className="text-sm text-slate-600">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages}
          >
            Próxima
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Importar Participantes por Planilha
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Faça o download do modelo, preencha com os dados dos participantes e faça o upload aqui.
              </AlertDescription>
            </Alert>
            <Button
              variant="outline"
              onClick={downloadTemplate}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Baixar modelo
            </Button>

            <div className="space-y-2">
              <Label htmlFor="file">Selecione o arquivo (.xlsx, .csv)</Label>
              <Input
                id="file"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
              />
              {uploadFile && (
                <p className="text-sm text-slate-500">
                  Arquivo selecionado: {uploadFile.name}
                </p>
              )}
            </div>

            {uploadStatus && (
              <Alert className={
                uploadStatus.type === "error" ? "border-red-200 bg-red-50" :
                uploadStatus.type === "success" ? "border-green-200 bg-green-50" :
                "border-blue-200 bg-blue-50"
              }>
                {uploadStatus.type === "error" && <AlertCircle className="h-4 w-4 text-red-600" />}
                {uploadStatus.type === "success" && <CheckCircle className="h-4 w-4 text-green-600" />}
                {uploadStatus.type === "loading" && <AlertCircle className="h-4 w-4 text-blue-600" />}
                <AlertDescription className={
                  uploadStatus.type === "error" ? "text-red-800" :
                  uploadStatus.type === "success" ? "text-green-800" :
                  "text-blue-800"
                }>
                  {uploadStatus.message}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowUpload(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!uploadFile || uploadExcel.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {uploadExcel.isPending ? (
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
    </div>
  );
}