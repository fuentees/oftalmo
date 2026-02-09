import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { format } from "date-fns";
import {
  Users,
  Upload,
  Download,
  FileSpreadsheet,
  Calendar,
  GraduationCap,
  CheckCircle,
  XCircle,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PageHeader from "@/components/common/PageHeader";
import SearchFilter from "@/components/common/SearchFilter";
import DataTable from "@/components/common/DataTable";
import StatsCard from "@/components/dashboard/StatsCard";

export default function Participants() {
  const [search, setSearch] = useState("");
  const [trainingFilter, setTrainingFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);

  const queryClient = useQueryClient();

  const { data: participants = [], isLoading } = useQuery({
    queryKey: ["participants"],
    queryFn: () => dataClient.entities.TrainingParticipant.list("-training_date"),
  });

  const { data: trainings = [] } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => dataClient.entities.Training.list(),
  });

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
      
      // Create participants
      await dataClient.entities.TrainingParticipant.bulkCreate(participantsData);
      
      setUploadStatus({ 
        type: "success", 
        message: `${participantsData.length} participante(s) importado(s) com sucesso!` 
      });
      
      return participantsData;
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

  // Get unique trainings from participants
  const uniqueTrainings = [...new Set(participants.map(p => p.training_title).filter(Boolean))];
  const trainingOptions = uniqueTrainings.map(t => ({ value: t, label: t }));

  const filteredParticipants = participants.filter((p) => {
    // Apenas participantes que concluíram o treinamento (aprovados ou com presença mínima)
    const isConcluded = p.approved || (p.attendance_percentage && p.attendance_percentage >= 75);
    if (!isConcluded) return false;
    
    const matchesSearch = 
      p.professional_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.professional_registration?.toLowerCase().includes(search.toLowerCase()) ||
      p.professional_cpf?.toLowerCase().includes(search.toLowerCase()) ||
      p.training_title?.toLowerCase().includes(search.toLowerCase());
    const matchesTraining = trainingFilter === "all" || p.training_title === trainingFilter;
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "aprovado" && p.approved) ||
      (statusFilter === "reprovado" && !p.approved);
    return matchesSearch && matchesTraining && matchesStatus;
  });

  const totalParticipants = participants.length;
  const approvedCount = participants.filter(p => p.approved).length;
  const presentCount = participants.filter(p => p.attendance === "presente").length;

  const columns = [
    {
      header: "Data",
      render: (row) => row.training_date ? format(new Date(row.training_date), "dd/MM/yyyy") : "-",
    },
    {
      header: "Treinamento",
      accessor: "training_title",
      cellClassName: "font-medium",
      render: (row) => row.training_title || "-",
    },
    {
      header: "Participante",
      render: (row) => (
        <div>
          <p className="font-medium">{row.professional_name}</p>
          {row.professional_registration && (
            <p className="text-xs text-slate-500">Mat: {row.professional_registration}</p>
          )}
        </div>
      ),
    },
    {
      header: "RG",
      accessor: "professional_rg",
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
      header: "Presença",
      render: (row) => {
        const colors = {
          presente: "bg-green-100 text-green-700",
          ausente: "bg-red-100 text-red-700",
          justificado: "bg-amber-100 text-amber-700",
        };
        const labels = {
          presente: "Presente",
          ausente: "Ausente",
          justificado: "Justificado",
        };
        return <Badge className={colors[row.attendance]}>{labels[row.attendance]}</Badge>;
      },
    },
    {
      header: "Status",
      render: (row) => (
        <div className="flex items-center gap-1">
          {row.approved ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-green-700 font-medium">Aprovado</span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-red-600" />
              <span className="text-red-700 font-medium">Reprovado</span>
            </>
          )}
        </div>
      ),
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
            window.location.href = `/ParticipantProfile?id=${row.id}`;
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
        subtitle="Todos os participantes de treinamentos"
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatsCard
          title="Total de Participantes"
          value={totalParticipants}
          icon={Users}
          color="blue"
        />
        <StatsCard
          title="Aprovados"
          value={approvedCount}
          icon={CheckCircle}
          color="green"
        />
        <StatsCard
          title="Presenças"
          value={presentCount}
          icon={Calendar}
          color="purple"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="flex-1">
          <SearchFilter
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por nome, matrícula, CPF ou treinamento..."
            filters={[
              {
                value: trainingFilter,
                onChange: setTrainingFilter,
                placeholder: "Treinamento",
                allLabel: "Todos os treinamentos",
                options: trainingOptions,
              },
              {
                value: statusFilter,
                onChange: setStatusFilter,
                placeholder: "Status",
                allLabel: "Todos",
                options: [
                  { value: "aprovado", label: "Aprovado" },
                  { value: "reprovado", label: "Reprovado" },
                ],
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
            Modelo Excel
          </Button>
          <Button
            onClick={() => setShowUpload(true)}
            className="bg-green-600 hover:bg-green-700 flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Importar Excel
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredParticipants}
        isLoading={isLoading}
        emptyMessage="Nenhum participante registrado"
      />

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Importar Participantes por Excel
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Faça o download do modelo Excel, preencha com os dados dos participantes e faça o upload aqui.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="file">Selecione o arquivo Excel (.xlsx, .csv)</Label>
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