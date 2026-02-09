import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { format } from "date-fns";
import {
  UserPlus,
  Calendar,
  GraduationCap,
  CheckCircle,
  XCircle,
  Clock,
  Mail
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/common/PageHeader";
import SearchFilter from "@/components/common/SearchFilter";
import DataTable from "@/components/common/DataTable";
import StatsCard from "@/components/dashboard/StatsCard";

export default function Enrolled() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const queryClient = useQueryClient();

  // Get training ID from URL
  const queryString =
    window.location.search || window.location.hash.split("?")[1] || "";
  const urlParams = new URLSearchParams(queryString);
  const trainingId = urlParams.get("training");

  const { data: training, isLoading: trainingLoading } = useQuery({
    queryKey: ["training", trainingId],
    queryFn: async () => {
      if (!trainingId) return null;
      const allTrainings = await dataClient.entities.Training.list();
      return allTrainings.find(t => t.id === trainingId);
    },
    enabled: !!trainingId,
  });

  const { data: allParticipants = [], isLoading } = useQuery({
    queryKey: ["enrolled-participants"],
    queryFn: () => dataClient.entities.TrainingParticipant.list("-enrollment_date"),
  });

  // Filter participants for this specific training
  const participants = trainingId 
    ? allParticipants.filter(p => p.training_id === trainingId)
    : allParticipants;

  const updateEnrollmentStatus = useMutation({
    mutationFn: (/** @type {{ id: any; status: string }} */ payload) =>
      dataClient.entities.TrainingParticipant.update(payload.id, { enrollment_status: payload.status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrolled-participants"] });
    },
  });

  const filteredParticipants = participants.filter((p) => {
    const matchesSearch = 
      p.professional_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.professional_registration?.toLowerCase().includes(search.toLowerCase()) ||
      p.professional_email?.toLowerCase().includes(search.toLowerCase()) ||
      p.training_title?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.enrollment_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalEnrolled = participants.length;
  const confirmedCount = participants.filter(p => p.enrollment_status === "confirmado").length;
  const pendingCount = participants.filter(p => p.enrollment_status === "inscrito").length;

  const statusColors = {
    inscrito: "bg-blue-100 text-blue-700",
    confirmado: "bg-green-100 text-green-700",
    cancelado: "bg-red-100 text-red-700",
  };

  const statusLabels = {
    inscrito: "Inscrito",
    confirmado: "Confirmado",
    cancelado: "Cancelado",
  };

  const columns = [
    {
      header: "Data Inscrição",
      render: (row) => row.enrollment_date ? format(new Date(row.enrollment_date), "dd/MM/yyyy HH:mm") : "-",
      sortType: "date",
    },
    {
      header: "Treinamento",
      accessor: "training_title",
      cellClassName: "font-medium",
      render: (row) => (
        <div>
          <p className="font-medium">{row.training_title || "-"}</p>
          {row.training_date && (
            <p className="text-xs text-slate-500">
              Data: {format(new Date(row.training_date), "dd/MM/yyyy")}
            </p>
          )}
        </div>
      ),
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
      header: "Email",
      accessor: "professional_email",
      render: (row) => (
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-slate-400" />
          <span className="text-sm">{row.professional_email || "-"}</span>
        </div>
      ),
    },
    {
      header: "Setor",
      accessor: "professional_sector",
    },
    {
      header: "Status",
      render: (row) => (
        <Badge className={statusColors[row.enrollment_status]}>
          {statusLabels[row.enrollment_status]}
        </Badge>
      ),
    },
    {
      header: "Ações",
      cellClassName: "text-right",
      sortable: false,
      render: (row) => (
        <div className="flex justify-end gap-2">
          {row.enrollment_status === "inscrito" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  updateEnrollmentStatus.mutate({ id: row.id, status: "confirmado" });
                }}
                className="text-green-600 hover:text-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Confirmar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  updateEnrollmentStatus.mutate({ id: row.id, status: "cancelado" });
                }}
                className="text-red-600 hover:text-red-700"
              >
                <XCircle className="h-4 w-4 mr-1" />
                Cancelar
              </Button>
            </>
          )}
          {row.enrollment_status === "confirmado" && (
            <Badge className="bg-green-100 text-green-700">
              <CheckCircle className="h-3 w-3 mr-1" />
              Confirmado
            </Badge>
          )}
          {row.enrollment_status === "cancelado" && (
            <Badge className="bg-red-100 text-red-700">
              <XCircle className="h-3 w-3 mr-1" />
              Cancelado
            </Badge>
          )}
        </div>
      ),
    },
  ];

  if (trainingId && !training && !trainingLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-lg text-slate-600">Treinamento não encontrado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={training ? `Inscrições - ${training.title}` : "Inscrições"}
        subtitle={training ? `Monitore as inscrições deste treinamento` : "Monitore e gerencie as inscrições nos treinamentos"}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatsCard
          title="Total de Inscrições"
          value={totalEnrolled}
          icon={UserPlus}
          color="blue"
        />
        <StatsCard
          title="Confirmados"
          value={confirmedCount}
          icon={CheckCircle}
          color="green"
        />
        <StatsCard
          title="Pendentes"
          value={pendingCount}
          icon={Clock}
          color="amber"
        />
      </div>

      <SearchFilter
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por nome, matrícula ou email..."
        filters={[
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: "Status",
            allLabel: "Todos os status",
            options: [
              { value: "inscrito", label: "Inscrito" },
              { value: "confirmado", label: "Confirmado" },
              { value: "cancelado", label: "Cancelado" },
            ],
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={filteredParticipants}
        isLoading={isLoading}
        emptyMessage="Nenhuma inscrição registrada"
      />
    </div>
  );
}