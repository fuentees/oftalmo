import React, { useMemo } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Mail, Phone, GraduationCap, CalendarDays, Award } from "lucide-react";
import DataTable from "@/components/common/DataTable";
import TrainingHistory from "./TrainingHistory";
import CertificatesPanel from "./CertificatesPanel";

export default function ProfessionalDetails({ professional, participations, trainings, events }) {
  const normalizeText = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const normalizeEmail = (value) =>
    String(value ?? "").trim().toLowerCase();

  const normalizedName = normalizeText(professional?.name);
  const normalizedEmail = normalizeEmail(professional?.email);

  const matchesName = (value) =>
    normalizedName && normalizeText(value) === normalizedName;

  const matchesEmail = (value) =>
    normalizedEmail && normalizeEmail(value) === normalizedEmail;

  const getTrainingDate = (training) => {
    if (!training) return null;
    if (training.date) return training.date;
    const dates = Array.isArray(training.dates)
      ? training.dates.map((item) => item?.date).filter(Boolean)
      : [];
    if (dates.length === 0) return null;
    const parsed = dates
      .map((date) => new Date(date))
      .filter((date) => !Number.isNaN(date.getTime()));
    if (parsed.length === 0) return null;
    const earliest = new Date(Math.min(...parsed.map((date) => date.getTime())));
    return earliest.toISOString().split("T")[0];
  };

  const trainingEngagements = useMemo(() => {
    const map = new Map();

    (participations || []).forEach((participant) => {
      const key = participant.training_id || `participant-${participant.id}`;
      map.set(key, {
        ...participant,
        roles: participant.roles || [],
        engagement_type: "participant",
      });
    });

    (trainings || []).forEach((training) => {
      if (!training) return;
      const roles = [];

      if (matchesName(training.coordinator) || matchesEmail(training.coordinator_email)) {
        roles.push("Coordenador");
      }
      if (matchesName(training.instructor) || matchesEmail(training.instructor_email)) {
        roles.push("Palestrante");
      }

      const monitors = Array.isArray(training.monitors) ? training.monitors : [];
      const isMonitor = monitors.some((monitor) => {
        if (!monitor) return false;
        if (typeof monitor === "string") return matchesName(monitor);
        return matchesName(monitor.name) || matchesEmail(monitor.email);
      });
      if (isMonitor) roles.push("Monitor");

      if (roles.length === 0) return;

      const key = training.id || training.code || training.title;
      if (!key) return;

      const existing = map.get(key);
      const trainingDate = getTrainingDate(training);
      if (existing) {
        const mergedRoles = new Set([...(existing.roles || []), ...roles]);
        existing.roles = Array.from(mergedRoles);
        if (!existing.training_title && training.title) {
          existing.training_title = training.title;
        }
        if (!existing.training_date && trainingDate) {
          existing.training_date = trainingDate;
        }
        return;
      }

      map.set(key, {
        id: `role-${training.id || training.code || training.title}`,
        training_id: training.id,
        training_title: training.title || "Treinamento",
        training_date: trainingDate,
        roles,
        engagement_type: "role",
      });
    });

    const toTimestamp = (value) => {
      if (!value) return 0;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return 0;
      return parsed.getTime();
    };

    return Array.from(map.values()).sort((a, b) => {
      const aTime = toTimestamp(a.training_date || a.created_date || a.date);
      const bTime = toTimestamp(b.training_date || b.created_date || b.date);
      return bTime - aTime;
    });
  }, [participations, trainings, normalizedName, normalizedEmail]);

  const trainingColumns = [
    {
      header: "Data",
      render: (row) => row.training_date ? format(new Date(row.training_date), "dd/MM/yyyy") : "-",
    },
    { header: "Treinamento", accessor: "training_title", cellClassName: "font-medium" },
    {
      header: "Status",
      render: (row) => {
        const colors = {
          inscrito: "bg-blue-100 text-blue-700",
          confirmado: "bg-green-100 text-green-700",
          cancelado: "bg-red-100 text-red-700",
        };
        return <Badge className={colors[row.enrollment_status]}>{row.enrollment_status}</Badge>;
      },
    },
  ];

  const eventColumns = [
    {
      header: "Data",
      render: (row) => {
        const start = format(new Date(row.start_date), "dd/MM/yyyy");
        const end = row.end_date && row.end_date !== row.start_date 
          ? ` - ${format(new Date(row.end_date), "dd/MM/yyyy")}` 
          : "";
        return start + end;
      },
    },
    { header: "Evento", accessor: "title", cellClassName: "font-medium" },
    {
      header: "Tipo",
      render: (row) => {
        const typeLabels = {
          viagem: "Viagem",
          trabalho_campo: "Trabalho de Campo",
          treinamento: "Treinamento",
          ferias: "Férias",
          reuniao: "Reunião",
          outro: "Outro",
        };
        return typeLabels[row.type] || row.type;
      },
    },
    { header: "Local", accessor: "location" },
    {
      header: "Status",
      render: (row) => {
        const colors = {
          planejado: "bg-slate-100 text-slate-700",
          confirmado: "bg-blue-100 text-blue-700",
          em_andamento: "bg-amber-100 text-amber-700",
          concluido: "bg-green-100 text-green-700",
          cancelado: "bg-red-100 text-red-700",
        };
        const labels = {
          planejado: "Planejado",
          confirmado: "Confirmado",
          em_andamento: "Em Andamento",
          concluido: "Concluído",
          cancelado: "Cancelado",
        };
        return <Badge className={colors[row.status]}>{labels[row.status]}</Badge>;
      },
    },
  ];

  if (!professional) return null;

  return (
    <div className="space-y-6">
      {/* Professional Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Informações Pessoais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-lg bg-blue-50 flex items-center justify-center">
                <User className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-lg">{professional.name}</p>
                {professional.position && (
                  <p className="text-sm text-slate-500">{professional.position}</p>
                )}
              </div>
            </div>

            <div className="space-y-2 text-sm">
              {professional.cpf && (
                <div className="flex justify-between">
                  <span className="text-slate-500">CPF:</span>
                  <span>{professional.cpf}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Trabalho e Contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {professional.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-slate-400" />
                <a href={`mailto:${professional.email}`} className="text-blue-600 hover:underline">
                  {professional.email}
                </a>
              </div>
            )}
            {professional.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-400" />
                <span>{professional.phone}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="text-center py-4">
          <p className="text-3xl font-bold text-purple-600">
            {trainingEngagements.length}
          </p>
          <p className="text-sm text-slate-500">Total de Treinamentos</p>
        </Card>
        <Card className="text-center py-4">
          <p className="text-3xl font-bold text-blue-600">{events?.length || 0}</p>
          <p className="text-sm text-slate-500">Total de Eventos</p>
        </Card>
      </div>

      {/* Tabs for Training History, Certificates, and Events */}
      <Tabs defaultValue="trainings" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="trainings">
            <GraduationCap className="h-4 w-4 mr-2" />
            Treinamentos
          </TabsTrigger>
          <TabsTrigger value="certificates">
            <Award className="h-4 w-4 mr-2" />
            Certificados
          </TabsTrigger>
          <TabsTrigger value="events">
            <CalendarDays className="h-4 w-4 mr-2" />
            Eventos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trainings" className="mt-6">
          <TrainingHistory professional={professional} entries={trainingEngagements} />
        </TabsContent>

        <TabsContent value="certificates" className="mt-6">
          <CertificatesPanel professional={professional} />
        </TabsContent>

        <TabsContent value="events" className="mt-6">
          <Card>
            <CardContent className="p-0">
              <DataTable
                columns={eventColumns}
                data={events || []}
                emptyMessage="Nenhum evento registrado"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}