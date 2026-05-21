import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import {
  format,
  addMonths,
  differenceInDays,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  subMonths,
  isFuture,
  isPast,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import {
  FileText,
  Download,
  AlertTriangle,
  TrendingUp,
  Users,
  Award,
  Calendar,
  MapPin,
  GraduationCap,
  Package,
  Activity,
  ShieldCheck,
  Building2,
} from "lucide-react";
import { getEffectiveTrainingStatus } from "@/lib/statusRules";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import QueryError from "@/components/common/QueryError";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#84cc16",
];

const StatCard = ({ title, value, icon: Icon, iconColor, valueColor }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium text-slate-600">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="flex items-center justify-between">
        <span className={`text-3xl font-bold ${valueColor || ""}`}>{value}</span>
        {Icon && <Icon className={`h-8 w-8 ${iconColor || "text-slate-400"}`} />}
      </div>
    </CardContent>
  </Card>
);

export default function Reports() {
  const [periodFilter, setPeriodFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const toValidDate = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  // === Queries ===
  const {
    data: participants = [],
    isError: participantsError,
    refetch: refetchParticipants,
  } = useQuery({
    queryKey: ["participants"],
    queryFn: () => dataClient.entities.TrainingParticipant.list(),
  });

  const { data: trainings = [] } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => dataClient.entities.Training.list(),
  });

  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => dataClient.entities.Professional.list(),
  });

  const { data: materials = [] } = useQuery({
    queryKey: ["materials"],
    queryFn: () => dataClient.entities.Material.list(),
  });

  const { data: stockMovements = [] } = useQuery({
    queryKey: ["stockMovements"],
    queryFn: () => dataClient.entities.StockMovement.list(),
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: () => dataClient.entities.Event.list(),
  });

  // === Date range ===
  const getDateRange = () => {
    const now = new Date();
    switch (periodFilter) {
      case "month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "3months":
        return { start: addMonths(now, -3), end: now };
      case "6months":
        return { start: addMonths(now, -6), end: now };
      case "year":
        return { start: addMonths(now, -12), end: now };
      case "custom":
        return {
          start: customStartDate ? new Date(customStartDate) : null,
          end: customEndDate ? new Date(customEndDate) : null,
        };
      default:
        return { start: null, end: null };
    }
  };

  const dateRange = getDateRange();

  // === Filtered training data ===
  const filteredParticipants = useMemo(
    () =>
      participants.filter((p) => {
        if (sectorFilter !== "all" && p.professional_sector !== sectorFilter) return false;
        if (dateRange.start && dateRange.end && p.enrollment_date) {
          const enrollDate = new Date(p.enrollment_date);
          if (!isWithinInterval(enrollDate, { start: dateRange.start, end: dateRange.end }))
            return false;
        }
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [participants, sectorFilter, periodFilter, customStartDate, customEndDate]
  );

  const filteredTrainings = useMemo(
    () =>
      trainings.filter((t) => {
        if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
        if (
          dateRange.start &&
          dateRange.end &&
          Array.isArray(t.dates) &&
          t.dates.length > 0
        ) {
          const trainingDate = toValidDate(t.dates[0]?.date);
          if (
            trainingDate &&
            !isWithinInterval(trainingDate, { start: dateRange.start, end: dateRange.end })
          )
            return false;
        }
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trainings, categoryFilter, periodFilter, customStartDate, customEndDate]
  );

  // === Training computed ===
  const expiredTrainings = useMemo(
    () =>
      filteredParticipants.filter((p) => {
        if (!p.validity_date || !p.approved) return false;
        return differenceInDays(new Date(p.validity_date), new Date()) <= 30;
      }),
    [filteredParticipants]
  );

  const criticalExpired = useMemo(
    () =>
      expiredTrainings.filter(
        (p) => differenceInDays(new Date(p.validity_date), new Date()) < 0
      ),
    [expiredTrainings]
  );

  const approvedCount = filteredParticipants.filter((p) => p.approved).length;
  const approvalRate =
    filteredParticipants.length > 0
      ? Math.round((approvedCount / filteredParticipants.length) * 100)
      : 0;

  // === Professional computed ===
  const sectorStats = useMemo(() => {
    const acc = {};
    professionals.forEach((prof) => {
      const sector = prof.sector || "Sem setor";
      if (!acc[sector]) acc[sector] = { sector, total: 0, trained: 0, approved: 0 };
      acc[sector].total++;
      const profTrainings = participants.filter((p) => p.professional_id === prof.id);
      if (profTrainings.length > 0) acc[sector].trained++;
      if (profTrainings.some((p) => p.approved)) acc[sector].approved++;
    });
    return Object.values(acc);
  }, [professionals, participants]);

  const complianceData = useMemo(
    () =>
      professionals
        .filter((prof) => sectorFilter === "all" || prof.sector === sectorFilter)
        .map((prof) => {
          const profParticipants = filteredParticipants.filter(
            (p) => p.professional_id === prof.id && p.approved
          );
          const validTrainings = profParticipants.filter(
            (p) => !p.validity_date || new Date(p.validity_date) > new Date()
          );
          return {
            professional_name: prof.name,
            sector: prof.sector || "—",
            total_trainings: profParticipants.length,
            valid_trainings: validTrainings.length,
            expired_trainings: profParticipants.length - validTrainings.length,
            compliance:
              profParticipants.length > 0
                ? Math.round((validTrainings.length / profParticipants.length) * 100)
                : 0,
          };
        })
        .sort((a, b) => a.compliance - b.compliance),
    [professionals, filteredParticipants, sectorFilter]
  );

  const avgCompliance =
    complianceData.length > 0
      ? Math.round(
          complianceData.reduce((s, i) => s + i.compliance, 0) / complianceData.length
        )
      : 0;

  // === Material computed ===
  const getMatStock = (m) => Number(m.current_stock ?? 0);
  const getMatMin = (m) => Number(m.minimum_stock ?? 0);

  const lowStockMaterials = useMemo(
    () =>
      materials.filter((m) => {
        const min = getMatMin(m);
        return min > 0 && getMatStock(m) <= min;
      }),
    [materials]
  );

  const esgotadoCount = useMemo(
    () => materials.filter((m) => getMatStock(m) <= 0 && getMatMin(m) > 0).length,
    [materials]
  );

  const recentMovements = useMemo(
    () =>
      [...stockMovements]
        .sort(
          (a, b) =>
            new Date(b.date ?? b.created_at ?? 0) - new Date(a.date ?? a.created_at ?? 0)
        )
        .slice(0, 25),
    [stockMovements]
  );

  // === Events computed ===
  const now = new Date();

  const upcomingEvents = useMemo(
    () =>
      events
        .filter((e) => {
          const d = toValidDate(e.start_date ?? e.date);
          return d && d >= now;
        })
        .sort(
          (a, b) =>
            new Date(a.start_date ?? a.date) - new Date(b.start_date ?? b.date)
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events]
  );

  const pastEventsCount = useMemo(
    () =>
      events.filter((e) => {
        const d = toValidDate(e.start_date ?? e.date);
        return d && d < now;
      }).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events]
  );

  const eventsByType = useMemo(() => {
    const acc = {};
    events.forEach((e) => {
      const type = e.type ?? "Sem tipo";
      acc[type] = (acc[type] || 0) + 1;
    });
    return Object.entries(acc)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [events]);

  // === Misc ===
  const sectors = [...new Set(professionals.map((p) => p.sector).filter(Boolean))];
  const categories = ["NR", "tecnico", "comportamental", "integracao", "reciclagem", "outros"];

  // === Exports ===
  const exportToPDF = () => {
    const pdf = new jsPDF("p", "mm", "a4");

    pdf.setFontSize(18);
    pdf.text("Relatório Gerencial", 15, 20);
    pdf.setFontSize(10);
    pdf.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 15, 28);

    let y = 40;

    const section = (title) => {
      if (y > 258) {
        pdf.addPage();
        y = 20;
      }
      pdf.setFontSize(13);
      pdf.setFont(undefined, "bold");
      pdf.text(title, 15, y);
      y += 8;
      pdf.setFontSize(9);
      pdf.setFont(undefined, "normal");
    };

    const line = (text) => {
      if (y > 280) {
        pdf.addPage();
        y = 20;
      }
      pdf.text(String(text), 20, y);
      y += 5;
    };

    section("Treinamentos");
    line(`Total: ${filteredTrainings.length}`);
    line(`Participações: ${filteredParticipants.length}`);
    line(`Aprovados: ${approvedCount} (${approvalRate}%)`);
    line(`Vencendo em 30 dias: ${expiredTrainings.length}`);
    line(`Vencidos: ${criticalExpired.length}`);

    y += 3;
    section("Profissionais");
    line(`Total cadastrados: ${professionals.length}`);
    line(`Setores ativos: ${sectors.length}`);
    line(`Compliance médio: ${avgCompliance}%`);

    y += 3;
    section("Estoque");
    line(`Materiais cadastrados: ${materials.length}`);
    line(`Estoque baixo / esgotado: ${lowStockMaterials.length}`);
    line(`Total de movimentações: ${stockMovements.length}`);

    y += 3;
    section("Agenda");
    line(`Próximos eventos: ${upcomingEvents.length}`);
    line(`Eventos realizados: ${pastEventsCount}`);

    y += 3;
    section("Compliance por Profissional");
    complianceData.slice(0, 20).forEach((item) => {
      line(
        `${item.professional_name} (${item.sector}): ${item.compliance}% — ${item.valid_trainings}/${item.total_trainings} válidos`
      );
    });

    if (lowStockMaterials.length > 0) {
      y += 3;
      section("Materiais com Estoque Baixo");
      lowStockMaterials.forEach((m) => {
        line(`${m.name}: ${getMatStock(m)} ${m.unit || ""} (mínimo: ${getMatMin(m)})`);
      });
    }

    pdf.save(`relatorio-gerencial-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  const exportToCSV = () => {
    const rows = [
      ["Profissional", "Setor", "Total Treinamentos", "Válidos", "Vencidos", "Compliance %"],
      ...complianceData.map((item) => [
        item.professional_name,
        item.sector,
        item.total_trainings,
        item.valid_trainings,
        item.expired_trainings,
        item.compliance,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // === Column definitions ===
  const expiredColumns = [
    { header: "Profissional", accessor: "professional_name", cellClassName: "font-medium" },
    { header: "Treinamento", accessor: "training_title" },
    {
      header: "Validade",
      render: (row) => {
        const daysUntil = differenceInDays(new Date(row.validity_date), new Date());
        return (
          <div className="flex items-center gap-2">
            <span>{format(new Date(row.validity_date), "dd/MM/yyyy")}</span>
            {daysUntil < 0 ? (
              <Badge className="bg-red-100 text-red-700">Vencido</Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-700">{daysUntil}d</Badge>
            )}
          </div>
        );
      },
    },
    { header: "Setor", accessor: "professional_sector" },
  ];

  const complianceColumns = [
    { header: "Profissional", accessor: "professional_name", cellClassName: "font-medium" },
    { header: "Setor", accessor: "sector" },
    { header: "Total", accessor: "total_trainings" },
    {
      header: "Válidos",
      render: (row) => (
        <span className="text-green-600 font-medium">{row.valid_trainings}</span>
      ),
    },
    {
      header: "Vencidos",
      render: (row) => (
        <span className="text-red-600 font-medium">{row.expired_trainings}</span>
      ),
    },
    {
      header: "Compliance",
      render: (row) => {
        const color =
          row.compliance >= 80
            ? "bg-green-100 text-green-700"
            : row.compliance >= 50
            ? "bg-amber-100 text-amber-700"
            : "bg-red-100 text-red-700";
        return <Badge className={color}>{row.compliance}%</Badge>;
      },
    },
  ];

  const materialColumns = [
    {
      header: "Material",
      render: (row) => row.name ?? "—",
      cellClassName: "font-medium",
    },
    { header: "Categoria", render: (row) => row.category ?? "—" },
    {
      header: "Unidade",
      render: (row) => row.unit ?? "—",
    },
    {
      header: "Estoque Atual",
      render: (row) => {
        const current = getMatStock(row);
        const min = getMatMin(row);
        const isLow = min > 0 && current <= min;
        return (
          <span className={isLow ? "text-red-600 font-bold" : "text-green-700 font-medium"}>
            {current}
          </span>
        );
      },
    },
    {
      header: "Mínimo",
      render: (row) => getMatMin(row) || "—",
    },
    {
      header: "Status",
      render: (row) => {
        const current = getMatStock(row);
        const min = getMatMin(row);
        if (!min) return <Badge className="bg-slate-100 text-slate-600">—</Badge>;
        if (current <= 0) return <Badge className="bg-red-100 text-red-700">Esgotado</Badge>;
        if (current <= min) return <Badge className="bg-amber-100 text-amber-700">Baixo</Badge>;
        return <Badge className="bg-green-100 text-green-700">OK</Badge>;
      },
    },
  ];

  const movementColumns = [
    {
      header: "Data",
      render: (row) => {
        const d = toValidDate(row.date ?? row.created_at);
        return d ? format(d, "dd/MM/yyyy") : "—";
      },
    },
    { header: "Material", accessor: "material_name", cellClassName: "font-medium" },
    {
      header: "Tipo",
      render: (row) => {
        const isEntry = String(row.type ?? "").toLowerCase() === "entrada";
        return (
          <Badge
            className={
              isEntry ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            }
          >
            {isEntry ? "Entrada" : "Saída"}
          </Badge>
        );
      },
    },
    {
      header: "Quantidade",
      render: (row) => `${row.quantity ?? "—"} ${row.unit ?? ""}`.trim(),
    },
    { header: "Responsável", render: (row) => row.responsible ?? "—" },
    { header: "Obs.", render: (row) => row.notes ?? "—" },
  ];

  return (
    <div className="space-y-6">
      {participantsError && (
        <QueryError message="Erro ao carregar dados dos relatórios." onRetry={refetchParticipants} />
      )}

      <PageHeader
        title="Relatórios"
        subtitle="Painel do gestor — análises e indicadores de todo o projeto"
      />

      {/* Filters + Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros e Exportação</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label>Período</Label>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="month">Este Mês</SelectItem>
                  <SelectItem value="3months">Últimos 3 Meses</SelectItem>
                  <SelectItem value="6months">Últimos 6 Meses</SelectItem>
                  <SelectItem value="year">Último Ano</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {periodFilter === "custom" && (
              <>
                <div>
                  <Label>Data Inicial</Label>
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Data Final</Label>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                  />
                </div>
              </>
            )}

            <div>
              <Label>Setor</Label>
              <Select value={sectorFilter} onValueChange={setSectorFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {sectors.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Categoria de Treinamento</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button onClick={exportToPDF} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Exportar PDF
            </Button>
            <Button onClick={exportToCSV} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Critical Alerts */}
      {(criticalExpired.length > 0 || lowStockMaterials.length > 0) && (
        <div className="space-y-2">
          {criticalExpired.length > 0 && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                <strong>{criticalExpired.length} treinamento(s) vencido(s)</strong> requerem
                atenção imediata!
              </AlertDescription>
            </Alert>
          )}
          {lowStockMaterials.length > 0 && (
            <Alert className="border-amber-200 bg-amber-50">
              <Package className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                <strong>{lowStockMaterials.length} material(is) com estoque baixo ou esgotado</strong>{" "}
                — verifique o almoxarifado.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <Tabs defaultValue="geral" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="geral">Visão Geral</TabsTrigger>
          <TabsTrigger value="treinamentos">Treinamentos</TabsTrigger>
          <TabsTrigger value="profissionais">Profissionais</TabsTrigger>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
        </TabsList>

        {/* ===================== VISÃO GERAL ===================== */}
        <TabsContent value="geral" className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              title="Treinamentos"
              value={filteredTrainings.length}
              icon={FileText}
              iconColor="text-blue-500"
            />
            <StatCard
              title="Aprovados"
              value={approvedCount}
              icon={Award}
              iconColor="text-green-500"
            />
            <StatCard
              title="Taxa de Aprovação"
              value={`${approvalRate}%`}
              icon={ShieldCheck}
              iconColor="text-purple-500"
            />
            <StatCard
              title="Vencendo (30d)"
              value={expiredTrainings.length}
              icon={AlertTriangle}
              iconColor="text-amber-500"
              valueColor={expiredTrainings.length > 0 ? "text-amber-600" : ""}
            />
            <StatCard
              title="Profissionais"
              value={professionals.length}
              icon={GraduationCap}
              iconColor="text-indigo-500"
            />
            <StatCard
              title="Compliance Médio"
              value={`${avgCompliance}%`}
              icon={ShieldCheck}
              iconColor="text-teal-500"
            />
            <StatCard
              title="Materiais"
              value={materials.length}
              icon={Package}
              iconColor="text-orange-500"
            />
            <StatCard
              title="Estoque Crítico"
              value={lowStockMaterials.length}
              icon={AlertTriangle}
              iconColor="text-red-500"
              valueColor={lowStockMaterials.length > 0 ? "text-red-600" : ""}
            />
          </div>

          {/* Overview charts */}
          {(() => {
            const today = new Date();
            const months = Array.from({ length: 6 }, (_, i) => {
              const date = startOfMonth(subMonths(today, 5 - i));
              return {
                key: format(date, "yyyy-MM"),
                label: format(date, "MMM/yy", { locale: ptBR }),
                aprovados: 0,
                inscritos: 0,
              };
            });
            participants.forEach((p) => {
              if (!p?.enrollment_date) return;
              const match = String(p.enrollment_date).match(/^(\d{4})-(\d{2})/);
              if (!match) return;
              const key = `${match[1]}-${match[2]}`;
              const entry = months.find((m) => m.key === key);
              if (!entry) return;
              entry.inscritos += 1;
              if (p.approved) entry.aprovados += 1;
            });

            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-blue-600" />
                      Aprovados por Mês (últimos 6 meses)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={months} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          formatter={(v, name) => [v, name]}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar
                          dataKey="inscritos"
                          name="Inscritos"
                          fill="#cbd5e1"
                          radius={[3, 3, 0, 0]}
                        />
                        <Bar
                          dataKey="aprovados"
                          name="Aprovados"
                          fill="#10b981"
                          radius={[3, 3, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-indigo-600" />
                      Participação por Setor
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={sectorStats} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="sector" tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="total" fill="#94a3b8" name="Total" radius={[2, 2, 0, 0]} />
                        <Bar
                          dataKey="trained"
                          fill="#3b82f6"
                          name="Treinados"
                          radius={[2, 2, 0, 0]}
                        />
                        <Bar
                          dataKey="approved"
                          fill="#10b981"
                          name="Aprovados"
                          radius={[2, 2, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          {/* Próximos eventos resumo */}
          {upcomingEvents.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-indigo-600" />
                  Próximos Eventos ({upcomingEvents.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-slate-100">
                  {upcomingEvents.slice(0, 5).map((e, idx) => {
                    const d = toValidDate(e.start_date ?? e.date);
                    const daysUntil = d ? differenceInDays(d, new Date()) : null;
                    return (
                      <li key={e.id ?? idx} className="py-2 flex items-center justify-between gap-4">
                        <span className="text-sm font-medium text-slate-700 truncate">
                          {e.title ?? "Evento"}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm text-slate-500">
                            {d ? format(d, "dd/MM/yyyy") : "—"}
                          </span>
                          {daysUntil !== null && (
                            <Badge
                              className={
                                daysUntil <= 7
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-blue-100 text-blue-700"
                              }
                            >
                              {daysUntil === 0 ? "Hoje" : `${daysUntil}d`}
                            </Badge>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===================== TREINAMENTOS ===================== */}
        <TabsContent value="treinamentos" className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              title="Treinamentos"
              value={filteredTrainings.length}
              icon={FileText}
              iconColor="text-blue-500"
            />
            <StatCard
              title="Aprovados"
              value={approvedCount}
              icon={Award}
              iconColor="text-green-500"
            />
            <StatCard
              title="Taxa de Aprovação"
              value={`${approvalRate}%`}
              icon={ShieldCheck}
              iconColor="text-purple-500"
            />
            <StatCard
              title="Vencendo (30d)"
              value={expiredTrainings.length}
              icon={AlertTriangle}
              iconColor="text-amber-500"
              valueColor={expiredTrainings.length > 0 ? "text-amber-600" : ""}
            />
          </div>

          {/* Evolução charts */}
          {(() => {
            const today = new Date();
            const months = Array.from({ length: 6 }, (_, i) => {
              const date = startOfMonth(subMonths(today, 5 - i));
              return {
                key: format(date, "yyyy-MM"),
                label: format(date, "MMM/yy", { locale: ptBR }),
                aprovados: 0,
                inscritos: 0,
              };
            });
            participants.forEach((p) => {
              if (!p?.enrollment_date) return;
              const match = String(p.enrollment_date).match(/^(\d{4})-(\d{2})/);
              if (!match) return;
              const key = `${match[1]}-${match[2]}`;
              const entry = months.find((m) => m.key === key);
              if (!entry) return;
              entry.inscritos += 1;
              if (p.approved) entry.aprovados += 1;
            });
            trainings.forEach((t) => {
              if (!Array.isArray(t.dates) || t.dates.length === 0) return;
              const d = toValidDate(t.dates[0]?.date);
              if (!d) return;
              const key = format(d, "yyyy-MM");
              const entry = months.find((m) => m.key === key);
              if (entry) entry.treinamentos = (entry.treinamentos || 0) + 1;
            });

            const statusLabels = {
              agendado: "Agendado",
              confirmado: "Confirmado",
              em_andamento: "Em andamento",
              concluido: "Concluído",
              cancelado: "Cancelado",
            };
            const statusCounts = {};
            trainings.forEach((t) => {
              const s = getEffectiveTrainingStatus(t);
              statusCounts[s] = (statusCounts[s] || 0) + 1;
            });
            const byStatus = Object.entries(statusCounts)
              .map(([status, count]) => ({
                status,
                label: statusLabels[status] || status,
                count,
              }))
              .sort((a, b) => b.count - a.count);

            const munCounts = {};
            participants.forEach((p) => {
              if (!p.approved) return;
              const mun = String(p?.municipality || "").trim();
              if (!mun) return;
              munCounts[mun] = (munCounts[mun] || 0) + 1;
            });
            const topMun = Object.entries(munCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([municipality, count]) => ({ municipality, count }));

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <Card className="col-span-1 lg:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-blue-600" />
                        Aprovados por Mês (6 meses)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={months} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar
                            dataKey="inscritos"
                            name="Inscritos"
                            fill="#cbd5e1"
                            radius={[3, 3, 0, 0]}
                          />
                          <Bar
                            dataKey="aprovados"
                            name="Aprovados"
                            fill="#10b981"
                            radius={[3, 3, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <GraduationCap className="h-4 w-4 text-purple-600" />
                        Por Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center">
                      {byStatus.length === 0 ? (
                        <p className="text-sm text-slate-400 mt-8">Sem dados</p>
                      ) : (
                        <>
                          <ResponsiveContainer width="100%" height={160}>
                            <PieChart>
                              <Pie
                                data={byStatus}
                                dataKey="count"
                                nameKey="label"
                                cx="50%"
                                cy="50%"
                                outerRadius={65}
                                innerRadius={32}
                              >
                                {byStatus.map((entry, i) => (
                                  <Cell
                                    key={entry.status}
                                    fill={COLORS[i % COLORS.length]}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(v, n) => [v, n]}
                                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2">
                            {byStatus.map((entry, i) => (
                              <li
                                key={entry.status}
                                className="flex items-center gap-1 text-xs text-slate-600"
                              >
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                                />
                                {entry.label} ({entry.count})
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-emerald-600" />
                      Top 5 Municípios com Mais Aprovados
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {topMun.length === 0 ? (
                      <p className="text-sm text-slate-400">Nenhum dado disponível</p>
                    ) : (
                      <ol className="space-y-3">
                        {topMun.map((item, index) => {
                          const pct = Math.round((item.count / topMun[0].count) * 100);
                          return (
                            <li key={item.municipality} className="flex items-center gap-3">
                              <span className="text-xs font-bold text-slate-400 w-4 text-right">
                                {index + 1}
                              </span>
                              <span className="text-sm text-slate-700 w-48 truncate">
                                {item.municipality}
                              </span>
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
            );
          })()}

          {/* Vencimentos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Vencidos ou Próximos ao Vencimento
                {expiredTrainings.length > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 ml-2">
                    {expiredTrainings.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={expiredColumns}
                data={expiredTrainings}
                emptyMessage="Nenhum treinamento próximo ao vencimento"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== PROFISSIONAIS ===================== */}
        <TabsContent value="profissionais" className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              title="Total de Profissionais"
              value={professionals.length}
              icon={Users}
              iconColor="text-blue-500"
            />
            <StatCard
              title="Setores Ativos"
              value={sectors.length}
              icon={Building2}
              iconColor="text-indigo-500"
            />
            <StatCard
              title="Compliance Médio"
              value={`${avgCompliance}%`}
              icon={ShieldCheck}
              iconColor="text-green-500"
            />
            <StatCard
              title="Vencimentos Críticos"
              value={criticalExpired.length}
              icon={AlertTriangle}
              iconColor="text-red-500"
              valueColor={criticalExpired.length > 0 ? "text-red-600" : ""}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Participação por Setor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sectorStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="sector" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total" fill="#94a3b8" name="Total" />
                  <Bar dataKey="trained" fill="#3b82f6" name="Treinados" />
                  <Bar dataKey="approved" fill="#10b981" name="Aprovados" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Compliance por Profissional
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={complianceColumns}
                data={complianceData}
                emptyMessage="Nenhum dado disponível"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== ESTOQUE ===================== */}
        <TabsContent value="estoque" className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              title="Materiais Cadastrados"
              value={materials.length}
              icon={Package}
              iconColor="text-blue-500"
            />
            <StatCard
              title="Estoque Baixo"
              value={lowStockMaterials.length}
              icon={AlertTriangle}
              iconColor="text-amber-500"
              valueColor={lowStockMaterials.length > 0 ? "text-amber-600" : ""}
            />
            <StatCard
              title="Esgotados"
              value={esgotadoCount}
              icon={AlertTriangle}
              iconColor="text-red-500"
              valueColor={esgotadoCount > 0 ? "text-red-600" : ""}
            />
            <StatCard
              title="Movimentações"
              value={stockMovements.length}
              icon={Activity}
              iconColor="text-green-500"
            />
          </div>

          {lowStockMaterials.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="h-5 w-5" />
                  Materiais com Estoque Baixo ou Esgotado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={materialColumns}
                  data={lowStockMaterials}
                  emptyMessage="Todos os estoques em nível adequado"
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Inventário de Materiais
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={materialColumns}
                data={materials}
                emptyMessage="Nenhum material cadastrado"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Movimentações Recentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={movementColumns}
                data={recentMovements}
                emptyMessage="Nenhuma movimentação registrada"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== AGENDA ===================== */}
        <TabsContent value="agenda" className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard
              title="Total de Eventos"
              value={events.length}
              icon={Calendar}
              iconColor="text-blue-500"
            />
            <StatCard
              title="Próximos"
              value={upcomingEvents.length}
              icon={TrendingUp}
              iconColor="text-green-500"
            />
            <StatCard
              title="Realizados"
              value={pastEventsCount}
              icon={Award}
              iconColor="text-purple-500"
            />
          </div>

          {events.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Nenhum evento cadastrado</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {upcomingEvents.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      Próximos Eventos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y divide-slate-100">
                      {upcomingEvents.map((e, idx) => {
                        const d = toValidDate(e.start_date ?? e.date);
                        const endD = toValidDate(e.end_date);
                        const daysUntil = d ? differenceInDays(d, new Date()) : null;
                        return (
                          <li
                            key={e.id ?? idx}
                            className="py-3 flex items-start justify-between gap-4"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-800 truncate">
                                {e.title ?? "Evento"}
                              </p>
                              {(e.location ?? e.address) && (
                                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                  <MapPin className="h-3 w-3" />
                                  {e.location ?? e.address}
                                </p>
                              )}
                              {e.type && (
                                <Badge className="mt-1 text-xs bg-slate-100 text-slate-600">
                                  {e.type}
                                </Badge>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-medium text-slate-700">
                                {d ? format(d, "dd/MM/yyyy") : "—"}
                              </p>
                              {endD && (
                                <p className="text-xs text-slate-400">
                                  até {format(endD, "dd/MM/yyyy")}
                                </p>
                              )}
                              {daysUntil !== null && (
                                <Badge
                                  className={`mt-1 text-xs ${
                                    daysUntil === 0
                                      ? "bg-green-100 text-green-700"
                                      : daysUntil <= 7
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-blue-100 text-blue-700"
                                  }`}
                                >
                                  {daysUntil === 0 ? "Hoje" : `em ${daysUntil}d`}
                                </Badge>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {eventsByType.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4 text-purple-600" />
                      Eventos por Tipo
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie
                            data={eventsByType}
                            dataKey="count"
                            nameKey="type"
                            cx="50%"
                            cy="50%"
                            outerRadius={70}
                            innerRadius={30}
                          >
                            {eventsByType.map((entry, i) => (
                              <Cell key={entry.type} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(v, n) => [v, n]}
                            contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <ul className="flex flex-col justify-center gap-2">
                        {eventsByType.map((item, i) => (
                          <li key={item.type} className="flex items-center gap-2 text-sm">
                            <span
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: COLORS[i % COLORS.length] }}
                            />
                            <span className="text-slate-700 flex-1">{item.type}</span>
                            <Badge className="bg-slate-100 text-slate-700">{item.count}</Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
