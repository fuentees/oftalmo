import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Calendar, 
  Clock, 
  MapPin, 
  User, 
  CheckCircle,
  AlertCircle,
  Loader2,
  Video,
  Download,
  Trash2,
  Users
} from "lucide-react";
import { format } from "date-fns";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import SearchFilter from "@/components/common/SearchFilter";

export default function EnrollmentPage() {
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const trainingId = urlParams.get("training");
  
  const [formData, setFormData] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const queryClient = useQueryClient();

  const { data: training, isLoading } = useQuery({
    queryKey: ["training", trainingId],
    queryFn: async () => {
      const trainings = await dataClient.entities.Training.list();
      return trainings.find(t => t.id === trainingId);
    },
    enabled: !!trainingId,
  });

  const { data: enrollmentFields = [] } = useQuery({
    queryKey: ["enrollment-fields", trainingId],
    queryFn: async () => {
      const allFields = await dataClient.entities.EnrollmentField.list("order");
      return allFields.filter(f => 
        f.is_active && (!f.training_id || f.training_id === trainingId)
      );
    },
    enabled: !!trainingId,
  });

  const { data: allParticipants = [], isLoading: participantsLoading } = useQuery({
    queryKey: ["enrolled-participants", trainingId],
    queryFn: () => dataClient.entities.TrainingParticipant.filter({ training_id: trainingId }, "-enrollment_date"),
    enabled: !!trainingId,
  });

  const enrollMutation = useMutation({
    mutationFn: async (data) => {
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

      const firstDate = training.dates && training.dates.length > 0 ? training.dates[0].date : null;
      
      const validityDate = training.validity_months && firstDate
        ? format(new Date(firstDate).setMonth(new Date(firstDate).getMonth() + training.validity_months), "yyyy-MM-dd")
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
    mutationFn: async (id) => {
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
    enrollMutation.mutate(formData);
  };

  const handleExportExcel = () => {
    const headers = [
      "Nome", "CPF", "RG", "Email", "Setor", "Matrícula", "Formação Profissional",
      "Instituição", "Estado", "Região de Saúde", "Município", "Nome da Unidade",
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

  return (
    <div className="space-y-6">
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
                {training.dates && training.dates.length > 0 && format(new Date(training.dates[0].date), "dd/MM/yyyy")}
                {training.location && ` • ${training.location}`}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <Tabs defaultValue="form" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="form">
                <GraduationCap className="h-4 w-4 mr-2" />
                Formulário de Inscrição
              </TabsTrigger>
              <TabsTrigger value="list">
                <Users className="h-4 w-4 mr-2" />
                Inscritos ({allParticipants.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="form" className="mt-6">
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
                  {["pessoais", "instituicao", "enderecos", "contatos"].map(section => {
                    const sectionFields = enrollmentFields.filter(f => f.section === section);
                    if (sectionFields.length === 0) return null;
                    
                    const sectionTitles = {
                      pessoais: "Dados Pessoais",
                      instituicao: "Instituição",
                      enderecos: "Endereços",
                      contatos: "Contatos"
                    };
                    
                    return (
                      <div key={section} className="space-y-4">
                        <h4 className="font-semibold text-slate-900">{sectionTitles[section]}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {sectionFields.map(field => (
                            <div key={field.id} className="space-y-2">
                              <Label htmlFor={field.field_key}>
                                {field.label} {field.required && "*"}
                              </Label>
                              <Input
                                id={field.field_key}
                                type={field.type}
                                value={formData[field.field_key] || ""}
                                onChange={(e) => setFormData({...formData, [field.field_key]: e.target.value})}
                                placeholder={field.placeholder}
                                required={field.required}
                              />
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
              <div className="flex justify-between items-center">
                <SearchFilter
                  searchValue={search}
                  onSearchChange={setSearch}
                  searchPlaceholder="Buscar por nome, CPF ou email..."
                />
                <Button onClick={handleExportExcel} variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Exportar Excel
                </Button>
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
    </div>
  );
}