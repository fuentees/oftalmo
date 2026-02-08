import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
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
  MapPin,
  Clock,
  Plane,
  Briefcase,
  Umbrella,
  Circle,
  Plus
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import StatsCard from "@/components/dashboard/StatsCard";
import DataTable from "@/components/common/DataTable";

export default function Dashboard() {
  const { data: materials = [], isLoading: loadingMaterials } = useQuery({
    queryKey: ["materials"],
    queryFn: () => base44.entities.Material.list(),
  });

  const { data: movements = [], isLoading: loadingMovements } = useQuery({
    queryKey: ["movements"],
    queryFn: () => base44.entities.StockMovement.list("-created_date", 10),
  });

  const { data: trainings = [], isLoading: loadingTrainings } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => base44.entities.Training.list("-date", 10),
  });

  const { data: professionals = [], isLoading: loadingProfessionals } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => base44.entities.Professional.list(),
  });

  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ["events"],
    queryFn: () => base44.entities.Event.list("-start_date"),
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

  const activeProfessionals = professionals.filter((p) => p.status === "ativo");

  // Próximos eventos (futuros ou em andamento)
  const upcomingEvents = events
    .filter((event) => {
      const eventDate = new Date(event.end_date || event.start_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return eventDate >= today && event.status !== "cancelado";
    })
    .slice(0, 8);

  const typeIcons = {
    viagem: Plane,
    trabalho_campo: Briefcase,
    treinamento: GraduationCap,
    ferias: Umbrella,
    reuniao: Users,
    outro: Circle,
  };

  const typeLabels = {
    viagem: "Viagem",
    trabalho_campo: "Trabalho de Campo",
    treinamento: "Treinamento",
    ferias: "Férias",
    reuniao: "Reunião",
    outro: "Outro",
  };

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
          title="Profissionais Ativos"
          value={activeProfessionals.length}
          icon={Users}
          color="green"
        />
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Card className="border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-amber-800 flex items-center gap-2">
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              Alerta de Estoque Baixo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowStockItems.slice(0, 5).map((item) => (
                <Badge key={item.id} className="bg-white border border-amber-200 text-amber-900 shadow-sm">
                  {item.name}: {item.current_stock} {item.unit}
                </Badge>
              ))}
              {lowStockItems.length > 5 && (
                <Badge className="bg-amber-100 border border-amber-300 text-amber-900">
                  +{lowStockItems.length - 5} outros
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Movements */}
        <Card className="border-slate-200 shadow-lg hover:shadow-xl transition-shadow">
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
          <CardContent className="p-0">
            <DataTable
              columns={movementColumns}
              data={movements.slice(0, 5)}
              isLoading={loadingMovements}
              emptyMessage="Nenhuma movimentação registrada"
            />
          </CardContent>
        </Card>

        {/* Upcoming Events */}
        <Card className="border-slate-200 shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl">
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
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {loadingEvents ? (
              <p className="text-sm text-slate-500 text-center py-4">Carregando...</p>
            ) : upcomingEvents.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Nenhum evento próximo</p>
            ) : (
              upcomingEvents.map((event) => {
                const Icon = typeIcons[event.type] || Circle;
                return (
                  <div
                    key={event.id}
                    className="p-4 border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-blue-300 transition-all hover:shadow-md cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="p-2 rounded-lg flex-shrink-0"
                        style={{ backgroundColor: event.color + "20" }}
                      >
                        <Icon className="h-4 w-4" style={{ color: event.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm text-slate-900 truncate">
                          {event.title}
                        </h4>
                        <p className="text-xs text-slate-500">{typeLabels[event.type]}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-600">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(event.start_date), "dd/MM", { locale: ptBR })}
                            {event.end_date && event.end_date !== event.start_date && 
                              ` - ${format(new Date(event.end_date), "dd/MM", { locale: ptBR })}`}
                          </div>
                          {event.start_time && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {event.start_time}
                            </div>
                          )}
                        </div>
                        {event.location && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{event.location}</span>
                          </div>
                        )}
                        {event.professional_names && event.professional_names.length > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            <Users className="h-3 w-3 text-slate-400" />
                            <span className="text-xs text-slate-600 truncate">
                              {event.professional_names.slice(0, 2).join(", ")}
                              {event.professional_names.length > 2 && ` +${event.professional_names.length - 2}`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}