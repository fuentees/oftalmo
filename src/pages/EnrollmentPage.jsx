import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { useGveMapping } from "@/hooks/useGveMapping";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
  ArrowLeft,
  BarChart3,
  Building2,
  GraduationCap, 
  CheckCircle,
  AlertCircle,
  Loader2,
  Download,
  Upload,
  FileSpreadsheet,
  Trash2,
  Users,
  Plus,
  SlidersHorizontal,
  Edit,
  MapPin,
  Link2
} from "lucide-react";
import { format } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import SearchFilter from "@/components/common/SearchFilter";
import {
  DEFAULT_ENROLLMENT_FIELDS,
  DEFAULT_ENROLLMENT_SECTIONS,
  getEnrollmentFieldSemantic,
  formatEnrollmentFieldValue,
  formatSectionLabel,
  isValidCpf,
  normalizeParticipantRegionFields,
  orderEnrollmentFields,
  resolveParticipantFieldFromEnrollmentField,
} from "@/lib/enrollmentSchema";

const ENROLLMENT_MAIN_TABS = ["mask", "form", "list", "summary"];

export default function EnrollmentPage({
  allowedTabs = null,
  initialTab = null,
  showBackButton = true,
} = {}) {
  const navigate = useNavigate();
  const queryString =
    window.location.search || window.location.hash.split("?")[1] || "";
  const urlParams = new URLSearchParams(queryString);
  const trainingId = urlParams.get("training");
  const requestedTabRaw = String(urlParams.get("tab") || "")
    .trim()
    .toLowerCase();
  const requestedMainTab = ENROLLMENT_MAIN_TABS.includes(requestedTabRaw)
    ? requestedTabRaw
    : "form";
  const normalizedAllowedTabs = React.useMemo(() => {
    if (!Array.isArray(allowedTabs) || allowedTabs.length === 0) {
      return ENROLLMENT_MAIN_TABS;
    }
    const filtered = allowedTabs
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((value) => ENROLLMENT_MAIN_TABS.includes(value));
    if (!filtered.length) return ENROLLMENT_MAIN_TABS;
    return Array.from(new Set(filtered));
  }, [allowedTabs]);
  const initialTabValue = String(initialTab || requestedMainTab)
    .trim()
    .toLowerCase();
  const resolvedInitialTab = normalizedAllowedTabs.includes(initialTabValue)
    ? initialTabValue
    : normalizedAllowedTabs[0];
  
  const [formData, setFormData] = useState(/** @type {Record<string, any>} */ ({}));
  const [submitted, setSubmitted] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [fieldFormOpen, setFieldFormOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [fieldDeleteConfirm, setFieldDeleteConfirm] = useState(null);
  const [fieldSearch, setFieldSearch] = useState("");
  const [showInactiveFields, setShowInactiveFields] = useState(false);
  const [formErrors, setFormErrors] = useState(/** @type {Record<string, string | null>} */ ({}));
  const [showUploadList, setShowUploadList] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [sectionName, setSectionName] = useState("");
  const [sectionStatus, setSectionStatus] = useState(null);
  const [customSections, setCustomSections] = useState(/** @type {Array<{key: string, label: string}>} */ ([]));
  const [editParticipant, setEditParticipant] = useState(null);
  const [editFormData, setEditFormData] = useState(/** @type {Record<string, any>} */ ({}));
  const [editFormErrors, setEditFormErrors] = useState(/** @type {Record<string, string | null>} */ ({}));
  const [editStatus, setEditStatus] = useState(null);
  const [showEditParticipant, setShowEditParticipant] = useState(false);
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [deleteAllStatus, setDeleteAllStatus] = useState(null);
  const [activeMainTab, setActiveMainTab] = useState(resolvedInitialTab);
  const [summaryStatusFilter, setSummaryStatusFilter] = useState("all");
  const [summaryMunicipalityFilter, setSummaryMunicipalityFilter] = useState("all");
  const [summaryGveFilter, setSummaryGveFilter] = useState("all");
  const [summaryStartDate, setSummaryStartDate] = useState("");
  const [summaryEndDate, setSummaryEndDate] = useState("");
  const [summarySearch, setSummarySearch] = useState("");

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/Trainings");
  };

  const queryClient = useQueryClient();
  const { municipalityOptions, getGveByMunicipio } = useGveMapping();

  React.useEffect(() => {
    setActiveMainTab(resolvedInitialTab);
  }, [resolvedInitialTab, trainingId]);

  const { data: training, isLoading } = useQuery({
    queryKey: ["training", trainingId],
    queryFn: async () => {
      const trainings = await dataClient.entities.Training.list();
      return trainings.find(t => t.id === trainingId);
    },
    enabled: !!trainingId,
  });

  const { data: enrollmentFields = [], isFetched: fieldsFetched } = useQuery({
    queryKey: ["enrollment-fields", trainingId],
    queryFn: async () => {
      const allFields = await dataClient.entities.EnrollmentField.list("order");
      return allFields.filter(f => 
        !f.training_id || f.training_id === trainingId
      );
    },
    enabled: !!trainingId,
  });

  const { data: allParticipants = [], isLoading: participantsLoading } = useQuery({
    queryKey: ["enrolled-participants", trainingId],
    queryFn: () => dataClient.entities.TrainingParticipant.filter({ training_id: trainingId }, "-enrollment_date"),
    enabled: !!trainingId,
  });

  const formatDateSafe = (value, pattern = "dd/MM/yyyy") => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return format(parsed, pattern);
  };

  const trainingDates = Array.isArray(training?.dates) ? training.dates : [];
  const activeEnrollmentFields = enrollmentFields
    .filter((field) => field.is_active)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  React.useEffect(() => {
    if (!trainingId) return;
    setCustomSections([]);
  }, [trainingId]);

  const normalizeHeader = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const normalizeRow = (row) =>
    Object.entries(row || {}).reduce((acc, [key, value]) => {
      const normalizedKey = normalizeHeader(key);
      if (!normalizedKey) return acc;
      acc[normalizedKey] = value;
      const flatKey = normalizedKey.replace(/_/g, "");
      if (flatKey && !(flatKey in acc)) {
        acc[flatKey] = value;
      }
      return acc;
    }, {});

  const fieldAliases = {
    name: ["nome completo", "nome_completo", "nome do participante", "participante"],
    cpf: ["cpf/cnpj", "cpf cnpj", "documento", "documento_cpf"],
    rg: ["r.g", "r_g", "registro geral", "registro_geral"],
    email: ["e-mail", "e mail", "e_mail"],
    professional_formation: ["formacao", "formacao profissional", "formação", "profissao"],
    institution: ["instituicao", "instituição", "instituicao que representa", "orgao", "órgão"],
    state: ["uf"],
    health_region: [
      "regional de saude",
      "regional de saúde",
      "regiao de saude",
      "região de saúde",
      "grupo de vigilancia epidemiologica",
      "grupo de vigilância epidemiológica",
      "gve",
    ],
    municipality: ["municipio", "município", "cidade"],
    unit_name: ["nome unidade", "nome da unidade", "unidade", "unidade de saude", "unidade de saúde"],
    sector: ["setor", "cargo", "funcao", "função"],
    work_address: ["endereco de trabalho", "endereço de trabalho", "endereco trabalho", "endereço trabalho"],
    residential_address: [
      "endereco residencial",
      "endereço residencial",
      "endereco residencia",
      "endereço residencia",
    ],
    commercial_phone: ["telefone comercial", "telefone trabalho", "telefone fixo", "fone"],
    mobile_phone: ["celular", "telefone celular", "telefone móvel", "telefone mobile", "whatsapp"],
  };

  const normalizeText = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const normalizeCpf = (value) => String(value ?? "").replace(/\D/g, "");
  const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();
  const normalizeDateKey = (value) => String(value ?? "").trim().slice(0, 10);
  const isPermissionDeleteError = (error) => {
    const message = String(error?.message || "").toLowerCase();
    return (
      message.includes("permiss") ||
      message.includes("policy") ||
      message.includes("row level security") ||
      message.includes("rls") ||
      message.includes("42501")
    );
  };

  const hasSameTrainingContext = (a, b) => {
    const aTrainingId = String(a?.training_id || "").trim();
    const bTrainingId = String(b?.training_id || "").trim();
    if (aTrainingId && bTrainingId) return aTrainingId === bTrainingId;
    const aTitle = normalizeText(a?.training_title);
    const bTitle = normalizeText(b?.training_title);
    if (aTitle && bTitle) return aTitle === bTitle;
    return !aTrainingId && !bTrainingId;
  };

  const isSameParticipantRecord = (candidate, target) => {
    if (!candidate || !target) return false;
    const candidateId = String(candidate.id || "").trim();
    const targetId = String(target.id || "").trim();
    if (candidateId && targetId && candidateId === targetId) return true;
    if (!hasSameTrainingContext(candidate, target)) return false;

    const candidateCpf = normalizeCpf(candidate.professional_cpf);
    const targetCpf = normalizeCpf(target.professional_cpf);
    if (candidateCpf && targetCpf && candidateCpf === targetCpf) return true;

    const candidateEmail = normalizeEmail(candidate.professional_email);
    const targetEmail = normalizeEmail(target.professional_email);
    const candidateName = normalizeText(candidate.professional_name);
    const targetName = normalizeText(target.professional_name);
    if (
      candidateEmail &&
      targetEmail &&
      candidateEmail === targetEmail &&
      candidateName &&
      targetName &&
      candidateName === targetName
    ) {
      return true;
    }

    const candidateEnrollmentDate = normalizeDateKey(candidate.enrollment_date);
    const targetEnrollmentDate = normalizeDateKey(target.enrollment_date);
    if (
      candidateEnrollmentDate &&
      targetEnrollmentDate &&
      candidateEnrollmentDate === targetEnrollmentDate &&
      candidateName &&
      targetName &&
      candidateName === targetName
    ) {
      return true;
    }

    return false;
  };

  const isLegacyParticipantForCurrentTraining = (participant) => {
    if (!participant) return false;
    if (participant.training_id) return false;
    if (!training?.title) return false;
    if (normalizeText(participant.training_title) !== normalizeText(training.title)) {
      return false;
    }
    const trainingDate = normalizeDateKey(trainingDates?.[0]?.date || training?.date);
    if (!trainingDate) return true;
    const participantDate = normalizeDateKey(participant.training_date);
    return !participantDate || participantDate === trainingDate;
  };

  const resolveParticipantIdForDeletion = async (participant) => {
    const participantId = String(participant?.id || "").trim();
    if (participantId) return participantId;

    let candidates = [];
    if (participant?.training_id) {
      candidates = await dataClient.entities.TrainingParticipant.filter(
        { training_id: participant.training_id },
        "-enrollment_date"
      );
    } else if (trainingId) {
      candidates = await dataClient.entities.TrainingParticipant.filter(
        { training_id: trainingId },
        "-enrollment_date"
      );
    }

    if (candidates.length === 0 && training?.title) {
      const byTitle = await dataClient.entities.TrainingParticipant.filter(
        { training_title: training.title },
        "-enrollment_date"
      );
      candidates = byTitle.filter((item) =>
        isLegacyParticipantForCurrentTraining(item)
      );
    }

    const match = candidates.find((item) =>
      isSameParticipantRecord(item, participant)
    );
    return String(match?.id || "").trim();
  };

  const deleteParticipantRecord = async (participant) => {
    if (!participant) {
      throw new Error("Inscrito inválido para exclusão.");
    }

    const detachParticipantById = async (id) => {
      await dataClient.entities.TrainingParticipant.update(id, {
        training_id: null,
        training_title: null,
        training_date: null,
        enrollment_status: "cancelado",
      });
      return 1;
    };

    const deleteOrDetachById = async (id) => {
      try {
        await dataClient.entities.TrainingParticipant.delete(id);
        return 1;
      } catch (error) {
        if (!isPermissionDeleteError(error)) {
          throw error;
        }
        return detachParticipantById(id);
      }
    };

    const participantId = await resolveParticipantIdForDeletion(participant);
    if (participantId) {
      return deleteOrDetachById(participantId);
    }

    const normalizedCpf = normalizeCpf(participant.professional_cpf);
    if (trainingId && normalizedCpf) {
      const scoped = await dataClient.entities.TrainingParticipant.filter(
        { training_id: trainingId },
        "-enrollment_date"
      );
      const ids = scoped
        .filter(
          (item) => normalizeCpf(item.professional_cpf) === normalizedCpf
        )
        .map((item) => String(item.id || "").trim())
        .filter(Boolean);
      if (ids.length > 0) {
        let removed = 0;
        for (const id of ids) {
          removed += await deleteOrDetachById(id);
        }
        return removed;
      }
    }

    throw new Error("Não foi possível localizar o inscrito para exclusão.");
  };

  const sections = React.useMemo(() => {
    const seen = new Set();
    const list = [];

    DEFAULT_ENROLLMENT_SECTIONS.forEach((section) => {
      if (seen.has(section.key)) return;
      seen.add(section.key);
      list.push(section);
    });

    customSections.forEach((section) => {
      if (!section?.key || seen.has(section.key)) return;
      seen.add(section.key);
      list.push(section);
    });

    enrollmentFields.forEach((field) => {
      const key = field.section;
      if (!key || seen.has(key)) return;
      seen.add(key);
      list.push({ key, label: formatSectionLabel(key) });
    });

    return list;
  }, [customSections, enrollmentFields]);

  const sectionLabels = React.useMemo(
    () =>
      sections.reduce((acc, section) => {
        acc[section.key] = section.label || formatSectionLabel(section.key);
        return acc;
      }, {}),
    [sections]
  );

  const sectionOrder = React.useMemo(
    () => sections.map((section) => section.key),
    [sections]
  );

  const sectionUsage = React.useMemo(() => {
    return enrollmentFields.reduce((acc, field) => {
      const key = field.section || "";
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [enrollmentFields]);

  const handleAddSection = () => {
    const label = sectionName.trim();
    if (!label) {
      setSectionStatus({ type: "error", message: "Informe o nome da seção." });
      return;
    }
    const key = normalizeHeader(label);
    if (!key) {
      setSectionStatus({ type: "error", message: "Nome de seção inválido." });
      return;
    }
    if (sectionLabels[key]) {
      setSectionStatus({ type: "error", message: "Essa seção já existe." });
      return;
    }
    const next = [...customSections, { key, label }];
    setCustomSections(next);
    setSectionName("");
    setSectionStatus({ type: "success", message: "Seção criada com sucesso." });
  };

  const handleRemoveSection = (key) => {
    const isCustom = customSections.some((section) => section.key === key);
    if (!isCustom) return;
    if (sectionUsage[key]) {
      setSectionStatus({
        type: "error",
        message: "Não é possível remover: há campos nesta seção.",
      });
      return;
    }
    const next = customSections.filter((section) => section.key !== key);
    setCustomSections(next);
    setSectionStatus({ type: "success", message: "Seção removida." });
  };

  const getLatestTrainingDate = () => {
    const dates = [
      training?.date,
      ...trainingDates.map((item) => item?.date).filter(Boolean),
    ].filter(Boolean);
    if (dates.length === 0) return null;
    const parsedDates = dates
      .map((date) => new Date(date))
      .filter((date) => !Number.isNaN(date.getTime()));
    if (parsedDates.length === 0) return null;
    return new Date(Math.max(...parsedDates.map((date) => date.getTime())));
  };

  const latestTrainingDate = getLatestTrainingDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isPastTraining =
    latestTrainingDate && latestTrainingDate.getTime() < today.getTime();

  const fixMojibake = (value) => {
    if (typeof value !== "string") return value;
    if (!/[ÃÂ�]/.test(value)) return value;
    try {
      const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    } catch (error) {
      return value;
    }
  };

  const normalizeImportedValue = (value) => {
    if (value === undefined || value === null) return value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return "";
      return fixMojibake(trimmed);
    }
    return value;
  };

  const templateFields =
    activeEnrollmentFields.length > 0 ? activeEnrollmentFields : DEFAULT_ENROLLMENT_FIELDS;
  const orderedTemplateFields = React.useMemo(
    () => orderEnrollmentFields(templateFields),
    [templateFields]
  );

  const municipalityFieldKey = React.useMemo(() => {
    const field = orderedTemplateFields.find(
      (item) => getEnrollmentFieldSemantic(item) === "municipality"
    );
    return String(field?.field_key || "municipality").trim();
  }, [orderedTemplateFields]);

  const gveFieldKey = React.useMemo(() => {
    const field = orderedTemplateFields.find(
      (item) => getEnrollmentFieldSemantic(item) === "gve"
    );
    return String(field?.field_key || "health_region").trim();
  }, [orderedTemplateFields]);

  const getAutoGveByValues = React.useCallback(
    (values) => {
      const municipalityValue = values?.[municipalityFieldKey];
      return getGveByMunicipio(municipalityValue);
    },
    [getGveByMunicipio, municipalityFieldKey]
  );

  const mapEnrollmentDataToParticipantFields = React.useCallback(
    (sourceData = {}) => {
      const mapped = {};

      orderedTemplateFields.forEach((field) => {
        const participantKey = resolveParticipantFieldFromEnrollmentField(field);
        const fieldKey = String(field?.field_key || "").trim();
        if (!participantKey || !fieldKey) return;

        const value = sourceData[fieldKey];
        if (value === undefined || value === null || value === "") return;
        mapped[participantKey] = value;
      });

      const normalizedRegion = normalizeParticipantRegionFields({
        state: mapped.state,
        health_region: mapped.health_region,
        municipality: mapped.municipality,
        getGveByMunicipio,
      });

      return {
        ...mapped,
        ...normalizedRegion,
      };
    },
    [getGveByMunicipio, orderedTemplateFields]
  );

  const getDefaultFieldData = () => ({
    training_id: trainingId,
    field_key: "",
    label: "",
    type: "text",
    required: true,
    placeholder: "",
    section: "pessoais",
    order: 0,
    is_active: true,
  });

  const [fieldFormData, setFieldFormData] = useState(getDefaultFieldData());

  React.useEffect(() => {
    if (!sectionOrder.length) return;
    if (!sectionOrder.includes(fieldFormData.section)) {
      setFieldFormData((prev) => ({
        ...prev,
        section: sectionOrder[0],
      }));
    }
  }, [sectionOrder, fieldFormData.section]);

  const resetFieldForm = () => {
    setFieldFormData(getDefaultFieldData());
    setEditingField(null);
    setFieldFormOpen(false);
  };

  const seedDefaults = useMutation({
    mutationFn: (/** @type {any} */ payload) =>
      dataClient.entities.EnrollmentField.bulkCreate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollment-fields"] });
    },
  });

  React.useEffect(() => {
    if (!trainingId || !fieldsFetched) return;
    if (enrollmentFields.length > 0 || seedDefaults.isPending) return;
    const payload = DEFAULT_ENROLLMENT_FIELDS.map((field) => ({
      ...field,
      training_id: null,
      is_active: true,
    }));
    seedDefaults.mutate(payload);
  }, [trainingId, fieldsFetched, enrollmentFields.length, seedDefaults.isPending]);

  const createField = useMutation({
    mutationFn: (/** @type {any} */ data) =>
      dataClient.entities.EnrollmentField.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollment-fields"] });
      resetFieldForm();
    },
  });

  const updateField = useMutation({
    mutationFn: (/** @type {any} */ payload) =>
      dataClient.entities.EnrollmentField.update(payload.id, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollment-fields"] });
      resetFieldForm();
    },
  });

  const deleteField = useMutation({
    mutationFn: (/** @type {any} */ id) =>
      dataClient.entities.EnrollmentField.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollment-fields"] });
      setFieldDeleteConfirm(null);
    },
  });

  const enrollMutation = useMutation({
    mutationFn: async (/** @type {Record<string, any>} */ data) => {
      const existing = await dataClient.entities.TrainingParticipant.filter({
        training_id: trainingId,
        professional_cpf: data.cpf,
      });

      if (existing && existing.length > 0) {
        throw new Error("CPF já inscrito neste treinamento");
      }

      if (training.max_participants && training.participants_count >= training.max_participants) {
        throw new Error("Treinamento com vagas esgotadas");
      }

      const firstDate = trainingDates.length > 0 ? trainingDates[0].date : null;
      
      const baseDate = firstDate ? new Date(firstDate) : null;
      const validityDate =
        training.validity_months &&
        baseDate &&
        !Number.isNaN(baseDate.getTime())
          ? format(
              new Date(
                baseDate.setMonth(baseDate.getMonth() + training.validity_months)
              ),
              "yyyy-MM-dd"
            )
          : null;

      const mappedParticipantData = mapEnrollmentDataToParticipantFields(data);

      await dataClient.entities.TrainingParticipant.create({
        training_id: trainingId,
        training_title: training.title,
        training_date: firstDate,
        professional_name: mappedParticipantData.professional_name || data.name || "",
        professional_cpf: mappedParticipantData.professional_cpf || data.cpf || "",
        professional_rg: mappedParticipantData.professional_rg || data.rg || "",
        professional_email: mappedParticipantData.professional_email || data.email || "",
        professional_sector: mappedParticipantData.professional_sector || data.sector || "",
        professional_registration:
          mappedParticipantData.professional_registration || data.registration || "",
        professional_formation:
          mappedParticipantData.professional_formation || data.professional_formation || "",
        institution: mappedParticipantData.institution || data.institution || "",
        state: mappedParticipantData.state || data.state || "",
        health_region: mappedParticipantData.health_region || data.health_region || "",
        municipality: mappedParticipantData.municipality || data.municipality || "",
        unit_name: mappedParticipantData.unit_name || data.unit_name || "",
        position: mappedParticipantData.position || data.position || "",
        work_address: mappedParticipantData.work_address || data.work_address || "",
        residential_address:
          mappedParticipantData.residential_address || data.residential_address || "",
        commercial_phone:
          mappedParticipantData.commercial_phone || data.commercial_phone || "",
        mobile_phone: mappedParticipantData.mobile_phone || data.mobile_phone || "",
        enrollment_status: "inscrito",
        enrollment_date: new Date().toISOString(),
        attendance_records: [],
        attendance_percentage: 0,
        approved: false,
        certificate_issued: false,
        validity_date: validityDate,
      });

      await dataClient.entities.Training.update(trainingId, {
        participants_count: (training.participants_count || 0) + 1,
      });
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["enrolled-participants"] });
      queryClient.invalidateQueries({ queryKey: ["training"] });
    },
  });

  const deleteParticipant = useMutation({
    mutationFn: async (/** @type {any} */ participant) => {
      if (!participant) {
        throw new Error("Inscrito inválido para exclusão.");
      }

      const removedCount = await deleteParticipantRecord(participant);
      if (removedCount <= 0) {
        throw new Error("Nenhum inscrito foi removido.");
      }

      let warningMessage = null;
      try {
        const remainingParticipants = await dataClient.entities.TrainingParticipant.filter(
          { training_id: trainingId }
        );
        await dataClient.entities.Training.update(trainingId, {
          participants_count: remainingParticipants.length,
        });
      } catch {
        warningMessage =
          "Inscrito removido, mas não foi possível atualizar o contador automaticamente.";
      }

      return { warningMessage };
    },
    onSuccess: ({ warningMessage }) => {
      queryClient.invalidateQueries({ queryKey: ["enrolled-participants"] });
      queryClient.invalidateQueries({ queryKey: ["participants"] });
      queryClient.invalidateQueries({ queryKey: ["training"] });
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      setDeleteConfirm(null);
      setDeleteAllStatus(
        warningMessage
          ? { type: "warning", message: warningMessage }
          : { type: "success", message: "Inscrito excluído com sucesso." }
      );
    },
    onError: (error) => {
      setDeleteAllStatus({
        type: "error",
        message: error?.message || "Não foi possível excluir o inscrito.",
      });
    },
  });

  const deleteAllParticipants = useMutation({
    mutationFn: async () => {
      if (!trainingId) {
        throw new Error("Treinamento inválido para exclusão em massa.");
      }

      const participantsByTrainingId =
        await dataClient.entities.TrainingParticipant.filter({
          training_id: trainingId,
        });
      let legacyParticipants = [];
      if (training?.title) {
        const byTitle = await dataClient.entities.TrainingParticipant.filter(
          { training_title: training.title },
          "-enrollment_date"
        );
        legacyParticipants = byTitle.filter((item) =>
          isLegacyParticipantForCurrentTraining(item)
        );
      }

      const participantsBefore = [
        ...participantsByTrainingId,
        ...legacyParticipants.filter((item) => {
          const id = String(item.id || "").trim();
          if (!id) return true;
          return !participantsByTrainingId.some(
            (base) => String(base.id || "").trim() === id
          );
        }),
      ];

      const expectedCount = participantsBefore.length;
      if (expectedCount === 0) {
        return {
          warningMessage: null,
          deletedCount: 0,
        };
      }

      const seenKeys = new Set();
      const participantsToRemove = participantsBefore.filter((item) => {
        const id = String(item?.id || "").trim();
        const key = id
          ? `id:${id}`
          : `legacy:${normalizeCpf(item?.professional_cpf)}|${normalizeEmail(
              item?.professional_email
            )}|${normalizeText(item?.professional_name)}|${normalizeDateKey(
              item?.enrollment_date
            )}`;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });

      let removedCount = 0;
      for (const participant of participantsToRemove) {
        removedCount += await deleteParticipantRecord(participant);
      }

      let remainingParticipants =
        await dataClient.entities.TrainingParticipant.filter({
          training_id: trainingId,
        });
      let remainingLegacyParticipants = [];
      if (training?.title) {
        const byTitleAfterDelete = await dataClient.entities.TrainingParticipant.filter(
          { training_title: training.title },
          "-enrollment_date"
        );
        remainingLegacyParticipants = byTitleAfterDelete.filter((item) =>
          isLegacyParticipantForCurrentTraining(item)
        );
      }

      if (remainingParticipants.length > 0 || remainingLegacyParticipants.length > 0) {
        throw new Error(
          "Não foi possível excluir todos os inscritos. Tente novamente."
        );
      }

      let warningMessage = null;
      try {
        await dataClient.entities.Training.update(trainingId, {
          participants_count: 0,
        });
      } catch {
        warningMessage =
          "Inscritos removidos, mas não foi possível atualizar o contador automaticamente.";
      }

      return { warningMessage, deletedCount: removedCount || expectedCount };
    },
    onSuccess: ({ warningMessage, deletedCount }) => {
      queryClient.setQueryData(["enrolled-participants", trainingId], []);
      queryClient.invalidateQueries({ queryKey: ["enrolled-participants"] });
      queryClient.invalidateQueries({ queryKey: ["participants"] });
      queryClient.invalidateQueries({ queryKey: ["training"] });
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      setDeleteAllConfirmOpen(false);
      setDeleteAllStatus(
        warningMessage
          ? { type: "warning", message: warningMessage }
          : {
              type: "success",
              message:
                deletedCount > 0
                  ? `${deletedCount} inscrito(s) excluído(s) com sucesso.`
                  : "Não havia inscritos para excluir.",
            }
      );
    },
    onError: (error) => {
      setDeleteAllStatus({
        type: "error",
        message: error?.message || "Não foi possível excluir todos os inscritos.",
      });
    },
  });

  const updateParticipant = useMutation({
    mutationFn: async (/** @type {{ id: string, data: Record<string, any> }} */ payload) =>
      dataClient.entities.TrainingParticipant.update(payload.id, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrolled-participants"] });
      queryClient.invalidateQueries({ queryKey: ["training"] });
      setEditStatus({
        type: "success",
        message: "Inscrito atualizado com sucesso.",
      });
      setTimeout(() => {
        setShowEditParticipant(false);
        setEditParticipant(null);
        setEditFormData({});
        setEditFormErrors({});
        setEditStatus(null);
      }, 1200);
    },
    onError: (error) => {
      setEditStatus({
        type: "error",
        message: error.message || "Erro ao atualizar inscrito.",
      });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const errors = /** @type {Record<string, string | null>} */ ({});
    activeEnrollmentFields.forEach((field) => {
      const rawValue = formData[field.field_key];
      const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;

      if (field.required && !value) {
        errors[field.field_key] = "Campo obrigatório.";
        return;
      }

      if (!value) return;

      const lowerKey = field.field_key.toLowerCase();
      const digits = String(value).replace(/\D/g, "");
      if (lowerKey.includes("cpf")) {
        if (!isValidCpf(value)) {
          errors[field.field_key] = "CPF inválido.";
        }
        return;
      }

      if (lowerKey.includes("rg")) {
        if (digits.length < 5 || digits.length > 12) {
          errors[field.field_key] = "RG inválido.";
        }
        return;
      }

      if (field.type === "email" || lowerKey.includes("email")) {
        const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
        if (!isValidEmail) {
          errors[field.field_key] = "E-mail inválido.";
        }
        return;
      }

      if (field.type === "tel" || lowerKey.includes("phone") || lowerKey.includes("celular")) {
        if (digits.length < 10 || digits.length > 11) {
          errors[field.field_key] = "Telefone inválido.";
        }
      }
    });

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    const normalizedFormData = { ...formData };
    activeEnrollmentFields.forEach((field) => {
      const rawValue = formData[field.field_key];
      if (rawValue === undefined || rawValue === null) return;
      if (typeof rawValue !== "string") {
        normalizedFormData[field.field_key] = rawValue;
        return;
      }
      const trimmed = rawValue.trim();
      normalizedFormData[field.field_key] = trimmed
        ? formatEnrollmentFieldValue(field, trimmed)
        : "";
    });

    const autoGve = getAutoGveByValues(normalizedFormData);
    if (autoGve && gveFieldKey && !normalizedFormData[gveFieldKey]) {
      normalizedFormData[gveFieldKey] = autoGve;
    }
    enrollMutation.mutate(normalizedFormData);
  };

  const handleCopyEnrollmentLink = () => {
    if (!trainingId) return;
    const link = `${window.location.origin}/PublicEnrollment?training=${encodeURIComponent(trainingId)}`;
    navigator.clipboard.writeText(link);
    alert("Link de inscrição copiado!");
  };

  const handleEditField = (field) => {
    setEditingField(field);
    setFieldFormData({
      ...field,
      training_id: field.training_id ?? null,
      order: field.order ?? 0,
    });
    setFieldFormOpen(true);
  };

  const handleSaveField = (e) => {
    e.preventDefault();
    const payload = {
      ...fieldFormData,
      training_id: fieldFormData.training_id || null,
      order: Number(fieldFormData.order) || 0,
    };
    if (editingField) {
      updateField.mutate({ id: editingField.id, data: payload });
    } else {
      createField.mutate(payload);
    }
  };

  const handleAddDefaultFields = () => {
    const existingKeys = new Set(enrollmentFields.map((field) => field.field_key));
    const payload = DEFAULT_ENROLLMENT_FIELDS
      .filter((field) => !existingKeys.has(field.field_key))
      .map((field) => ({
        ...field,
        training_id: null,
        is_active: true,
      }));

    if (payload.length === 0) {
      alert("Todos os campos padrão já existem.");
      return;
    }

    seedDefaults.mutate(payload);
  };

  const handleExportExcel = () => {
    const headers = [
      "Nome", "CPF", "RG", "Email", "Setor", "Matrícula", "Formação Profissional",
      "Instituição", "Estado", "GVE", "Município", "Nome da Unidade", "Cargo",
      "Endereço de Trabalho", "Endereço Residencial", "Telefone Comercial", "Celular",
      "Data de Inscrição", "Status"
    ];

    const rows = filteredParticipants.map(p => [
      p.professional_name || "",
      p.professional_cpf || "",
      p.professional_rg || "",
      p.professional_email || "",
      p.professional_sector || "",
      p.professional_registration || "",
      p.professional_formation || "",
      p.institution || "",
      p.state || "",
      p.health_region || "",
      p.municipality || "",
      p.unit_name || "",
      p.position || "",
      p.work_address || "",
      p.residential_address || "",
      p.commercial_phone || "",
      p.mobile_phone || "",
      p.enrollment_date ? format(new Date(p.enrollment_date), "dd/MM/yyyy HH:mm") : "",
      p.enrollment_status || ""
    ]);

    let csv = headers.join(",") + "\n";
    rows.forEach(row => {
      csv += row.map(cell => `"${cell}"`).join(",") + "\n";
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `inscricoes_${training?.title || 'treinamento'}_${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.click();
  };

  const handleDownloadTemplate = () => {
    const headers = orderedTemplateFields.map(
      (field) => field.label || field.field_key
    );
    const csv = `${headers.map((header) => `"${header}"`).join(";")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `modelo_inscritos_${training?.title || "treinamento"}.csv`
    );
    link.click();
  };

  const importParticipants = useMutation({
    mutationFn: async (/** @type {File} */ file) => {
      if (!file) throw new Error("Selecione um arquivo.");
      setUploadStatus({ type: "loading", message: "Processando planilha..." });

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

    const fieldKeyMap = orderedTemplateFields.reduce((acc, field) => {
        const aliases = fieldAliases[field.field_key] || [];
        const keys = [
          normalizeHeader(field.field_key),
          normalizeHeader(field.label),
          ...aliases.map((alias) => normalizeHeader(alias)),
        ].filter(Boolean);
        acc[field.field_key] = Array.from(new Set(keys));
        return acc;
      }, {});

      const availableKeys = new Set();
      if (rows.length > 0) {
        const sampleRow = normalizeRow(rows[0]);
        Object.keys(sampleRow).forEach((key) => availableKeys.add(key));
      }

    const requiredFields = orderedTemplateFields.filter((field) => {
        if (!field.required) return false;
        if (field.field_key === "name") return true;
        const keys = fieldKeyMap[field.field_key] || [];
        return keys.some((key) => availableKeys.has(key));
      });

      const firstDate = trainingDates.length > 0 ? trainingDates[0].date : null;
      const baseDate = firstDate ? new Date(firstDate) : null;
      const validityDate =
        training.validity_months &&
        baseDate &&
        !Number.isNaN(baseDate.getTime())
          ? format(
              new Date(
                baseDate.setMonth(baseDate.getMonth() + training.validity_months)
              ),
              "yyyy-MM-dd"
            )
          : null;

      const payloads = [];
      const skipped = [];

      rows.forEach((row, index) => {
        const normalizedRow = normalizeRow(row);
        const data = {};

      orderedTemplateFields.forEach((field) => {
          const keys = fieldKeyMap[field.field_key] || [];
          const value = keys.reduce((acc, key) => {
            if (acc !== null && acc !== undefined && acc !== "") return acc;
            const candidate = normalizedRow[key];
            if (candidate === undefined || candidate === null || candidate === "") {
              return acc;
            }
            return candidate;
          }, null);
          if (value !== null && value !== undefined && value !== "") {
            const cleanedValue = normalizeImportedValue(value);
            const formattedValue = formatEnrollmentFieldValue(field, cleanedValue);
            data[field.field_key] = formattedValue;
          }
        });

        const municipalityValue = data[municipalityFieldKey];
        if (gveFieldKey && !data[gveFieldKey] && municipalityValue) {
          const gveValue = getGveByMunicipio(municipalityValue);
          if (gveValue) {
            data[gveFieldKey] = gveValue;
          }
        }

        const missingRequired = requiredFields.filter(
          (field) => !data[field.field_key]
        );

        if (missingRequired.length > 0) {
          skipped.push(index + 2);
          return;
        }

        const mappedParticipantData = mapEnrollmentDataToParticipantFields(data);

        payloads.push({
          training_id: trainingId,
          training_title: training.title,
          training_date: firstDate,
          professional_name:
            mappedParticipantData.professional_name || data.name || "",
          professional_cpf: mappedParticipantData.professional_cpf || data.cpf || "",
          professional_rg: mappedParticipantData.professional_rg || data.rg || "",
          professional_email:
            mappedParticipantData.professional_email || data.email || "",
          professional_sector:
            mappedParticipantData.professional_sector || data.sector || "",
          professional_registration:
            mappedParticipantData.professional_registration || data.registration || "",
          professional_formation:
            mappedParticipantData.professional_formation ||
            data.professional_formation ||
            "",
          institution: mappedParticipantData.institution || data.institution || "",
          state: mappedParticipantData.state || data.state || "",
          health_region:
            mappedParticipantData.health_region || data.health_region || "",
          municipality: mappedParticipantData.municipality || data.municipality || "",
          unit_name: mappedParticipantData.unit_name || data.unit_name || "",
          position: mappedParticipantData.position || data.position || "",
          work_address: mappedParticipantData.work_address || data.work_address || "",
          residential_address:
            mappedParticipantData.residential_address ||
            data.residential_address ||
            "",
          commercial_phone:
            mappedParticipantData.commercial_phone || data.commercial_phone || "",
          mobile_phone: mappedParticipantData.mobile_phone || data.mobile_phone || "",
          enrollment_status: "inscrito",
          enrollment_date: new Date().toISOString(),
          attendance_records: [],
          attendance_percentage: 0,
          approved: false,
          certificate_issued: false,
          validity_date: validityDate,
        });
      });

      if (payloads.length === 0) {
        const requiredLabels = requiredFields
          .map((field) => field.label || field.field_key)
          .filter(Boolean);
        if (requiredLabels.length > 0) {
          throw new Error(
            `Nenhuma linha válida encontrada. Verifique as colunas obrigatórias: ${requiredLabels.join(
              ", "
            )}.`
          );
        }
        throw new Error("Nenhuma linha válida encontrada.");
      }

      await dataClient.entities.TrainingParticipant.bulkCreate(payloads);
      await dataClient.entities.Training.update(trainingId, {
        participants_count: (training.participants_count || 0) + payloads.length,
      });

      setUploadStatus({
        type: "success",
        message: `${payloads.length} participante(s) importado(s).${
          skipped.length ? ` ${skipped.length} linha(s) ignoradas.` : ""
        }`,
      });

      return { payloads, skipped };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrolled-participants"] });
      queryClient.invalidateQueries({ queryKey: ["training"] });
      setTimeout(() => {
        setShowUploadList(false);
        setUploadFile(null);
        setUploadStatus(null);
      }, 2000);
    },
    onError: (error) => {
      setUploadStatus({
        type: "error",
        message: error.message || "Erro ao importar participantes.",
      });
    },
  });

  const handleUploadFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setUploadStatus(null);
    }
  };

  const handleUploadParticipants = () => {
    if (uploadFile) {
      importParticipants.mutate(uploadFile);
    }
  };

  const handleEditParticipant = (participant) => {
    if (!participant) return;
    const data = {};
    orderedTemplateFields.forEach((field) => {
      const participantKey = resolveParticipantFieldFromEnrollmentField(field);
      const rawValue = participantKey ? participant[participantKey] : participant[field.field_key];
      if (rawValue !== undefined && rawValue !== null) {
        data[field.field_key] = normalizeImportedValue(rawValue);
      }
    });
    setEditParticipant(participant);
    setEditFormData(data);
    setEditFormErrors({});
    setEditStatus(null);
    setShowEditParticipant(true);
  };

  const handleSaveParticipant = () => {
    if (!editParticipant) return;
    setEditFormErrors({});

    const payload = {};
    orderedTemplateFields.forEach((field) => {
      const participantKey = resolveParticipantFieldFromEnrollmentField(field);
      if (!participantKey) return;
      const rawValue = editFormData[field.field_key];
      const cleanedValue = normalizeImportedValue(rawValue);
      const formattedValue =
        cleanedValue !== null && cleanedValue !== undefined && cleanedValue !== ""
          ? formatEnrollmentFieldValue(field, cleanedValue)
          : cleanedValue;
      payload[participantKey] =
        formattedValue !== undefined && formattedValue !== "" ? formattedValue : null;
    });

    const hasRegionField = ["state", "health_region", "municipality"].some((key) =>
      Object.prototype.hasOwnProperty.call(payload, key)
    );
    if (hasRegionField) {
      const normalizedRegion = normalizeParticipantRegionFields({
        state: payload.state,
        health_region: payload.health_region,
        municipality: payload.municipality,
        getGveByMunicipio,
      });
      if (Object.prototype.hasOwnProperty.call(payload, "state")) {
        payload.state = normalizedRegion.state || null;
      }
      if (Object.prototype.hasOwnProperty.call(payload, "health_region")) {
        payload.health_region = normalizedRegion.health_region || null;
      }
      if (Object.prototype.hasOwnProperty.call(payload, "municipality")) {
        payload.municipality = normalizedRegion.municipality || null;
      }
    }

    updateParticipant.mutate({ id: editParticipant.id, data: payload });
  };

  const filteredParticipants = allParticipants.filter(p => 
    p.professional_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.professional_cpf?.toLowerCase().includes(search.toLowerCase()) ||
    p.professional_email?.toLowerCase().includes(search.toLowerCase())
  );

  const summaryMunicipalityOptions = React.useMemo(() => {
    const values = Array.from(
      new Set(
        (allParticipants || [])
          .map((item) => String(item?.municipality || "").trim())
          .filter(Boolean)
      )
    );
    return values.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  }, [allParticipants]);

  const summaryGveOptions = React.useMemo(() => {
    const values = Array.from(
      new Set(
        (allParticipants || [])
          .map((item) => String(item?.health_region || "").trim())
          .filter(Boolean)
      )
    );
    return values.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  }, [allParticipants]);

  const summaryFilteredParticipants = React.useMemo(() => {
    const startDate = summaryStartDate ? new Date(summaryStartDate) : null;
    const endDate = summaryEndDate ? new Date(summaryEndDate) : null;
    if (startDate) startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(23, 59, 59, 999);

    return (allParticipants || []).filter((participant) => {
      const status = String(participant?.enrollment_status || "").trim().toLowerCase();
      if (summaryStatusFilter !== "all" && status !== summaryStatusFilter) return false;

      const municipality = String(participant?.municipality || "").trim();
      if (summaryMunicipalityFilter !== "all" && municipality !== summaryMunicipalityFilter) {
        return false;
      }

      const gve = String(participant?.health_region || "").trim();
      if (summaryGveFilter !== "all" && gve !== summaryGveFilter) return false;

      if (startDate || endDate) {
        const enrollmentDate = new Date(participant?.enrollment_date || "");
        if (Number.isNaN(enrollmentDate.getTime())) return false;
        if (startDate && enrollmentDate < startDate) return false;
        if (endDate && enrollmentDate > endDate) return false;
      }

      if (summarySearch.trim()) {
        const haystack = normalizeText(
          [
            participant?.professional_name,
            participant?.professional_email,
            participant?.professional_cpf,
            participant?.municipality,
            participant?.health_region,
          ]
            .filter(Boolean)
            .join(" ")
        );
        if (!haystack.includes(normalizeText(summarySearch))) return false;
      }

      return true;
    });
  }, [
    allParticipants,
    summaryStatusFilter,
    summaryMunicipalityFilter,
    summaryGveFilter,
    summaryStartDate,
    summaryEndDate,
    summarySearch,
  ]);

  const groupedSummaryByGve = React.useMemo(() => {
    const counter = {};
    summaryFilteredParticipants.forEach((participant) => {
      const key = String(participant?.health_region || "").trim() || "Não informado";
      counter[key] = (counter[key] || 0) + 1;
    });
    return Object.entries(counter)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [summaryFilteredParticipants]);

  const groupedSummaryByMunicipality = React.useMemo(() => {
    const counter = {};
    summaryFilteredParticipants.forEach((participant) => {
      const key = String(participant?.municipality || "").trim() || "Não informado";
      counter[key] = (counter[key] || 0) + 1;
    });
    return Object.entries(counter)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [summaryFilteredParticipants]);

  const summaryStatusTotals = React.useMemo(() => {
    return summaryFilteredParticipants.reduce(
      (acc, participant) => {
        const status = String(participant?.enrollment_status || "").trim().toLowerCase();
        if (status === "confirmado") acc.confirmed += 1;
        else if (status === "cancelado") acc.cancelled += 1;
        else acc.pending += 1;
        return acc;
      },
      { confirmed: 0, pending: 0, cancelled: 0 }
    );
  }, [summaryFilteredParticipants]);

  const topGve = groupedSummaryByGve[0] || null;
  const topMunicipality = groupedSummaryByMunicipality[0] || null;
  const summaryGveChartData = groupedSummaryByGve.slice(0, 10);
  const summaryMunicipalityChartData = groupedSummaryByMunicipality.slice(0, 10);

  const summaryGveColumns = [
    {
      header: "GVE",
      accessor: "name",
      cellClassName: "font-medium",
    },
    {
      header: "Total de inscritos",
      accessor: "total",
      sortType: "number",
    },
  ];

  const columns = [
    {
      header: "Data/Hora Inscrição",
      accessor: "enrollment_date",
      sortType: "date",
      render: (row) =>
        formatDateSafe(row.enrollment_date, "dd/MM/yyyy HH:mm") || "-",
    },
    {
      header: "Nome",
      accessor: "professional_name",
      cellClassName: "font-medium",
    },
    {
      header: "Município",
      accessor: "municipality",
    },
    {
      header: "GVE",
      accessor: "health_region",
    },
    {
      header: "Formação",
      accessor: "professional_formation",
    },
    {
      header: "Ações",
      cellClassName: "text-right",
      sortable: false,
      render: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleEditParticipant(row)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteConfirm(row)}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (!trainingId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                Link de inscrição inválido. Entre em contato com o administrador.
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
              <h2 className="text-2xl font-bold text-slate-900">Inscrição Realizada!</h2>
              <p className="text-slate-600 mt-2">
                Sua inscrição foi confirmada com sucesso.
              </p>
            </div>
            <Button onClick={() => setSubmitted(false)} variant="outline">
              Nova Inscrição
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isFullyBooked = training.max_participants && training.participants_count >= training.max_participants;
  const isCancelled = training.status === "cancelado";
  const isFieldGlobal = fieldFormData.training_id == null;

  const typeLabels = {
    text: "Texto",
    email: "E-mail",
    tel: "Telefone",
    number: "Número",
    date: "Data",
  };

  const fieldColumns = [
    {
      header: "Ordem",
      accessor: "order",
      cellClassName: "font-mono text-center",
    },
    {
      header: "Campo",
      accessor: "label",
      cellClassName: "font-medium",
      render: (row) => (
        <div>
          <p className="font-medium">{row.label}</p>
          <p className="text-xs text-slate-500">{row.field_key}</p>
        </div>
      ),
    },
    {
      header: "Seção",
      render: (row) => (
        <Badge variant="outline">
          {sectionLabels[row.section] || formatSectionLabel(row.section)}
        </Badge>
      ),
    },
    {
      header: "Tipo",
      render: (row) => typeLabels[row.type],
    },
    {
      header: "Obrigatório",
      cellClassName: "text-center",
      render: (row) => (row.required ? "✓" : "-"),
    },
    {
      header: "Status",
      render: (row) => (
        <Badge className={row.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700"}>
          {row.is_active ? "Ativo" : "Inativo"}
        </Badge>
      ),
    },
    {
      header: "Ações",
      cellClassName: "text-right",
      sortable: false,
      render: (row) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => handleEditField(row)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFieldDeleteConfirm(row)}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const sectionColumns = [
    {
      header: "Seção",
      render: (row) => (
        <div className="font-medium">
          {row.label || formatSectionLabel(row.key)}
        </div>
      ),
    },
    {
      header: "Chave",
      render: (row) => (
        <span className="text-xs font-mono text-slate-500">{row.key}</span>
      ),
    },
    {
      header: "Campos",
      render: (row) => sectionUsage[row.key] || 0,
      cellClassName: "text-center",
    },
    {
      header: "Ações",
      cellClassName: "text-right",
      sortable: false,
      render: (row) => {
        const isCustom = customSections.some((section) => section.key === row.key);
        if (!isCustom) {
          return <span className="text-xs text-slate-400">Padrão</span>;
        }
        const isDisabled = (sectionUsage[row.key] || 0) > 0;
        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleRemoveSection(row.key)}
            disabled={isDisabled}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        );
      },
    },
  ];

  const filteredFields = enrollmentFields.filter((field) => {
    if (!showInactiveFields && !field.is_active) return false;
    if (!fieldSearch) return true;
    const searchTerm = fieldSearch.toLowerCase();
    return (
      field.label?.toLowerCase().includes(searchTerm) ||
      field.field_key?.toLowerCase().includes(searchTerm) ||
      field.section?.toLowerCase().includes(searchTerm)
    );
  });

  const orderedFields = [...filteredFields].sort((a, b) => {
    const orderDiff = (a.order ?? 0) - (b.order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return (a.label || "").localeCompare(b.label || "");
  });

  const fieldsBySection = sectionOrder.reduce((acc, section) => {
    acc[section] = orderedTemplateFields.filter((field) => field.section === section);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {showBackButton && (
        <div>
          <Button variant="ghost" size="sm" onClick={handleGoBack} className="-ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
        </div>
      )}
      <PageHeader
        title={`Inscrições - ${training.title}`}
        subtitle="Gerencie as inscrições do treinamento"
      />

      <Card>
        <CardHeader className="bg-blue-600 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-2xl">{training.title}</CardTitle>
              <p className="text-blue-100 text-sm mt-1">
                {trainingDates.length > 0 && formatDateSafe(trainingDates[0].date)}
                {training.location && ` • ${training.location}`}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <Tabs
            value={activeMainTab}
            onValueChange={setActiveMainTab}
            className="w-full"
          >
            {normalizedAllowedTabs.length > 1 && (
              <TabsList
                className="grid w-full"
                style={{
                  gridTemplateColumns: `repeat(${normalizedAllowedTabs.length}, minmax(0, 1fr))`,
                }}
              >
                {normalizedAllowedTabs.includes("mask") && (
                  <TabsTrigger value="mask">
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Máscara
                  </TabsTrigger>
                )}
                {normalizedAllowedTabs.includes("form") && (
                  <TabsTrigger value="form">
                    <GraduationCap className="h-4 w-4 mr-2" />
                    Formulário de Inscrição
                  </TabsTrigger>
                )}
                {normalizedAllowedTabs.includes("list") && (
                  <TabsTrigger value="list">
                    <Users className="h-4 w-4 mr-2" />
                    Inscritos ({allParticipants.length})
                  </TabsTrigger>
                )}
                {normalizedAllowedTabs.includes("summary") && (
                  <TabsTrigger value="summary">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Resumo
                  </TabsTrigger>
                )}
              </TabsList>
            )}

            {normalizedAllowedTabs.includes("mask") && (
              <TabsContent value="mask" className="mt-6 space-y-6">
              <Tabs defaultValue="fields" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="fields">Campos</TabsTrigger>
                  <TabsTrigger value="sections">Seções</TabsTrigger>
                </TabsList>

                <TabsContent value="fields" className="mt-6 space-y-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="outline" onClick={handleCopyEnrollmentLink}>
                      <Link2 className="h-4 w-4 mr-2" />
                      Copiar Link de Inscrição
                    </Button>
                    <Button variant="outline" onClick={handleAddDefaultFields}>
                      <Plus className="h-4 w-4 mr-2" />
                      Aplicar Campos Padrão
                    </Button>
                    <Button
                      onClick={() => {
                        setEditingField(null);
                        setFieldFormData(getDefaultFieldData());
                        setFieldFormOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Novo Campo do Formulário
                    </Button>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Campos do Formulário</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
                        <Input
                          placeholder="Buscar campo..."
                          value={fieldSearch}
                          onChange={(e) => setFieldSearch(e.target.value)}
                        />
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="show-inactive-fields"
                            checked={showInactiveFields}
                            onCheckedChange={(checked) => setShowInactiveFields(Boolean(checked))}
                          />
                          <Label htmlFor="show-inactive-fields" className="text-sm font-normal">
                            Mostrar inativos
                          </Label>
                        </div>
                      </div>
                      <DataTable
                        columns={fieldColumns}
                        data={orderedFields}
                        emptyMessage="Nenhum campo cadastrado"
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="sections" className="mt-6 space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Seções do Formulário</CardTitle>
                      <p className="text-sm text-slate-500">
                        Crie novas seções para organizar os campos como desejar.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <Input
                          placeholder="Nome da seção"
                          value={sectionName}
                          onChange={(e) => setSectionName(e.target.value)}
                        />
                        <Button type="button" onClick={handleAddSection}>
                          <Plus className="h-4 w-4 mr-2" />
                          Adicionar
                        </Button>
                      </div>
                      {sectionStatus && (
                        <Alert
                          className={
                            sectionStatus.type === "error"
                              ? "border-red-200 bg-red-50"
                              : "border-green-200 bg-green-50"
                          }
                        >
                          <AlertDescription
                            className={
                              sectionStatus.type === "error"
                                ? "text-red-800"
                                : "text-green-800"
                            }
                          >
                            {sectionStatus.message}
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Seções cadastradas</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <DataTable
                        columns={sectionColumns}
                        data={sections}
                        emptyMessage="Nenhuma seção cadastrada"
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
              </TabsContent>
            )}

            {normalizedAllowedTabs.includes("form") && (
              <TabsContent value="form" className="mt-6 space-y-6">
              {(isFullyBooked || isCancelled) && (
                <Alert className="border-red-200 bg-red-50 mb-6">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    {isCancelled ? "Este treinamento foi cancelado." : "Vagas esgotadas para este treinamento."}
                  </AlertDescription>
                </Alert>
              )}

              {enrollMutation.isError && (
                <Alert className="border-red-200 bg-red-50 mb-6">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    {enrollMutation.error.message}
                  </AlertDescription>
                </Alert>
              )}

              {!isFullyBooked && !isCancelled && (
                <form onSubmit={handleSubmit} className="space-y-6">
                  {municipalityOptions.length > 0 && (
                    <datalist id="municipios-list">
                      {municipalityOptions.map((municipio) => (
                        <option key={municipio} value={municipio} />
                      ))}
                    </datalist>
                  )}
                  <div className="space-y-8">
                    {sectionOrder.map((section, index) => {
                      const sectionFields = fieldsBySection[section];
                      return (
                        <div key={section} className="space-y-4">
                          {index > 0 && <div className="border-t border-slate-200" />}
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold text-slate-900">
                              {sectionLabels[section] || formatSectionLabel(section)}
                            </h3>
                            {sectionFields.length > 0 && (
                              <span className="text-xs text-slate-500">
                                ({sectionFields.length})
                              </span>
                            )}
                          </div>
                          {sectionFields.length === 0 ? (
                            <p className="text-sm text-slate-500">
                              Nenhum campo configurado para esta seção.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {sectionFields.map((field) => {
                                const fieldKey = field.field_key || "";
                                const fieldSemantic = getEnrollmentFieldSemantic(field);
                                const isMunicipalityField = fieldSemantic === "municipality";
                                const isGveField = fieldSemantic === "gve";
                                const resolvedGve = getAutoGveByValues(formData);
                                const fieldValue =
                                  isGveField && resolvedGve ? resolvedGve : (formData[fieldKey] || "");

                                return (
                                  <div key={field.id} className="space-y-2">
                                    <Label htmlFor={fieldKey}>
                                      {field.label} {field.required && "*"}
                                    </Label>
                                    <Input
                                      id={fieldKey}
                                      type={field.type}
                                      value={fieldValue}
                                      list={
                                        isMunicipalityField && municipalityOptions.length > 0
                                          ? "municipios-list"
                                          : undefined
                                      }
                                      readOnly={isGveField && Boolean(resolvedGve)}
                                      onChange={(e) => {
                                        const nextValue = formatEnrollmentFieldValue(field, e.target.value, {
                                          liveInput: true,
                                        });
                                        if (isMunicipalityField) {
                                          const gveValue = getGveByMunicipio(nextValue);
                                          setFormData((prev) => {
                                            const next = {
                                              ...prev,
                                              [fieldKey]: nextValue,
                                            };
                                            if (gveFieldKey) {
                                              next[gveFieldKey] = gveValue || prev[gveFieldKey];
                                            }
                                            return next;
                                          });
                                          if (formErrors[fieldKey]) {
                                            setFormErrors((prev) => ({ ...prev, [fieldKey]: null }));
                                          }
                                          if (gveValue && gveFieldKey && formErrors[gveFieldKey]) {
                                            setFormErrors((prev) => ({
                                              ...prev,
                                              [gveFieldKey]: null,
                                            }));
                                          }
                                          return;
                                        }

                                        setFormData((prev) => ({ ...prev, [fieldKey]: nextValue }));
                                        if (formErrors[fieldKey]) {
                                          setFormErrors((prev) => ({ ...prev, [fieldKey]: null }));
                                        }
                                      }}
                                      placeholder={field.placeholder}
                                      required={field.required}
                                    />
                                    {formErrors[fieldKey] && (
                                      <p className="text-xs text-red-600">{formErrors[fieldKey]}</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button
                      type="submit"
                      disabled={enrollMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {enrollMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processando...
                        </>
                      ) : (
                        "Confirmar Inscrição"
                      )}
                    </Button>
                  </div>
                </form>
              )}
              </TabsContent>
            )}

            {normalizedAllowedTabs.includes("list") && (
              <TabsContent value="list" className="mt-6 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-start gap-3 justify-between">
                <div className="flex-1 min-w-0">
                  <SearchFilter
                    searchValue={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Buscar por nome, CPF ou email..."
                  />
                </div>
                <div className="flex flex-wrap gap-2 lg:pt-1">
                  {isPastTraining && (
                    <Button
                      onClick={() => setShowUploadList(true)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Importar Lista
                    </Button>
                  )}
                  <Button onClick={handleExportExcel} variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Exportar Excel
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDeleteAllStatus(null);
                      setDeleteAllConfirmOpen(true);
                    }}
                    disabled={
                      participantsLoading ||
                      !allParticipants.length ||
                      deleteAllParticipants.isPending
                    }
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir todos
                  </Button>
                </div>
              </div>

              {deleteAllStatus && (
                <Alert
                  className={
                    deleteAllStatus.type === "error"
                      ? "border-red-200 bg-red-50"
                      : deleteAllStatus.type === "warning"
                        ? "border-amber-200 bg-amber-50"
                        : "border-green-200 bg-green-50"
                  }
                >
                  <AlertDescription
                    className={
                      deleteAllStatus.type === "error"
                        ? "text-red-800"
                        : deleteAllStatus.type === "warning"
                          ? "text-amber-800"
                          : "text-green-800"
                    }
                  >
                    {deleteAllStatus.message}
                  </AlertDescription>
                </Alert>
              )}

              <DataTable
                columns={columns}
                data={filteredParticipants}
                isLoading={participantsLoading}
                emptyMessage="Nenhuma inscrição registrada"
              />
              </TabsContent>
            )}

            {normalizedAllowedTabs.includes("summary") && (
              <TabsContent value="summary" className="mt-6 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Filtros do resumo</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      <div className="space-y-2 md:col-span-2 xl:col-span-3">
                        <Label htmlFor="summary-search">Busca rápida</Label>
                        <Input
                          id="summary-search"
                          value={summarySearch}
                          onChange={(event) => setSummarySearch(event.target.value)}
                          placeholder="Nome, e-mail, CPF, município ou GVE..."
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={summaryStatusFilter}
                          onValueChange={setSummaryStatusFilter}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="inscrito">Inscrito</SelectItem>
                            <SelectItem value="confirmado">Confirmado</SelectItem>
                            <SelectItem value="cancelado">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Município</Label>
                        <Select
                          value={summaryMunicipalityFilter}
                          onValueChange={setSummaryMunicipalityFilter}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Todos os municípios" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos os municípios</SelectItem>
                            {summaryMunicipalityOptions.map((municipality) => (
                              <SelectItem key={municipality} value={municipality}>
                                {municipality}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>GVE</Label>
                        <Select value={summaryGveFilter} onValueChange={setSummaryGveFilter}>
                          <SelectTrigger>
                            <SelectValue placeholder="Todas as GVE" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas as GVE</SelectItem>
                            {summaryGveOptions.map((gve) => (
                              <SelectItem key={gve} value={gve}>
                                {gve}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="summary-start-date">Inscrição de</Label>
                        <Input
                          id="summary-start-date"
                          type="date"
                          value={summaryStartDate}
                          onChange={(event) => setSummaryStartDate(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="summary-end-date">Inscrição até</Label>
                        <Input
                          id="summary-end-date"
                          type="date"
                          value={summaryEndDate}
                          onChange={(event) => setSummaryEndDate(event.target.value)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-slate-500">Total filtrado</p>
                      <p className="text-2xl font-semibold text-slate-900">
                        {summaryFilteredParticipants.length}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-slate-500">Confirmados</p>
                      <p className="text-2xl font-semibold text-green-700">
                        {summaryStatusTotals.confirmed}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-slate-500">Pendentes</p>
                      <p className="text-2xl font-semibold text-amber-700">
                        {summaryStatusTotals.pending}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-slate-500">Cancelados</p>
                      <p className="text-2xl font-semibold text-red-700">
                        {summaryStatusTotals.cancelled}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-slate-500">GVE com mais inscritos</p>
                      <p className="text-lg font-semibold text-indigo-700 truncate">
                        {topGve?.name || "-"}
                      </p>
                      <p className="text-xs text-slate-500">{topGve?.total || 0} inscritos</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-xs text-slate-500">Município com mais inscritos</p>
                      <p className="text-lg font-semibold text-blue-700 truncate">
                        {topMunicipality?.name || "-"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {topMunicipality?.total || 0} inscritos
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Top 10 GVE por inscritos
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {summaryGveChartData.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          Sem dados para exibir com os filtros atuais.
                        </p>
                      ) : (
                        <div className="h-[320px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={summaryGveChartData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                              <YAxis allowDecimals={false} />
                              <Tooltip />
                              <Bar dataKey="total" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Top 10 municípios por inscritos
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {summaryMunicipalityChartData.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          Sem dados para exibir com os filtros atuais.
                        </p>
                      ) : (
                        <div className="h-[320px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={summaryMunicipalityChartData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                              <YAxis allowDecimals={false} />
                              <Tooltip />
                              <Bar dataKey="total" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Total de inscritos por GVE</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      columns={summaryGveColumns}
                      data={groupedSummaryByGve}
                      emptyMessage="Nenhum inscrito encontrado para os filtros selecionados"
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a inscrição de "{deleteConfirm?.professional_name}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDeleteAllStatus(null);
                deleteParticipant.mutate(deleteConfirm);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteAllConfirmOpen}
        onOpenChange={setDeleteAllConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir todos os inscritos</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação vai remover todos os inscritos deste treinamento e não pode
              ser desfeita. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDeleteAllStatus(null);
                deleteAllParticipants.mutate();
              }}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteAllParticipants.isPending}
            >
              {deleteAllParticipants.isPending ? "Excluindo..." : "Excluir todos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upload List Dialog */}
      <Dialog open={showUploadList} onOpenChange={setShowUploadList}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Importar Lista de Participantes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Use o modelo do formulário padrão de inscrição. Apenas treinamentos
                já concluídos permitem importação.
              </AlertDescription>
            </Alert>
            <div className="flex">
              <Button variant="outline" onClick={handleDownloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Baixar modelo
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="upload-list-file">
                Selecione o arquivo (.xlsx ou .csv)
              </Label>
              <Input
                id="upload-list-file"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleUploadFileChange}
              />
              {uploadFile && (
                <p className="text-sm text-slate-500">
                  Arquivo selecionado: {uploadFile.name}
                </p>
              )}
            </div>
            {uploadStatus && (
              <Alert
                className={
                  uploadStatus.type === "error"
                    ? "border-red-200 bg-red-50"
                    : uploadStatus.type === "success"
                    ? "border-green-200 bg-green-50"
                    : "border-blue-200 bg-blue-50"
                }
              >
                <AlertDescription
                  className={
                    uploadStatus.type === "error"
                      ? "text-red-800"
                      : uploadStatus.type === "success"
                      ? "text-green-800"
                      : "text-blue-800"
                  }
                >
                  {uploadStatus.message}
                </AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowUploadList(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleUploadParticipants}
                disabled={!uploadFile || importParticipants.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {importParticipants.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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

      {/* Edit Participant Dialog */}
      <Dialog
        open={showEditParticipant}
        onOpenChange={(open) => {
          if (!open) {
            setShowEditParticipant(false);
            setEditParticipant(null);
            setEditFormErrors({});
            setEditStatus(null);
          } else {
            setShowEditParticipant(true);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editar Inscrito</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {municipalityOptions.length > 0 && (
              <datalist id="municipios-list-edit">
                {municipalityOptions.map((municipio) => (
                  <option key={municipio} value={municipio} />
                ))}
              </datalist>
            )}

            <div className="space-y-6">
              {sectionOrder.map((section, index) => {
                const sectionFields = fieldsBySection[section];
                return (
                  <div key={section} className="space-y-4">
                    {index > 0 && <div className="border-t border-slate-200" />}
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900">
                        {sectionLabels[section] || formatSectionLabel(section)}
                      </h3>
                      {sectionFields.length > 0 && (
                        <span className="text-xs text-slate-500">
                          ({sectionFields.length})
                        </span>
                      )}
                    </div>
                    {sectionFields.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Nenhum campo configurado para esta seção.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {sectionFields.map((field) => {
                          const fieldKey = field.field_key || "";
                          const fieldSemantic = getEnrollmentFieldSemantic(field);
                          const isMunicipalityField = fieldSemantic === "municipality";
                          const isGveField = fieldSemantic === "gve";
                          const resolvedGve = getAutoGveByValues(editFormData);
                          const fieldValue =
                            isGveField && resolvedGve
                              ? resolvedGve
                              : editFormData[fieldKey] || "";

                          return (
                            <div key={field.id} className="space-y-2">
                              <Label htmlFor={`edit-${fieldKey}`}>
                                {field.label}
                              </Label>
                              <Input
                                id={`edit-${fieldKey}`}
                                type={field.type}
                                value={fieldValue}
                                list={
                                  isMunicipalityField && municipalityOptions.length > 0
                                    ? "municipios-list-edit"
                                    : undefined
                                }
                                readOnly={isGveField && Boolean(resolvedGve)}
                                onChange={(e) => {
                                  const nextValue = formatEnrollmentFieldValue(field, e.target.value, {
                                    liveInput: true,
                                  });
                                  if (isMunicipalityField) {
                                    const gveValue = getGveByMunicipio(nextValue);
                                    setEditFormData((prev) => {
                                      const next = {
                                        ...prev,
                                        [fieldKey]: nextValue,
                                      };
                                      if (gveFieldKey) {
                                        next[gveFieldKey] = gveValue || prev[gveFieldKey];
                                      }
                                      return next;
                                    });
                                    if (editFormErrors[fieldKey]) {
                                      setEditFormErrors((prev) => ({
                                        ...prev,
                                        [fieldKey]: null,
                                      }));
                                    }
                                    if (gveValue && gveFieldKey && editFormErrors[gveFieldKey]) {
                                      setEditFormErrors((prev) => ({
                                        ...prev,
                                        [gveFieldKey]: null,
                                      }));
                                    }
                                    return;
                                  }

                                  setEditFormData((prev) => ({
                                    ...prev,
                                    [fieldKey]: nextValue,
                                  }));
                                  if (editFormErrors[fieldKey]) {
                                    setEditFormErrors((prev) => ({
                                      ...prev,
                                      [fieldKey]: null,
                                    }));
                                  }
                                }}
                                placeholder={field.placeholder}
                              />
                              {editFormErrors[fieldKey] && (
                                <p className="text-xs text-red-600">
                                  {editFormErrors[fieldKey]}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {editStatus && (
              <Alert
                className={
                  editStatus.type === "error"
                    ? "border-red-200 bg-red-50"
                    : "border-green-200 bg-green-50"
                }
              >
                <AlertDescription
                  className={
                    editStatus.type === "error" ? "text-red-800" : "text-green-800"
                  }
                >
                  {editStatus.message}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowEditParticipant(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveParticipant}
                disabled={updateParticipant.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {updateParticipant.isPending ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Field Form Dialog */}
      <Dialog open={fieldFormOpen} onOpenChange={(open) => !open && resetFieldForm()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingField ? "Editar Campo" : "Novo Campo"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveField} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="field-label">Nome do campo</Label>
                <Input
                  id="field-label"
                  value={fieldFormData.label}
                  onChange={(e) => setFieldFormData({ ...fieldFormData, label: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="field-key">Chave (field_key)</Label>
                <Input
                  id="field-key"
                  value={fieldFormData.field_key}
                  onChange={(e) => setFieldFormData({ ...fieldFormData, field_key: e.target.value })}
                  placeholder="ex: cpf, email, setor"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="field-order">Ordem</Label>
                <Input
                  id="field-order"
                  type="number"
                  value={fieldFormData.order}
                  onChange={(e) => setFieldFormData({ ...fieldFormData, order: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={fieldFormData.type}
                  onValueChange={(value) => setFieldFormData({ ...fieldFormData, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="tel">Telefone</SelectItem>
                    <SelectItem value="number">Número</SelectItem>
                    <SelectItem value="date">Data</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Seção</Label>
                <Select
                  value={fieldFormData.section}
                  onValueChange={(value) => setFieldFormData({ ...fieldFormData, section: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((section) => (
                      <SelectItem key={section.key} value={section.key}>
                        {section.label || formatSectionLabel(section.key)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="field-placeholder">Placeholder</Label>
                <Input
                  id="field-placeholder"
                  value={fieldFormData.placeholder || ""}
                  onChange={(e) => setFieldFormData({ ...fieldFormData, placeholder: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Aplicação</Label>
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox
                    id="field-global"
                    checked={isFieldGlobal}
                    onCheckedChange={(checked) =>
                      setFieldFormData({
                        ...fieldFormData,
                        training_id: checked ? null : trainingId,
                      })
                    }
                  />
                  <Label htmlFor="field-global" className="text-sm font-normal">
                    Campo global (todos os treinamentos)
                  </Label>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="field-required"
                  checked={fieldFormData.required}
                  onCheckedChange={(checked) =>
                    setFieldFormData({ ...fieldFormData, required: Boolean(checked) })
                  }
                />
                <Label htmlFor="field-required" className="text-sm font-normal">
                  Campo obrigatório
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="field-active"
                  checked={fieldFormData.is_active}
                  onCheckedChange={(checked) =>
                    setFieldFormData({ ...fieldFormData, is_active: Boolean(checked) })
                  }
                />
                <Label htmlFor="field-active" className="text-sm font-normal">
                  Campo ativo
                </Label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={resetFieldForm}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createField.isPending || updateField.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {editingField ? "Salvar Alterações" : "Criar Campo"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Field Delete Confirmation */}
      <AlertDialog open={!!fieldDeleteConfirm} onOpenChange={() => setFieldDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campo do formulário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o campo "{fieldDeleteConfirm?.label}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteField.mutate(fieldDeleteConfirm.id)}
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