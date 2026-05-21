import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, subMonths, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  getEffectiveEventStatus as resolveEffectiveEventStatus,
  getEffectiveTrainingStatus,
  getEventDateBounds,
} from "@/lib/statusRules";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
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
import QueryError from "@/components/common/QueryError";

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

  const { data: trainings = [], isLoading: loadingTrainings, isError: trainingsError, refetch: refetchTrainings } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => dataClient.entities.Training.list("-date"),
  });

  const { data: participants = [], isLoading: loadingParticipants } = useQuery({
    queryKey: ["dashboard-participants"],
    queryFn: () => dataClient.entities.TrainingParticipant.list(),
  });

  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ["events"],
    queryFn: () => dataClient.entities.Event.list("-start_date"),
  });

  const currentYear = new Date().getFullYear();

  const getYearFromDateValue = (value) => {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.getFullYear();
    }
    const text = String(value).trim();
    if (!text) return null;
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return Number(match[1]);
    }
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.getFullYear();
  };

  const isTrainingInCurrentYear = (training) => {
    if (!training) return false;
    const mainDateYear = getYearFromDateValue(training.date);
    if (mainDateYear === currentYear) return true;
    const dates = Array.isArray(training.dates) ? training.dates : [];
    return dates.some((item) => {
      const itemDate = typeof item === "object" ? item?.date : item;
      return getYearFromDateValue(itemDate) === currentYear;
    });
  };

  // Calculate stats
  const lowStockItems = materials.filter(
    (m) => m.current_stock && m.minimum_stock && m.current_stock <= m.minimum_stock
  );

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

  const isApprovedParticipantRecord = (participant) => {
    if (!participant) return false;
    const enrollmentStatus = String(participant.enrollment_status || "")
      .trim()
      .toLowerCase();
    if (enrollmentStatus === "cancelado") return false;
    if (participant.certificate_issued === true) return true;
    if (participant.approved === true) return true;
    const numericGrade = Number(participant.grade);
    if (!Number.isFinite(numericGrade)) return false;
    if (numericGrade >= 0 && numericGrade <= 1) {
      return numericGrade * 100 >= 70;
    }
    return numericGrade >= 70;
  };

  const totalTrained = useMemo(() => {
    const trainingsInCurrentYear = trainings.filter(isTrainingInCurrentYear);
    const currentYearTrainingIds = new Set(
      trainingsInCurrentYear
        .map((training) => String(training?.id || "").trim())
        .filter(Boolean)
    );

    const unique = [];
    participants.forEach((participant) => {
      if (!participant) return;
      const trainingId = String(participant.training_id || "").trim();
      const participantTrainingYear = getYearFromDateValue(participant.training_date);
      const isParticipantFromCurrentYear =
        (trainingId && currentYearTrainingIds.has(trainingId)) ||
        participantTrainingYear === currentYear;
      if (!isParticipantFromCurrentYear) return;
      if (!isApprovedParticipantRecord(participant)) return;
      if (unique.some((existing) => isSameParticipant(existing, participant))) return;
      unique.push(participant);
    });
    return unique.length;
  }, [participants, trainings]);

  const trainingsInCurrentYearCount = useMemo(
    () => trainings.filter(isTrainingInCurrentYear).length,
    [trainings]
  );

  const currentYearFieldWorkCount = useMemo(() => {
    return events.filter((event) => {
      if (!event || event.type !== "trabalho_campo") return false;
      if (event.status === "cancelado") return false;
      const startYear = getYearFromDateValue(event.start_date);
      const endYear = getYearFromDateValue(event.end_date || event.start_date);
      return startYear === currentYear || endYear === currentYear;
    }).length;
  }, [events]);

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

  const eventStatusLabels = {
    agendado: "Agendado",
    planejado: "Planejado",
    confirmado: "Confirmado",
    em_andamento: "Em andamento",
    concluido: "Concluído",
    cancelado: "Cancelado",
  };

  const eventStatusColors = {
    agendado: "bg-blue-100 text-blue-700",
    planejado: "bg-blue-100 text-blue-700",
    confirmado: "bg-green-100 text-green-700",
    em_andamento: "bg-amber-100 text-amber-700",
    concluido: "bg-slate-100 text-slate-700",
    cancelado: "bg-red-100 text-red-700",
  };

  // Próximos eventos (futuros ou em andamento)
  const upcomingEvents = useMemo(() => {
    const filtered = events.filter((event) => {
      if (eventTypeFilter !== "all" && event.type !== eventTypeFilter) return false;
      const effectiveStatus = resolveEffectiveEventStatus(event);
      return effectiveStatus !== "cancelado" && effectiveStatus !== "concluido";
    });

    const groupMap = new Map();
    filtered.forEach((event) => {
      const bounds = getEventDateBounds(event);
      const startDate = bounds
        ? new Date(
            bounds.start.getFullYear(),
            bounds.start.getMonth(),
            bounds.start.getDate()
          )
        : parseLocalDate(event.start_date);
      const endDate = bounds
        ? new Date(
            bounds.end.getFullYear(),
            bounds.end.getMonth(),
            bounds.end.getDate()
          )
        : parseLocalDate(event.end_date || event.start_date) || startDate;
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
          effectiveStatus: resolveEffectiveEventStatus(event),
          occurrences: 1,
        });
        return;
      }

      if (startDate < existing.startDate) existing.startDate = startDate;
      if (endDate > existing.endDate) existing.endDate = endDate;
      const incomingStatus = resolveEffectiveEventStatus(event);
      const statusPriority = {
        em_andamento: 3,
        confirmado: 2,
        planejado: 1,
        agendado: 1,
      };
      const currentPriority = statusPriority[existing.effectiveStatus] || 0;
      const incomingPriority = statusPriority[incomingStatus] || 0;
      if (incomingPriority > currentPriority) {
        existing.effectiveStatus = incomingStatus;
      }
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

  // ── Dados para os gráficos de evolução ──────────────────────────────────

  // 1. Inscrições por mês (últimos 6 meses)
  const last6Months = useMemo(() => {
    const today = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const date = startOfMonth(subMonths(today, 5 - i));
      return {
        key: format(date, "yyyy-MM"),
        label: format(date, "MMM/yy", { locale: ptBR }),
        count: 0,
      };
    });

    const keySet = new Set(months.map((m) => m.key));
    participants.forEach((p) => {
      if (!p?.enrollment_date) return;
      const text = String(p.enrollment_date).trim();
      const match = text.match(/^(\d{4})-(\d{2})/);
      if (!match) return;
      const key = `${match[1]}-${match[2]}`;
      if (!keySet.has(key)) return;
      const entry = months.find((m) => m.key === key);
      if (entry) entry.count += 1;
    });

    return months;
  }, [participants]);

  // 2. Treinamentos por status efetivo
  const trainingsByStatus = useMemo(() => {
    const statusLabels = {
      agendado: "Agendado",
      confirmado: "Confirmado",
      em_andamento: "Em andamento",
      concluido: "Concluído",
      cancelado: "Cancelado",
    };
    const counts = {};
    trainings.forEach((t) => {
      const status = getEffectiveTrainingStatus(t);
      counts[status] = (counts[status] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([status, count]) => ({
        status,
        label: statusLabels[status] || status,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [trainings]);

  const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#6366f1", "#ef4444"];

  // 3. Top 5 municípios com mais inscritos
  const topMunicipalities = useMemo(() => {
    const counts = {};
    participants.forEach((p) => {
      const mun = String(p?.municipality || "").trim();
      if (!mun) return;
      counts[mun] = (counts[mun] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([municipality, count]) => ({ municipality, count }));
  }, [participants]);

  // ────────────────────────────────────────────────────────────────────────

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
      header: "Status",
      render: (row) => {
        const status = row.effectiveStatus || "planejado";
        return (
          <Badge className={eventStatusColors[status] || eventStatusColors.planejado}>
            {eventStatusLabels[status] || eventStatusLabels.planejado}
          </Badge>
        );
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
      {trainingsError && <QueryError message="Erro ao carregar dados dos treinamentos." onRetry={refetchTrainings} />}

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
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
          title="Treinamentos (Ano Atual)"
          value={loadingTrainings ? "..." : trainingsInCurrentYearCount}
          icon={GraduationCap}
          color="purple"
        />
        <StatsCard
          title="Pessoas Aprovadas (Ano Atual)"
          value={loadingParticipants || loadingTrainings ? "..." : totalTrained}
          icon={Users}
          color="green"
        />
        <StatsCard
          title="Trabalho de Campo (Ano Atual)"
          value={loadingEvents ? "..." : currentYearFieldWorkCount}
          icon={MapPin}
          color="amber"
        />
      </div>

      {/* Seção Evolução */}
      <div>
        <h2 className="text-lg font-semibold text-slate-700 mb-4">Evolução</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Gráfico: Inscrições por mês */}
          <Card className="border-slate-200 shadow-md col-span-1 lg:col-span-2">
            <CardHeader className="pb-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <div className="p-1.5 bg-blue-100 rounded-lg">
                  <Users className="h-3.5 w-3.5 text-blue-600" />
                </div>
                Inscrições por Mês (últimos 6 meses)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 pb-2">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={last6Months} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => [value, "Inscrições"]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="count" name="Inscrições" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Gráfico: Treinamentos por status */}
          <Card className="border-slate-200 shadow-md">
            <CardHeader className="pb-2 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-t-xl">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <div className="p-1.5 bg-purple-100 rounded-lg">
                  <GraduationCap className="h-3.5 w-3.5 text-purple-600" />
                </div>
                Treinamentos por Status
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 pb-2 flex flex-col items-center">
              {trainingsByStatus.length === 0 ? (
                <p className="text-sm text-slate-400 mt-8">Nenhum dado</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={trainingsByStatus}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius={65}
                        innerRadius={32}
                      >
                        {trainingsByStatus.map((entry, index) => (
                          <Cell key={entry.status} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [value, name]}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
                    {trainingsByStatus.map((entry, index) => (
                      <li key={entry.status} className="flex items-center gap-1 text-xs text-slate-600">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                        />
                        {entry.label} ({entry.count})
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          {/* Top 5 municípios */}
          <Card className="border-slate-200 shadow-md col-span-1 lg:col-span-3">
            <CardHeader className="pb-2 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-t-xl">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <div className="p-1.5 bg-emerald-100 rounded-lg">
                  <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                Top 5 Municípios com Mais Inscritos
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 pb-3">
              {topMunicipalities.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum dado disponível</p>
              ) : (
                <ol className="space-y-2">
                  {topMunicipalities.map((item, index) => {
                    const maxCount = topMunicipalities[0].count;
                    const pct = Math.round((item.count / maxCount) * 100);
                    return (
                      <li key={item.municipality} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-400 w-4 text-right">{index + 1}</span>
                        <span className="text-sm text-slate-700 w-40 truncate">{item.municipality}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="h-2.5 rounded-full bg-emerald-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-slate-600 w-10 text-right">
                          {item.count}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>

        </div>
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