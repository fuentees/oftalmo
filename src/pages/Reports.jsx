import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format, addMonths, differenceInDays, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  FileText,
  Download,
  AlertTriangle,
  TrendingUp,
  Users,
  Award,
  Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default function Reports() {
  const [periodFilter, setPeriodFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const { data: participants = [] } = useQuery({
    queryKey: ["participants"],
    queryFn: () => base44.entities.TrainingParticipant.list(),
  });

  const { data: trainings = [] } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => base44.entities.Training.list(),
  });

  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => base44.entities.Professional.list(),
  });

  // Apply filters
  const getDateRange = () => {
    const now = new Date();
    switch(periodFilter) {
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
          end: customEndDate ? new Date(customEndDate) : null 
        };
      default:
        return { start: null, end: null };
    }
  };

  const dateRange = getDateRange();

  const filteredParticipants = participants.filter(p => {
    if (sectorFilter !== "all" && p.professional_sector !== sectorFilter) return false;
    
    if (dateRange.start && dateRange.end && p.enrollment_date) {
      const enrollDate = new Date(p.enrollment_date);
      if (!isWithinInterval(enrollDate, { start: dateRange.start, end: dateRange.end })) {
        return false;
      }
    }
    
    return true;
  });

  const filteredTrainings = trainings.filter(t => {
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    
    if (dateRange.start && dateRange.end && t.dates && t.dates.length > 0) {
      const trainingDate = new Date(t.dates[0].date);
      if (!isWithinInterval(trainingDate, { start: dateRange.start, end: dateRange.end })) {
        return false;
      }
    }
    
    return true;
  });

  // Treinamentos vencidos ou próximos ao vencimento
  const expiredTrainings = filteredParticipants.filter(p => {
    if (!p.validity_date || !p.approved) return false;
    const daysUntilExpiry = differenceInDays(new Date(p.validity_date), new Date());
    return daysUntilExpiry <= 30;
  });

  const criticalExpired = expiredTrainings.filter(p => 
    differenceInDays(new Date(p.validity_date), new Date()) < 0
  );

  // Estatísticas por setor
  const sectorStats = professionals.reduce((acc, prof) => {
    const sector = prof.sector || "Sem setor";
    if (!acc[sector]) {
      acc[sector] = {
        sector,
        total: 0,
        trained: 0,
        approved: 0
      };
    }
    acc[sector].total++;
    
    const profTrainings = participants.filter(p => p.professional_id === prof.id);
    if (profTrainings.length > 0) acc[sector].trained++;
    if (profTrainings.some(p => p.approved)) acc[sector].approved++;
    
    return acc;
  }, {});

  const sectorData = Object.values(sectorStats);

  // Treinamentos por mês
  const trainingsByMonth = filteredTrainings.reduce((acc, training) => {
    if (training.dates && training.dates.length > 0) {
      const month = format(new Date(training.dates[0].date), "MMM/yy");
      acc[month] = (acc[month] || 0) + 1;
    }
    return acc;
  }, {});

  const monthlyData = Object.entries(trainingsByMonth).map(([month, count]) => ({
    month,
    treinamentos: count
  }));

  // Compliance por profissional
  const complianceData = professionals
    .filter(prof => sectorFilter === "all" || prof.sector === sectorFilter)
    .map(prof => {
    const profParticipants = filteredParticipants.filter(p => p.professional_id === prof.id && p.approved);
    const validTrainings = profParticipants.filter(p => {
      if (!p.validity_date) return true;
      return new Date(p.validity_date) > new Date();
    });
    
    return {
      professional_name: prof.name,
      total_trainings: profParticipants.length,
      valid_trainings: validTrainings.length,
      expired_trainings: profParticipants.length - validTrainings.length,
      compliance: profParticipants.length > 0 
        ? Math.round((validTrainings.length / profParticipants.length) * 100) 
        : 0
    };
  }).sort((a, b) => a.compliance - b.compliance);

  const exportToPDF = async () => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    
    pdf.setFontSize(20);
    pdf.text('Relatório de Treinamentos', 15, 20);
    
    pdf.setFontSize(10);
    pdf.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 15, 30);
    
    let yPos = 45;
    
    // Stats
    pdf.setFontSize(14);
    pdf.text('Estatísticas Gerais', 15, yPos);
    yPos += 10;
    
    pdf.setFontSize(10);
    pdf.text(`Total de Treinamentos: ${filteredTrainings.length}`, 20, yPos);
    yPos += 6;
    pdf.text(`Total de Participações: ${filteredParticipants.length}`, 20, yPos);
    yPos += 6;
    pdf.text(`Aprovados: ${filteredParticipants.filter(p => p.approved).length}`, 20, yPos);
    yPos += 6;
    pdf.text(`Vencendo em 30 dias: ${expiredTrainings.length}`, 20, yPos);
    yPos += 15;
    
    // Compliance
    pdf.setFontSize(14);
    pdf.text('Top 10 - Compliance por Profissional', 15, yPos);
    yPos += 10;
    
    complianceData.slice(0, 10).forEach((item) => {
      pdf.setFontSize(9);
      pdf.text(`${item.professional_name}: ${item.compliance}%`, 20, yPos);
      yPos += 5;
      if (yPos > 280) {
        pdf.addPage();
        yPos = 20;
      }
    });
    
    pdf.save(`relatorio-compliance-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  const exportToCSV = () => {
    const csvData = [
      ['Profissional', 'Total Treinamentos', 'Válidos', 'Vencidos', 'Compliance %'],
      ...complianceData.map(item => [
        item.professional_name,
        item.total_trainings,
        item.valid_trainings,
        item.expired_trainings,
        item.compliance
      ])
    ];
    
    const csv = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  const sectors = [...new Set(professionals.map(p => p.sector).filter(Boolean))];
  const categories = ["NR", "tecnico", "comportamental", "integracao", "reciclagem", "outros"];

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const expiredColumns = [
    {
      header: "Profissional",
      accessor: "professional_name",
      cellClassName: "font-medium",
    },
    {
      header: "Treinamento",
      accessor: "training_title",
    },
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
              <Badge className="bg-amber-100 text-amber-700">{daysUntil} dias</Badge>
            )}
          </div>
        );
      },
    },
    {
      header: "Setor",
      accessor: "professional_sector",
    },
  ];

  const complianceColumns = [
    {
      header: "Profissional",
      accessor: "professional_name",
      cellClassName: "font-medium",
    },
    {
      header: "Total Treinamentos",
      accessor: "total_trainings",
    },
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
        const color = row.compliance >= 80 ? "bg-green-100 text-green-700" :
                     row.compliance >= 50 ? "bg-amber-100 text-amber-700" :
                     "bg-red-100 text-red-700";
        return <Badge className={color}>{row.compliance}%</Badge>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        subtitle="Análises e indicadores de treinamentos"
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
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
                  {sectors.map(sector => (
                    <SelectItem key={sector} value={sector}>{sector}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Categoria</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat.toUpperCase()}</SelectItem>
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
              Exportar Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {criticalExpired.length > 0 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <strong>{criticalExpired.length} treinamento(s) vencido(s)</strong> requerem atenção imediata!
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">
              Total de Treinamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{filteredTrainings.length}</span>
              <FileText className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">
              Participações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{filteredParticipants.length}</span>
              <Users className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">
              Aprovados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">
                {filteredParticipants.filter(p => p.approved).length}
              </span>
              <Award className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">
              Vencendo em 30 dias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-amber-600">
                {expiredTrainings.length}
              </span>
              <AlertTriangle className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="expired" className="space-y-4">
        <TabsList>
          <TabsTrigger value="expired">Vencimentos</TabsTrigger>
          <TabsTrigger value="sector">Por Setor</TabsTrigger>
          <TabsTrigger value="trends">Tendências</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
        </TabsList>

        <TabsContent value="expired" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Treinamentos Vencidos ou Próximos ao Vencimento
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

        <TabsContent value="sector" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Participação por Setor</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sectorData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="sector" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total" fill="#3b82f6" name="Total" />
                  <Bar dataKey="trained" fill="#10b981" name="Treinados" />
                  <Bar dataKey="approved" fill="#8b5cf6" name="Aprovados" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Treinamentos por Mês
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="treinamentos" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Compliance por Profissional</CardTitle>
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
      </Tabs>
    </div>
  );
}