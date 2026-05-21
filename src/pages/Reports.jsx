import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { dataClient } from "@/api/dataClient";
import { toast } from "@/components/ui/use-toast";
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
  Send,
  Loader2,
  Star,
  RefreshCw,
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
  const navigate = useNavigate();
  const [periodFilter, setPeriodFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");
  const [sendingReminders, setSendingReminders] = useState(false);

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

  const { data: feedbacks = [] } = useQuery({
    queryKey: ["trainingFeedback"],
    queryFn: () => dataClient.entities.TrainingFeedback.list(),
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

  // === Certificate computed ===
  const certifiedParticipants = useMemo(
    () => filteredParticipants.filter((p) => p.certificate_issued || p.certificate_url),
    [filteredParticipants]
  );

  const pendingCertificates = useMemo(
    () => filteredParticipants.filter((p) => p.approved && !p.certificate_issued),
    [filteredParticipants]
  );

  // === Feedback computed ===
  const feedbackByTraining = useMemo(() => {
    const map = {};
    feedbacks.forEach((fb) => {
      const tid = String(fb.training_id ?? "");
      if (!tid) return;
      if (!map[tid]) map[tid] = { training_id: tid, ratings: [], count: 0, title: "" };
      map[tid].count += 1;
      const direct = Number(fb.rating);
      if (direct >= 1 && direct <= 5) map[tid].ratings.push(direct);
      if (Array.isArray(fb.answers)) {
        fb.answers.forEach((a) => {
          if (String(a?.type ?? "").includes("rating")) {
            const v = Number(a?.value);
            if (v >= 1 && v <= 5) map[tid].ratings.push(v);
          }
        });
      }
    });
    return Object.values(map).map((entry) => ({
      ...entry,
      avg: entry.ratings.length
        ? Math.round((entry.ratings.reduce((s, v) => s + v, 0) / entry.ratings.length) * 10) / 10
        : null,
      title:
        trainings.find((t) => String(t.id) === entry.training_id)?.title ??
        entry.training_id,
    })).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  }, [feedbacks, trainings]);

  const overallAvgRating = useMemo(() => {
    const rated = feedbackByTraining.filter((f) => f.avg !== null);
    if (!rated.length) return null;
    return (
      Math.round(
        (rated.reduce((s, f) => s + f.avg, 0) / rated.length) * 10
      ) / 10
    );
  }, [feedbackByTraining]);

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

  const filteredMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((m) =>
      String(m.name ?? "").toLowerCase().includes(q) ||
      String(m.category ?? "").toLowerCase().includes(q)
    );
  }, [materials, materialSearch]);

  const handleSendReminders = async () => {
    const toSend = expiredTrainings.filter((p) => p.professional_email);
    if (!toSend.length) {
      toast({ title: "Nenhum e-mail disponível nos registros de vencimento." });
      return;
    }
    setSendingReminders(true);
    let sent = 0;
    for (const p of toSend) {
      const days = differenceInDays(new Date(p.validity_date), new Date());
      const subject =
        days < 0
          ? `⚠️ Treinamento vencido: ${p.training_title ?? "Treinamento"}`
          : `⏰ Treinamento vence em ${days} dia(s): ${p.training_title ?? "Treinamento"}`;
      const body = `<p>Olá, <strong>${p.professional_name ?? "profissional"}</strong>.</p>
<p>${days < 0
  ? `O treinamento <strong>${p.training_title ?? ""}</strong> venceu em <strong>${format(new Date(p.validity_date), "dd/MM/yyyy")}</strong>.`
  : `O treinamento <strong>${p.training_title ?? ""}</strong> vence em <strong>${format(new Date(p.validity_date), "dd/MM/yyyy")}</strong> (${days} dia(s) restantes).`
}</p>
<p>Por favor, entre em contato para agendar a renovação.</p>`;
      try {
        await dataClient.integrations.Core.SendEmail({
          to: p.professional_email,
          subject,
          body,
        });
        sent++;
      } catch {
        // silencioso
      }
    }
    setSendingReminders(false);
    toast({
      title: `${sent} lembrete(s) enviado(s)`,
      description: toSend.length > sent ? `${toSend.length - sent} falharam.` : undefined,
    });
  };

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
    // Compliance sheet
    const compRows = [
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

    // Custom fields — collect all unique keys across all participants
    const customKeys = Array.from(
      new Set(
        filteredParticipants
          .flatMap((p) => Object.keys(p.custom_fields && typeof p.custom_fields === "object" ? p.custom_fields : {}))
      )
    );

    const participantRows = [
      [
        "Profissional",
        "Treinamento",
        "Data de Inscrição",
        "Aprovado",
        "Certificado",
        "Validade",
        "Setor",
        "Município",
        ...customKeys,
      ],
      ...filteredParticipants.map((p) => [
        p.professional_name ?? "",
        p.training_title ?? "",
        p.enrollment_date ? format(new Date(p.enrollment_date), "dd/MM/yyyy") : "",
        p.approved ? "Sim" : "Não",
        p.certificate_issued ? "Sim" : "Não",
        p.validity_date ? format(new Date(p.validity_date), "dd/MM/yyyy") : "",
        p.professional_sector ?? "",
        p.municipality ?? "",
        ...customKeys.map((k) =>
          p.custom_fields && typeof p.custom_fields === "object"
            ? String(p.custom_fields[k] ?? "")
            : ""
        ),
      ]),
    ];

    const escape = (v) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const compCSV = compRows.map((r) => r.map(escape).join(",")).join("\n");
    const partCSV = participantRows.map((r) => r.map(escape).join(",")).join("\n");
    const combined = `COMPLIANCE POR PROFISSIONAL\n${compCSV}\n\nPARTICIPAÇÕES DETALHADAS\n${partCSV}`;

    const blob = new Blob(["﻿" + combined], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${format(new Date(), "yyyy-MM-dd")}.csv`;
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
    {
      header: "",
      render: (row) =>
        row.training_id ? (
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() =>
              navigate(createPageUrl(`EnrollmentPage?trainingId=${row.training_id}`))
            }
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Renovar
          </Button>
        ) : null,
    },
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

  const certificateColumns = [
    { header: "Profissional", accessor: "professional_name", cellClassName: "font-medium" },
    { header: "Treinamento", accessor: "training_title" },
    {
      header: "Certificado",
      render: (row) =>
        row.certificate_issued ? (
          <Badge className="bg-green-100 text-green-700">Emitido</Badge>
        ) : (
          <Badge className="bg-amber-100 text-amber-700">Pendente</Badge>
        ),
    },
    {
      header: "Link",
      render: (row) =>
        row.certificate_url ? (
          <a
            href={row.certificate_url}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline text-xs"
          >
            Abrir
          </a>
        ) : (
          "—"
        ),
    },
    { header: "Setor", accessor: "professional_sector" },
    {
      header: "Validade",
      render: (row) =>
        row.validity_date
          ? format(new Date(row.validity_date), "dd/MM/yyyy")
          : "—",
    },
  ];

  const feedbackColumns = [
    { header: "Treinamento", accessor: "title", cellClassName: "font-medium" },
    { header: "Respostas", accessor: "count" },
    {
      header: "Nota Média",
      render: (row) => {
        if (row.avg === null) return <span className="text-slate-400">—</span>;
        const color =
          row.avg >= 4
            ? "text-green-600"
            : row.avg >= 3
            ? "text-amber-600"
            : "text-red-600";
        return (
          <span className={`font-bold ${color} flex items-center gap-1`}>
            <Star className="h-3.5 w-3.5 fill-current" />
            {row.avg}
          </span>
        );
      },
    },
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
          <TabsTrigger value="certificados">Certificados</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
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
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Vencidos ou Próximos ao Vencimento
                  {expiredTrainings.length > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 ml-2">
                      {expiredTrainings.length}
                    </Badge>
                  )}
                </CardTitle>
                {expiredTrainings.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={sendingReminders}
                    onClick={handleSendReminders}
                  >
                    {sendingReminders ? (
                      <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5 mr-2" />
                    )}
                    Enviar Lembretes
                  </Button>
                )}
              </div>
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

        {/* ===================== CERTIFICADOS ===================== */}
        <TabsContent value="certificados" className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              title="Certificados Emitidos"
              value={certifiedParticipants.length}
              icon={Award}
              iconColor="text-green-500"
            />
            <StatCard
              title="Pendentes"
              value={pendingCertificates.length}
              icon={AlertTriangle}
              iconColor="text-amber-500"
              valueColor={pendingCertificates.length > 0 ? "text-amber-600" : ""}
            />
            <StatCard
              title="Taxa de Emissão"
              value={
                approvedCount > 0
                  ? `${Math.round((certifiedParticipants.length / approvedCount) * 100)}%`
                  : "—"
              }
              icon={ShieldCheck}
              iconColor="text-purple-500"
            />
            <StatCard
              title="Total Aprovados"
              value={approvedCount}
              icon={Users}
              iconColor="text-blue-500"
            />
          </div>

          {pendingCertificates.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="h-5 w-5" />
                  Aprovados sem Certificado ({pendingCertificates.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={certificateColumns}
                  data={pendingCertificates}
                  emptyMessage="Todos os aprovados têm certificado"
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Certificados Emitidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={certificateColumns}
                data={certifiedParticipants}
                emptyMessage="Nenhum certificado emitido"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== FEEDBACK ===================== */}
        <TabsContent value="feedback" className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard
              title="Avaliações Recebidas"
              value={feedbacks.length}
              icon={Star}
              iconColor="text-amber-500"
            />
            <StatCard
              title="Treinamentos Avaliados"
              value={feedbackByTraining.length}
              icon={FileText}
              iconColor="text-blue-500"
            />
            <StatCard
              title="Nota Média Geral"
              value={overallAvgRating !== null ? `${overallAvgRating} ★` : "—"}
              icon={Award}
              iconColor="text-green-500"
            />
          </div>

          {feedbackByTraining.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Star className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Nenhuma avaliação registrada</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Star className="h-4 w-4 text-amber-500" />
                      Nota Média por Treinamento
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={feedbackByTraining.filter((f) => f.avg !== null).slice(0, 10)}
                        layout="vertical"
                        margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 11 }} />
                        <YAxis
                          type="category"
                          dataKey="title"
                          tick={{ fontSize: 10 }}
                          width={120}
                        />
                        <Tooltip
                          formatter={(v) => [`${v} ★`, "Nota"]}
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        />
                        <Bar dataKey="avg" name="Nota" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Activity className="h-4 w-4 text-blue-600" />
                      Distribuição de Avaliações
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const allRatings = feedbacks.flatMap((fb) => {
                        const r = [];
                        const direct = Number(fb.rating);
                        if (direct >= 1 && direct <= 5) r.push(direct);
                        if (Array.isArray(fb.answers)) {
                          fb.answers.forEach((a) => {
                            if (String(a?.type ?? "").includes("rating")) {
                              const v = Number(a?.value);
                              if (v >= 1 && v <= 5) r.push(v);
                            }
                          });
                        }
                        return r;
                      });
                      const dist = [1, 2, 3, 4, 5].map((score) => ({
                        score: `${score}★`,
                        total: allRatings.filter((v) => v === score).length,
                      }));
                      return (
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={dist} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="score" tick={{ fontSize: 12 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                            <Tooltip
                              formatter={(v) => [v, "Respostas"]}
                              contentStyle={{ fontSize: 12, borderRadius: 8 }}
                            />
                            <Bar dataKey="total" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Resultados por Treinamento
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={feedbackColumns}
                    data={feedbackByTraining}
                    emptyMessage="Nenhuma avaliação disponível"
                  />
                </CardContent>
              </Card>
            </>
          )}
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
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Inventário de Materiais
                </CardTitle>
                <Input
                  placeholder="Buscar material..."
                  value={materialSearch}
                  onChange={(e) => setMaterialSearch(e.target.value)}
                  className="w-56"
                />
              </div>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={materialColumns}
                data={filteredMaterials}
                emptyMessage="Nenhum material encontrado"
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
