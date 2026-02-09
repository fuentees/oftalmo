import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
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
import { toast } from "sonner";
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
  GraduationCap, 
  CheckCircle,
  AlertCircle,
  Loader2,
  Download,
  Trash2,
  Users,
  Plus,
  Edit,
  Link2,
  FileText,
  Image as ImageIcon
} from "lucide-react";
import { format } from "date-fns";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import SearchFilter from "@/components/common/SearchFilter";
import SendLinkButton from "@/components/trainings/SendLinkButton";

export default function EnrollmentPage() {
  const queryString =
    window.location.search || window.location.hash.split("?")[1] || "";
  const urlParams = new URLSearchParams(queryString);
  const trainingId = urlParams.get("training");
  
  const [formData, setFormData] = useState(/** @type {Record<string, any>} */ ({}));
  const [submitted, setSubmitted] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [fieldFormOpen, setFieldFormOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [fieldDeleteConfirm, setFieldDeleteConfirm] = useState(null);
  const [fieldSearch, setFieldSearch] = useState("");
  const [showInactiveFields, setShowInactiveFields] = useState(false);
  const [formErrors, setFormErrors] = useState(
    /** @type {Record<string, string | null>} */ ({})
  );
  const hasAutoSeededRef = React.useRef(false);
  const [logoUploading, setLogoUploading] = useState(false);

  const queryClient = useQueryClient();

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

  const formatCpf = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})/, "$1-$2")
      .replace(/(-\d{2})\d+?$/, "$1");
  };

  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 10) {
      return digits
        .replace(/(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    }
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2");
  };

  const formatRg = (value) => {
    const cleaned = value.replace(/[^0-9xX]/g, "").slice(0, 12);
    return cleaned.toUpperCase();
  };

  const formatFieldValue = (field, value) => {
    if (!value) return value;
    const key = field.field_key?.toLowerCase() || "";
    if (key.includes("cpf")) return formatCpf(value);
    if (key.includes("rg")) return formatRg(value);
    if (
      field.type === "tel" ||
      key.includes("phone") ||
      key.includes("celular") ||
      key.includes("telefone")
    ) {
      return formatPhone(value);
    }
    return value;
  };

  const defaultEnrollmentFields = [
    {
      field_key: "name",
      label: "Nome",
      type: "text",
      required: true,
      placeholder: "Nome completo",
      section: "pessoais",
      order: 1,
    },
    {
      field_key: "cpf",
      label: "CPF",
      type: "text",
      required: true,
      placeholder: "000.000.000-00",
      section: "pessoais",
      order: 2,
    },
    {
      field_key: "rg",
      label: "RG",
      type: "text",
      required: true,
      placeholder: "00.000.000-0",
      section: "pessoais",
      order: 3,
    },
    {
      field_key: "email",
      label: "E-mail",
      type: "email",
      required: true,
      placeholder: "nome@email.com",
      section: "pessoais",
      order: 4,
    },
    {
      field_key: "professional_formation",
      label: "Formação Profissional",
      type: "text",
      required: false,
      placeholder: "Ex: Enfermagem",
      section: "instituicao",
      order: 5,
    },
    {
      field_key: "institution",
      label: "Instituição que representa",
      type: "text",
      required: false,
      placeholder: "Ex: Hospital X",
      section: "instituicao",
      order: 6,
    },
    {
      field_key: "state",
      label: "Estado",
      type: "text",
      required: false,
      placeholder: "UF",
      section: "instituicao",
      order: 7,
    },
    {
      field_key: "health_region",
      label: "Regional de Saúde",
      type: "text",
      required: false,
      placeholder: "Ex: Regional Norte",
      section: "instituicao",
      order: 8,
    },
    {
      field_key: "municipality",
      label: "Município",
      type: "text",
      required: false,
      placeholder: "Cidade",
      section: "instituicao",
      order: 9,
    },
    {
      field_key: "unit_name",
      label: "Nome da Unidade",
      type: "text",
      required: false,
      placeholder: "Unidade de saúde",
      section: "instituicao",
      order: 10,
    },
    {
      field_key: "sector",
      label: "Cargo",
      type: "text",
      required: false,
      placeholder: "Cargo/Função",
      section: "instituicao",
      order: 11,
    },
    {
      field_key: "work_address",
      label: "Endereço de Trabalho",
      type: "text",
      required: false,
      placeholder: "Rua, número, bairro",
      section: "enderecos",
      order: 12,
    },
    {
      field_key: "residential_address",
      label: "Endereço Residencial",
      type: "text",
      required: false,
      placeholder: "Rua, número, bairro",
      section: "enderecos",
      order: 13,
    },
    {
      field_key: "commercial_phone",
      label: "Telefone Comercial",
      type: "tel",
      required: false,
      placeholder: "(00) 0000-0000",
      section: "contatos",
      order: 14,
    },
    {
      field_key: "mobile_phone",
      label: "Celular",
      type: "tel",
      required: false,
      placeholder: "(00) 00000-0000",
      section: "contatos",
      order: 15,
    },
  ];

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
      localStorage.setItem("enrollment_defaults_seeded_global", "true");
      toast.success("Campos padrão aplicados com sucesso.");
    },
    onError: (error) => {
      toast.error(error?.message || "Erro ao aplicar campos padrão.");
    },
  });

  React.useEffect(() => {
    if (!trainingId || !fieldsFetched) return;
    if (enrollmentFields.length > 0 || seedDefaults.isPending) return;
    if (hasAutoSeededRef.current) return;
    const seededFlag = localStorage.getItem("enrollment_defaults_seeded_global");
    if (seededFlag === "true") return;
    const payload = defaultEnrollmentFields.map((field) => ({
      ...field,
      training_id: null,
      is_active: true,
    }));
    hasAutoSeededRef.current = true;
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
      toast.success("Campo excluído com sucesso.");
    },
    onError: (error) => {
      toast.error(error?.message || "Erro ao excluir campo.");
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

      await dataClient.entities.TrainingParticipant.create({
        training_id: trainingId,
        training_title: training.title,
        training_date: firstDate,
        professional_name: data.name,
        professional_cpf: data.cpf,
        professional_rg: data.rg,
        professional_email: data.email,
        professional_sector: data.sector,
        professional_registration: data.registration,
        professional_formation: data.professional_formation,
        institution: data.institution,
        state: data.state,
        health_region: data.health_region,
        municipality: data.municipality,
        unit_name: data.unit_name,
        position: data.position,
        work_address: data.work_address,
        residential_address: data.residential_address,
        commercial_phone: data.commercial_phone,
        mobile_phone: data.mobile_phone,
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
    mutationFn: async (/** @type {any} */ id) => {
      await dataClient.entities.TrainingParticipant.delete(id);
      await dataClient.entities.Training.update(trainingId, {
        participants_count: Math.max(0, (training.participants_count || 1) - 1),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrolled-participants"] });
      queryClient.invalidateQueries({ queryKey: ["training"] });
      setDeleteConfirm(null);
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
        const isValidCpf = (() => {
          if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
          let sum = 0;
          for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i);
          let check = (sum * 10) % 11;
          if (check === 10) check = 0;
          if (check !== Number(digits[9])) return false;
          sum = 0;
          for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * (11 - i);
          check = (sum * 10) % 11;
          if (check === 10) check = 0;
          return check === Number(digits[10]);
        })();
        if (!isValidCpf) {
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
    enrollMutation.mutate(formData);
  };

  const handleCopyEnrollmentLink = () => {
    if (!trainingId) return;
    const link = `${window.location.origin}/PublicEnrollment?training=${encodeURIComponent(trainingId)}`;
    navigator.clipboard.writeText(link);
    alert("Link de inscrição copiado!");
  };

  const handleLogoUpload = async (file) => {
    if (!file || !trainingId) return;
    setLogoUploading(true);
    try {
      const { file_url } = await dataClient.integrations.Core.UploadFile({ file });
      await dataClient.entities.Training.update(trainingId, { logo_url: file_url });
      queryClient.invalidateQueries({ queryKey: ["training"] });
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      toast.success("Logo atualizado com sucesso.");
    } catch (error) {
      toast.error(error?.message || "Erro ao enviar logo.");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!trainingId) return;
    try {
      await dataClient.entities.Training.update(trainingId, { logo_url: null });
      queryClient.invalidateQueries({ queryKey: ["training"] });
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      toast.success("Logo removido com sucesso.");
    } catch (error) {
      toast.error(error?.message || "Erro ao remover logo.");
    }
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
    if (seedDefaults.isPending) return;
    const existingKeys = new Set(enrollmentFields.map((field) => field.field_key));
    const payload = defaultEnrollmentFields
      .filter((field) => !existingKeys.has(field.field_key))
      .map((field) => ({
        ...field,
        training_id: null,
        is_active: true,
      }));

    if (payload.length === 0) {
      toast.info("Todos os campos padrão já existem.");
      return;
    }

    seedDefaults.mutate(payload);
  };

  const handleExportExcel = () => {
    const headers = [
      "Nome", "CPF", "RG", "Email", "Setor", "Matrícula", "Formação Profissional",
      "Instituição", "Estado", "Região de Saúde", "Município", "Nome da Unidade", "Cargo",
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

  const filteredParticipants = allParticipants.filter(p => 
    p.professional_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.professional_cpf?.toLowerCase().includes(search.toLowerCase()) ||
    p.professional_email?.toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    {
      header: "Nome",
      accessor: "professional_name",
      cellClassName: "font-medium",
    },
    {
      header: "CPF",
      accessor: "professional_cpf",
    },
    {
      header: "Email",
      accessor: "professional_email",
    },
    {
      header: "Setor",
      accessor: "professional_sector",
    },
    {
      header: "Instituição",
      accessor: "institution",
    },
    {
      header: "Data Inscrição",
      render: (row) => row.enrollment_date ? format(new Date(row.enrollment_date), "dd/MM/yyyy HH:mm") : "-",
      sortType: "date",
    },
    {
      header: "Ações",
      cellClassName: "text-right",
      sortable: false,
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDeleteConfirm(row)}
          className="text-red-600 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
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

  const sectionLabels = {
    pessoais: "Dados Pessoais",
    instituicao: "Instituição",
    enderecos: "Endereços",
    contatos: "Contatos",
  };
  const sectionOrder = ["pessoais", "instituicao", "enderecos", "contatos"];

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
        </div>
      ),
    },
    {
      header: "Seção",
      render: (row) => (
        <Badge variant="outline">{sectionLabels[row.section]}</Badge>
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
            disabled={deleteField.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
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
    acc[section] = activeEnrollmentFields.filter((field) => field.section === section);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Inscrições - ${training.title}`}
        subtitle="Gerencie as inscrições do treinamento"
      />

      <Card>
        <CardHeader className="bg-blue-600 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center overflow-hidden">
              {training.logo_url ? (
                <img
                  src={training.logo_url}
                  alt="Logo do treinamento"
                  className="h-12 w-12 object-contain"
                />
              ) : (
                <GraduationCap className="h-6 w-6" />
              )}
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
          <Tabs defaultValue="mask" className="w-full">
            <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3">
              <TabsTrigger value="mask">
                <FileText className="h-4 w-4 mr-2" />
                Máscara do Formulário
              </TabsTrigger>
              <TabsTrigger value="form">
                <GraduationCap className="h-4 w-4 mr-2" />
                Formulário de Inscrição
              </TabsTrigger>
              <TabsTrigger value="list">
                <Users className="h-4 w-4 mr-2" />
                Inscritos ({allParticipants.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="mask" className="mt-6 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-slate-500" />
                    Logo do Treinamento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {training.logo_url ? (
                    <div className="flex items-center gap-4">
                      <img
                        src={training.logo_url}
                        alt="Logo do treinamento"
                        className="h-20 w-20 rounded-lg object-contain border border-slate-200 bg-white"
                      />
                      <Button variant="outline" onClick={handleRemoveLogo}>
                        Remover logo
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Nenhuma logo cadastrada. Envie uma imagem para exibir no formulário público.
                    </p>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleLogoUpload(e.target.files?.[0])}
                      disabled={logoUploading}
                    />
                    <span className="text-xs text-slate-500">PNG/JPG até 2MB</span>
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={handleAddDefaultFields}>
                  <Plus className="h-4 w-4 mr-2" />
                  {seedDefaults.isPending ? "Aplicando..." : "Aplicar Campos Padrão"}
                </Button>
                <Button onClick={() => {
                  setEditingField(null);
                  setFieldFormData(getDefaultFieldData());
                  setFieldFormOpen(true);
                }}>
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

            <TabsContent value="form" className="mt-6 space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={handleCopyEnrollmentLink}>
                  <Link2 className="h-4 w-4 mr-2" />
                  Copiar Link de Inscrição
                </Button>
              </div>

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
                  {sectionOrder.map((section) => {
                    const sectionFields = fieldsBySection[section];
                    if (sectionFields.length === 0) return null;
                    return (
                      <div key={section} className="space-y-4">
                        <h4 className="font-semibold text-slate-900">
                          {sectionLabels[section]}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {sectionFields.map((field) => (
                            <div key={field.id} className="space-y-2">
                              <Label htmlFor={field.field_key}>
                                {field.label} {field.required && "*"}
                              </Label>
                              <Input
                                id={field.field_key}
                                type={field.type}
                                value={formData[field.field_key] || ""}
                                onChange={(e) => {
                                  const nextValue = formatFieldValue(field, e.target.value);
                                  setFormData({ ...formData, [field.field_key]: nextValue });
                                  if (formErrors[field.field_key]) {
                                    setFormErrors((prev) => ({ ...prev, [field.field_key]: null }));
                                  }
                                }}
                                placeholder={field.placeholder}
                                required={field.required}
                              />
                              {formErrors[field.field_key] && (
                                <p className="text-xs text-red-600">{formErrors[field.field_key]}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

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

            <TabsContent value="list" className="mt-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SearchFilter
                  searchValue={search}
                  onSearchChange={setSearch}
                  searchPlaceholder="Buscar por nome, CPF ou email..."
                />
                <div className="flex flex-wrap items-center gap-2">
                  <SendLinkButton training={training} participants={allParticipants} />
                  <Button variant="outline" onClick={() => {
                    const link = `${window.location.origin}/TrainingFeedback?training=${encodeURIComponent(trainingId)}`;
                    navigator.clipboard.writeText(link);
                    alert("Link de avaliação copiado!");
                  }}>
                    <Link2 className="h-4 w-4 mr-2" />
                    Copiar Link de Avaliação
                  </Button>
                  <Button onClick={handleExportExcel} variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Exportar Excel
                  </Button>
                </div>
              </div>

              <DataTable
                columns={columns}
                data={filteredParticipants}
                isLoading={participantsLoading}
                emptyMessage="Nenhuma inscrição registrada"
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
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
              onClick={() => deleteParticipant.mutate(deleteConfirm.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                    <SelectItem value="pessoais">Dados Pessoais</SelectItem>
                    <SelectItem value="instituicao">Instituição</SelectItem>
                    <SelectItem value="enderecos">Endereços</SelectItem>
                    <SelectItem value="contatos">Contatos</SelectItem>
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
      <AlertDialog
        open={!!fieldDeleteConfirm}
        onOpenChange={(open) => {
          if (!open) setFieldDeleteConfirm(null);
        }}
      >
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
              disabled={deleteField.isPending}
            >
              {deleteField.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}