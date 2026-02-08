import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GraduationCap, Calendar, Award, FileText, Download, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function TrainingHistory({ professional }) {
  const [filter, setFilter] = useState("all");

  const { data: participations = [], isLoading } = useQuery({
    queryKey: ["training-history", professional.id],
    queryFn: () => base44.entities.TrainingParticipant.filter({ 
      professional_id: professional.id 
    }, "-created_date"),
  });

  const getStatusBadge = (participant) => {
    if (participant.certificate_issued) {
      return <Badge className="bg-green-100 text-green-700">Certificado Emitido</Badge>;
    }
    if (participant.approved) {
      return <Badge className="bg-blue-100 text-blue-700">Aprovado</Badge>;
    }
    return <Badge className="bg-slate-100 text-slate-700">{participant.enrollment_status}</Badge>;
  };

  const getValidityStatus = (participant) => {
    if (!participant.validity_date) return null;
    
    const validityDate = new Date(participant.validity_date);
    const now = new Date();
    const daysUntilExpiry = Math.floor((validityDate - now) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) {
      return <Badge className="bg-red-100 text-red-700">Vencido</Badge>;
    } else if (daysUntilExpiry < 30) {
      return <Badge className="bg-yellow-100 text-yellow-700">Vence em {daysUntilExpiry} dias</Badge>;
    }
    return <Badge className="bg-green-100 text-green-700">Válido</Badge>;
  };

  const filteredData = participations.filter(p => {
    if (filter === "certified") return p.certificate_issued;
    if (filter === "approved") return p.approved && !p.certificate_issued;
    if (filter === "pending") return !p.approved;
    return true;
  });

  const stats = {
    total: participations.length,
    certified: participations.filter(p => p.certificate_issued).length,
    approved: participations.filter(p => p.approved).length,
    attendance: participations.length > 0 
      ? (participations.reduce((sum, p) => sum + (p.attendance_percentage || 0), 0) / participations.length).toFixed(1)
      : 0
  };

  if (isLoading) {
    return <div className="text-center py-8">Carregando histórico...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
              <div className="text-sm text-slate-600 mt-1">Total de Treinamentos</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{stats.certified}</div>
              <div className="text-sm text-slate-600 mt-1">Certificados</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">{stats.approved}</div>
              <div className="text-sm text-slate-600 mt-1">Aprovações</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-600">{stats.attendance}%</div>
              <div className="text-sm text-slate-600 mt-1">Presença Média</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          Todos ({participations.length})
        </Button>
        <Button
          variant={filter === "certified" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("certified")}
        >
          Certificados ({stats.certified})
        </Button>
        <Button
          variant={filter === "approved" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("approved")}
        >
          Aprovados ({stats.approved})
        </Button>
        <Button
          variant={filter === "pending" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("pending")}
        >
          Pendentes ({participations.length - stats.approved})
        </Button>
      </div>

      {/* Lista de treinamentos */}
      <div className="space-y-4">
        {filteredData.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              Nenhum treinamento encontrado
            </CardContent>
          </Card>
        ) : (
          filteredData.map((participant) => (
            <Card key={participant.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <GraduationCap className="h-5 w-5 text-blue-600" />
                      {participant.training_title}
                    </CardTitle>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {getStatusBadge(participant)}
                      {getValidityStatus(participant)}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {participant.training_date 
                        ? format(new Date(participant.training_date), "dd/MM/yyyy", { locale: ptBR })
                        : "Data não definida"}
                    </span>
                  </div>
                  
                  {participant.attendance_percentage !== undefined && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="font-medium">Presença:</span>
                      <span>{participant.attendance_percentage}%</span>
                    </div>
                  )}
                  
                  {participant.grade && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="font-medium">Nota:</span>
                      <span>{participant.grade}</span>
                    </div>
                  )}
                  
                  {participant.validity_date && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="font-medium">Validade:</span>
                      <span>{format(new Date(participant.validity_date), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  )}
                </div>

                {participant.certificate_url && (
                  <div className="mt-4 pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(participant.certificate_url, "_blank")}
                      className="w-full md:w-auto"
                    >
                      <Award className="h-4 w-4 mr-2" />
                      Ver Certificado
                      <ExternalLink className="h-3 w-3 ml-2" />
                    </Button>
                  </div>
                )}

                {participant.notes && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-slate-600">
                      <span className="font-medium">Observações:</span> {participant.notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}