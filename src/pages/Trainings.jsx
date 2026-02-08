import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import {
  GraduationCap,
  Plus,
  Edit,
  Trash2,
  Eye,
  Users,
  Calendar,
  Clock,
  MapPin,
  UserPlus,
  ClipboardCheck,
  Award,
  Link2,
  MoreVertical,
  FileText
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
import PageHeader from "@/components/common/PageHeader";
import SearchFilter from "@/components/common/SearchFilter";
import DataTable from "@/components/common/DataTable";
import TrainingForm from "@/components/trainings/TrainingForm";
import TrainingDetails from "@/components/trainings/TrainingDetails";
import ParticipantsManager from "@/components/trainings/ParticipantsManager";
import EnrollmentManager from "@/components/trainings/EnrollmentManager";
import AttendanceControl from "@/components/trainings/AttendanceControl";
import CertificateManager from "@/components/trainings/CertificateManager";
import SendLinkButton from "@/components/trainings/SendLinkButton";
import MaterialsManager from "@/components/trainings/MaterialsManager";
import FeedbackForm from "@/components/trainings/FeedbackForm";

export default function Trainings() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  
  const [showForm, setShowForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [showCertificates, setShowCertificates] = useState(false);
  const [showMaterials, setShowMaterials] = useState(false);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

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
    queryFn: () => base44.entities.Training.list("-date"),
  });

  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => base44.entities.Professional.list(),
  });

  const { data: participants = [] } = useQuery({
    queryKey: ["participants"],
    queryFn: () => base44.entities.TrainingParticipant.list(),
  });

  const deleteTraining = useMutation({
    mutationFn: (id) => base44.entities.Training.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      setDeleteConfirm(null);
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

  const filteredTrainings = trainings.filter((t) => {
    const matchesSearch = t.title?.toLowerCase().includes(search.toLowerCase()) ||
                          t.instructor?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    const matchesType = typeFilter === "all" || t.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
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

  const typeLabels = {
    teorico: "Teórico",
    pratico: "Prático",
    teorico_pratico: "Teórico/Prático",
  };

  const columns = [
    {
      header: "Data(s)",
      render: (row) => {
        if (row.dates && row.dates.length > 0) {
          return (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              <div>
                <div>{format(new Date(row.dates[0].date), "dd/MM/yyyy")}</div>
                {row.dates.length > 1 && (
                  <span className="text-xs text-slate-500">+{row.dates.length - 1} data(s)</span>
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
          {row.code && <p className="text-xs text-slate-500">{row.code}</p>}
        </div>
      ),
    },
    {
      header: "Tipo",
      render: (row) => <Badge variant="outline">{typeLabels[row.type]}</Badge>,
    },
    {
      header: "Instrutor",
      accessor: "instructor",
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
      render: (row) => (
        <Badge className={statusColors[row.status]}>
          {statusLabels[row.status]}
        </Badge>
      ),
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
                  const enrollUrl = `${window.location.origin}${window.location.pathname}#/PublicEnrollment?training=${row.id}`;
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
                  window.location.href = `#/EnrollmentPage?training=${row.id}`;
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

      <SearchFilter
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por título ou instrutor..."
        filters={[
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

      <DataTable
        columns={columns}
        data={filteredTrainings}
        isLoading={isLoading}
        emptyMessage="Nenhum treinamento cadastrado"
      />

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
          <CertificateManager
            training={selectedTraining}
            participants={participants.filter(p => p.training_id === selectedTraining?.id)}
            onClose={() => {
              setShowCertificates(false);
              setSelectedTraining(null);
            }}
          />
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
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTraining.mutate(deleteConfirm.id)}
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