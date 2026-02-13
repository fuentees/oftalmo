import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Package,
  GraduationCap,
  Users,
  ArrowDownCircle,
  ArrowUpCircle,
  AlertTriangle,
  ChevronRight,
  Calendar,
  MapPin
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import StatsCard from "@/components/dashboard/StatsCard";
import DataTable from "@/components/common/DataTable";

export default function Dashboard() {
  const [eventTypeFilter, setEventTypeFilter] = useState("all");

  const { data: materials = [], isLoading: loadingMaterials } = useQuery({
    queryKey: ["materials"],
    queryFn: () => dataClient.entities.Material.list(),
  });

  const { data: movements = [], isLoading: loadingMovements } = useQuery({
    queryKey: ["movements"],
    queryFn: () => dataClient.entities.StockMovement.list("-created_at", 10),
  });

  const { data: trainings = [], isLoading: loadingTrainings } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => dataClient.entities.Training.list("-date", 10),
  });

  const { data: participants = [], isLoading: loadingParticipants } = useQuery({
    queryKey: ["dashboard-participants"],
    queryFn: () => dataClient.entities.TrainingParticipant.list(),
  });

  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ["events"],
    queryFn: () => dataClient.entities.Event.list("-start_date"),
  });

  // Calculate stats
  const lowStockItems = materials.filter(
    (m) => m.current_stock && m.minimum_stock && m.current_stock <= m.minimum_stock
  );
  
  const thisMonthTrainings = trainings.filter((t) => {
    const trainingDate = new Date(t.date);
    const now = new Date();
    return trainingDate.getMonth() === now.getMonth() && 
           trainingDate.getFullYear() === now.getFullYear();
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

  const totalTrained = useMemo(() => {
    const unique = [];
    participants.forEach((participant) => {
      if (!participant) return;
      if (unique.some((existing) => isSameParticipant(existing, participant))) return;
      unique.push(participant);
    });
    return unique.length;
  }, [participants]);

  const parseLocalDate = (value) => {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    const text = String(value);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const [, year, month, day] = match;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  };

  const parseTimeToHoursMinutes = (value) => {
    const match = String(value ?? "").trim().match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }
    return { hours, minutes };
  };

  const getEventEndDateTime = (event) => {
    const endDate = parseLocalDate(event?.end_date || event?.start_date);
    if (!endDate) return null;

    const parsedEndTime = parseTimeToHoursMinutes(event?.end_time);
    if (parsedEndTime) {
      endDate.setHours(parsedEndTime.hours, parsedEndTime.minutes, 0, 0);
      return endDate;
    }

    // Sem horário explícito: considera o evento válido até o fim do dia.
    endDate.setHours(23, 59, 59, 999);
    return endDate;
  };

  // Próximos eventos (futuros ou em andamento)
  const upcomingEvents = useMemo(() => {
    const now = new Date();

    const filtered = events.filter((event) => {
      if (event.status === "cancelado" || event.status === "concluido") return false;
      if (eventTypeFilter !== "all" && event.type !== eventTypeFilter) return false;

      const eventEndDateTime = getEventEndDateTime(event);
      if (!eventEndDateTime) return false;
      return eventEndDateTime.getTime() >= now.getTime();
    });

    const groupMap = new Map();
    filtered.forEach((event) => {
      const startDate = parseLocalDate(event.start_date);
      const endDate = parseLocalDate(event.end_date || event.start_date) || startDate;
      if (!startDate) return;

      const namesValue = Array.isArray(event.professional_names)
        ? event.professional_names.join(",")
        : event.professional_names || "";

      const key = [
        normalizeText(event.title),
        event.type || "outro",
        normalizeText(event.location),
        normalizeText(namesValue),
        event.start_time || "",
        event.end_time || "",
      ].join("|");

      const existing = groupMap.get(key);
      if (!existing) {
        groupMap.set(key, {
          ...event,
          startDate,
          endDate,
          occurrences: 1,
        });
        return;
      }

      if (startDate < existing.startDate) existing.startDate = startDate;
      if (endDate > existing.endDate) existing.endDate = endDate;
      existing.occurrences += 1;
    });

    return Array.from(groupMap.values())
      .sort((a, b) => a.startDate - b.startDate)
      .slice(0, 10);
  }, [events, eventTypeFilter]);

  const typeLabels = {
    viagem: "Viagem",
    trabalho_campo: "Trabalho de Campo",
    treinamento: "Treinamento",
    ferias: "Férias",
    reuniao: "Reunião",
    outro: "Outro",
  };

  const eventTypeOptions = [
    { value: "all", label: "Todos os tipos" },
    { value: "treinamento", label: "Treinamento" },
    { value: "ferias", label: "Férias" },
    { value: "reuniao", label: "Reunião" },
    { value: "viagem", label: "Viagem" },
    { value: "trabalho_campo", label: "Trabalho de Campo" },
    { value: "outro", label: "Outro" },
  ];

  const movementColumns = [
    {
      header: "Data",
      accessor: "date",
      render: (row) => format(new Date(row.date), "dd/MM/yyyy"),
    },
    {
      header: "Tipo",
      render: (row) => (
        <Badge variant={row.type === "entrada" ? "default" : "secondary"} className={row.type === "entrada" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
          {row.type === "entrada" ? (
            <ArrowDownCircle className="h-3 w-3 mr-1" />
          ) : (
            <ArrowUpCircle className="h-3 w-3 mr-1" />
          )}
          {row.type}
        </Badge>
      ),
    },
    { header: "Material", accessor: "material_name" },
    { header: "Qtd", accessor: "quantity" },
    { header: "Responsável", accessor: "responsible" },
  ];

  const formatEventRange = (startDate, endDate) => {
    if (!startDate) return "-";
    const startLabel = format(startDate, "dd/MM", { locale: ptBR });
    if (!endDate || endDate.getTime() === startDate.getTime()) return startLabel;
    const endLabel = format(endDate, "dd/MM", { locale: ptBR });
    return `${startLabel} a ${endLabel}`;
  };

  const eventColumns = [
    {
      header: "Evento",
      accessor: "title",
      render: (row) => (
        <div className="flex items-start gap-2 min-w-[180px]">
          <span
            className="mt-1 h-2 w-2 rounded-full"
            style={{ backgroundColor: row.color || "#94a3b8" }}
          />
          <div className="min-w-0">
            <p className="font-medium text-slate-900 truncate">{row.title}</p>
            {row.occurrences > 1 && (
              <p className="text-xs text-slate-500">
                {row.occurrences} registros agrupados
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      header: "Tipo",
      accessor: "type",
      render: (row) => (
        <Badge variant="secondary" className="bg-slate-100 text-slate-700">
          {typeLabels[row.type] || "Outro"}
        </Badge>
      ),
      sortable: false,
    },
    {
      header: "Período",
      accessor: "startDate",
      sortType: "date",
      render: (row) => (
        <div className="flex items-center gap-1 text-sm text-slate-600">
          <Calendar className="h-3 w-3" />
          {formatEventRange(row.startDate, row.endDate)}
        </div>
      ),
    },
    {
      header: "Horário",
      render: (row) => {
        if (!row.start_time && !row.end_time) return "-";
        if (row.start_time && row.end_time) return `${row.start_time} - ${row.end_time}`;
        return row.start_time || row.end_time;
      },
      sortable: false,
    },
    {
      header: "Local",
      accessor: "location",
      render: (row) =>
        row.location ? (
          <div className="flex items-center gap-1 text-xs text-slate-600">
            <MapPin className="h-3 w-3" />
            <span className="truncate max-w-[200px]">{row.location}</span>
          </div>
        ) : (
          "-"
        ),
      sortable: false,
    },
    {
      header: "Profissionais",
      render: (row) => {
        const names = Array.isArray(row.professional_names)
          ? row.professional_names
          : typeof row.professional_names === "string"
          ? row.professional_names.split(",").map((name) => name.trim()).filter(Boolean)
          : [];
        if (!names.length) return "-";
        const preview = names.slice(0, 2).join(", ");
        const extra = names.length > 2 ? ` +${names.length - 2}` : "";
        return (
          <div className="flex items-center gap-1 text-xs text-slate-600">
            <Users className="h-3 w-3 text-slate-400" />
            <span className="truncate max-w-[180px]">{preview}{extra}</span>
          </div>
        );
      },
      sortable: false,
    },
  ];



  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Dashboard</h1>
          <p className="text-slate-600 mt-1">Visão geral do sistema</p>
        </div>
        
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          <Link to={createPageUrl("Schedule?action=create")}>
            <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/30">
              <Calendar className="h-4 w-4 mr-2" />
              Adicionar na Agenda
            </Button>
          </Link>
          <Link to={createPageUrl("Trainings?action=create")}>
            <Button variant="outline" className="border-2 border-purple-200 text-purple-700 hover:bg-purple-50">
              <GraduationCap className="h-4 w-4 mr-2" />
              Novo Treinamento
            </Button>
          </Link>
          <Link to={createPageUrl("Stock?action=create")}>
            <Button variant="outline" className="border-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
              <Package className="h-4 w-4 mr-2" />
              Gerenciar Estoque
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Materiais em Estoque"
          value={materials.length}
          icon={Package}
          color="blue"
        />
        <StatsCard
          title="Estoque Baixo"
          value={lowStockItems.length}
          icon={AlertTriangle}
          color={lowStockItems.length > 0 ? "red" : "green"}
        />
        <StatsCard
          title="Treinamentos/Mês"
          value={thisMonthTrainings.length}
          icon={GraduationCap}
          color="purple"
        />
        <StatsCard
          title="Total de Pessoas Treinadas"
          value={loadingParticipants ? "..." : totalTrained}
          icon={Users}
          color="green"
        />
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 gap-6">
        {/* Próximos eventos em destaque */}
        <Card className="border-slate-200 shadow-lg hover:shadow-xl transition-shadow flex flex-col">
          <CardHeader className="flex flex-col gap-3 pb-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Calendar className="h-4 w-4 text-blue-600" />
                </div>
                Próximos Eventos e Atividades
              </CardTitle>
              <Link
                to={createPageUrl("Schedule")}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center font-medium"
              >
                Ver agenda <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">Filtrar por tipo:</span>
              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger className="h-8 w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {eventTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            <div className="max-h-[32rem] overflow-y-auto">
              <DataTable
                columns={eventColumns}
                data={upcomingEvents}
                isLoading={loadingEvents}
                emptyMessage="Nenhum evento próximo"
              />
            </div>
          </CardContent>
        </Card>
        {/* Recent Movements */}
        <Card className="border-slate-200 shadow-lg hover:shadow-xl transition-shadow flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2 bg-gradient-to-r from-slate-50 to-slate-100 rounded-t-xl">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="h-4 w-4 text-blue-600" />
              </div>
              Últimas Movimentações
            </CardTitle>
            <Link
              to={createPageUrl("Stock")}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center font-medium"
            >
              Ver todas <ChevronRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            <div className="max-h-[32rem] overflow-y-auto">
              <DataTable
                columns={movementColumns}
                data={movements.slice(0, 8)}
                isLoading={loadingMovements}
                emptyMessage="Nenhuma movimentação registrada"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}