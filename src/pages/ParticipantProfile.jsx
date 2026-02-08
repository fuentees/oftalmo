import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User,
  GraduationCap,
  Calendar,
  Award,
  Clock,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Mail,
  Building2,
  FileText
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

export default function ParticipantProfile() {
  const navigate = useNavigate();
  const [participantId, setParticipantId] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setParticipantId(params.get("id"));
  }, []);

  const { data: participant, isLoading: loadingParticipant } = useQuery({
    queryKey: ["participant", participantId],
    queryFn: async () => {
      const participants = await base44.entities.TrainingParticipant.list();
      return participants.find((p) => p.id === participantId);
    },
    enabled: !!participantId,
  });

  const { data: allParticipations = [], isLoading: loadingParticipations } = useQuery({
    queryKey: ["all-participations", participant?.professional_id],
    queryFn: () =>
      base44.entities.TrainingParticipant.filter(
        { professional_id: participant.professional_id },
        "-enrollment_date"
      ),
    enabled: !!participant?.professional_id,
  });

  if (!participantId) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Participante não encontrado</p>
      </div>
    );
  }

  if (loadingParticipant || loadingParticipations) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Carregando...</p>
      </div>
    );
  }

  if (!participant) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Participante não encontrado</p>
      </div>
    );
  }

  // Categorizar treinamentos por tipo
  const trainings = {
    teorico: allParticipations.filter((p) => {
      const title = p.training_title?.toLowerCase() || "";
      return title.includes("teórico") || title.includes("teorico");
    }),
    pratico: allParticipations.filter((p) => {
      const title = p.training_title?.toLowerCase() || "";
      return title.includes("prático") || title.includes("pratico");
    }),
    repadronizacao: allParticipations.filter((p) => {
      const title = p.training_title?.toLowerCase() || "";
      return title.includes("repadronização") || title.includes("repadronizacao");
    }),
    outros: allParticipations.filter((p) => {
      const title = p.training_title?.toLowerCase() || "";
      return !title.includes("teórico") && !title.includes("teorico") && 
             !title.includes("prático") && !title.includes("pratico") &&
             !title.includes("repadronização") && !title.includes("repadronizacao");
    }),
  };

  const approvedCount = allParticipations.filter((p) => p.approved).length;
  const certificatesCount = allParticipations.filter((p) => p.certificate_issued).length;
  const avgAttendance = allParticipations.length > 0
    ? (allParticipations.reduce((acc, p) => acc + (p.attendance_percentage || 0), 0) / allParticipations.length).toFixed(1)
    : 0;

  const renderTrainingCard = (participation) => (
    <Card key={participation.id} className="mb-3">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h4 className="font-semibold text-slate-900">{participation.training_title}</h4>
            <div className="flex flex-wrap gap-2 mt-2">
              {participation.training_date && (
                <div className="flex items-center gap-1 text-sm text-slate-600">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(participation.training_date), "dd/MM/yyyy")}
                </div>
              )}
              {participation.attendance_percentage !== undefined && (
                <div className="flex items-center gap-1 text-sm text-slate-600">
                  <Clock className="h-3 w-3" />
                  {participation.attendance_percentage}% presença
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              {participation.enrollment_status && (
                <Badge variant="outline" className="text-xs">
                  {participation.enrollment_status}
                </Badge>
              )}
              {participation.approved && (
                <Badge className="bg-green-100 text-green-700 text-xs">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Aprovado
                </Badge>
              )}
              {participation.certificate_issued && (
                <Badge className="bg-blue-100 text-blue-700 text-xs">
                  <Award className="h-3 w-3 mr-1" />
                  Certificado
                </Badge>
              )}
            </div>
            {participation.validity_date && (
              <p className="text-xs text-slate-500 mt-2">
                Válido até: {format(new Date(participation.validity_date), "dd/MM/yyyy")}
              </p>
            )}
          </div>
          {participation.certificate_url && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(participation.certificate_url, '_blank')}
            >
              <FileText className="h-4 w-4 mr-1" />
              Ver Certificado
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Perfil do Participante</h1>
          <p className="text-slate-500">Histórico completo de treinamentos</p>
        </div>
      </div>

      {/* Informações Básicas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-blue-600" />
            Informações Pessoais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-slate-500">Nome</p>
              <p className="font-semibold">{participant.professional_name}</p>
            </div>
            {participant.professional_registration && (
              <div>
                <p className="text-sm text-slate-500">Matrícula</p>
                <p className="font-semibold">{participant.professional_registration}</p>
              </div>
            )}
            {participant.professional_cpf && (
              <div>
                <p className="text-sm text-slate-500">CPF</p>
                <p className="font-semibold">{participant.professional_cpf}</p>
              </div>
            )}
            {participant.professional_rg && (
              <div>
                <p className="text-sm text-slate-500">RG</p>
                <p className="font-semibold">{participant.professional_rg}</p>
              </div>
            )}
            {participant.professional_email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-500">Email</p>
                  <p className="font-semibold">{participant.professional_email}</p>
                </div>
              </div>
            )}
            {participant.professional_sector && (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-500">Setor</p>
                  <p className="font-semibold">{participant.professional_sector}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <GraduationCap className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{allParticipations.length}</p>
                <p className="text-sm text-slate-500">Treinamentos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{approvedCount}</p>
                <p className="text-sm text-slate-500">Aprovações</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-amber-100 flex items-center justify-center">
                <Award className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{certificatesCount}</p>
                <p className="text-sm text-slate-500">Certificados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
                <Clock className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{avgAttendance}%</p>
                <p className="text-sm text-slate-500">Presença Média</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Treinamentos por Tipo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-blue-600" />
            Histórico de Treinamentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="todos">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="todos">
                Todos ({allParticipations.length})
              </TabsTrigger>
              <TabsTrigger value="teorico">
                Teórico ({trainings.teorico.length})
              </TabsTrigger>
              <TabsTrigger value="pratico">
                Prático ({trainings.pratico.length})
              </TabsTrigger>
              <TabsTrigger value="repadronizacao">
                Repadronização ({trainings.repadronizacao.length})
              </TabsTrigger>
              <TabsTrigger value="outros">
                Outros ({trainings.outros.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="todos" className="mt-4">
              {allParticipations.length === 0 ? (
                <p className="text-center text-slate-500 py-8">
                  Nenhum treinamento realizado
                </p>
              ) : (
                allParticipations.map(renderTrainingCard)
              )}
            </TabsContent>

            <TabsContent value="teorico" className="mt-4">
              {trainings.teorico.length === 0 ? (
                <p className="text-center text-slate-500 py-8">
                  Nenhum treinamento teórico
                </p>
              ) : (
                trainings.teorico.map(renderTrainingCard)
              )}
            </TabsContent>

            <TabsContent value="pratico" className="mt-4">
              {trainings.pratico.length === 0 ? (
                <p className="text-center text-slate-500 py-8">
                  Nenhum treinamento prático
                </p>
              ) : (
                trainings.pratico.map(renderTrainingCard)
              )}
            </TabsContent>

            <TabsContent value="repadronizacao" className="mt-4">
              {trainings.repadronizacao.length === 0 ? (
                <p className="text-center text-slate-500 py-8">
                  Nenhum treinamento de repadronização
                </p>
              ) : (
                trainings.repadronizacao.map(renderTrainingCard)
              )}
            </TabsContent>

            <TabsContent value="outros" className="mt-4">
              {trainings.outros.length === 0 ? (
                <p className="text-center text-slate-500 py-8">
                  Nenhum outro treinamento
                </p>
              ) : (
                trainings.outros.map(renderTrainingCard)
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}