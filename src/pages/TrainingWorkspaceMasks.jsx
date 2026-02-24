import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { dataClient } from "@/api/dataClient";
import { isRepadronizacaoTraining } from "@/lib/trainingType";
import PageHeader from "@/components/common/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertCircle,
  ArrowLeft,
  ClipboardCheck,
  FileText,
  Loader2,
  MessageSquare,
  SlidersHorizontal,
} from "lucide-react";

export default function TrainingWorkspaceMasks() {
  const navigate = useNavigate();
  const queryString =
    window.location.search || window.location.hash.split("?")[1] || "";
  const urlParams = new URLSearchParams(queryString);
  const trainingId = String(urlParams.get("training") || "").trim();

  const { data: trainings = [], isLoading } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => dataClient.entities.Training.list("-date"),
  });

  const training =
    trainings.find((item) => String(item?.id || "").trim() === trainingId) || null;
  const isRepadTraining = isRepadronizacaoTraining(training);

  const goBackToWorkspace = () => {
    if (!trainingId) {
      navigate("/Trainings");
      return;
    }
    navigate(`/TrainingWorkspace?training=${encodeURIComponent(trainingId)}`);
  };

  if (!trainingId) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/Trainings")} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar para Treinamentos
        </Button>
        <PageHeader
          title="Máscaras de criação do treinamento"
          subtitle="Abra esta página a partir de um treinamento específico."
        />
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-700" />
          <AlertDescription className="text-red-800">
            Link inválido. O treinamento não foi informado.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!training) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/Trainings")} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar para Treinamentos
        </Button>
        <PageHeader
          title="Máscaras de criação do treinamento"
          subtitle="Treinamento não encontrado"
        />
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-700" />
          <AlertDescription className="text-red-800">
            Não foi possível localizar o treinamento solicitado.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={goBackToWorkspace} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Voltar para o Painel do Treinamento
      </Button>

      <PageHeader
        title="Máscaras de criação do treinamento"
        subtitle={training.title || "Treinamento sem título"}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Configuração separada de máscaras</Badge>
      </div>

      <Alert className="border-blue-200 bg-blue-50">
        <AlertDescription className="text-blue-800">
          Esta página centraliza somente as máscaras de criação. As abas do painel do
          treinamento exibem apenas inscritos e resultados.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-blue-600" />
              Máscara de Inscrição
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">
              Configure campos, seções e link da inscrição pública.
            </p>
            <Button
              type="button"
              onClick={() =>
                navigate(
                  `/EnrollmentPage?training=${encodeURIComponent(trainingId)}&tab=mask`
                )
              }
              className="w-full"
            >
              <FileText className="h-4 w-4 mr-2" />
              Abrir máscara de inscrição
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-indigo-600" />
              Máscara de Avaliação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">
              Crie e organize perguntas da avaliação do treinamento.
            </p>
            <Button
              type="button"
              onClick={() =>
                navigate(`/TrainingFeedbackPage?training=${encodeURIComponent(trainingId)}`)
              }
              className="w-full"
            >
              <FileText className="h-4 w-4 mr-2" />
              Abrir máscara de avaliação
            </Button>
          </CardContent>
        </Card>

        {isRepadTraining && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                Máscara da Prova (Tracoma)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-600">
                Gerencie gabaritos padrão-ouro e modelos de prova.
              </p>
              <Button
                type="button"
                onClick={() =>
                  navigate(
                    `/TracomaExaminerEvaluationPage?training=${encodeURIComponent(
                      trainingId
                    )}`
                  )
                }
                className="w-full"
              >
                <FileText className="h-4 w-4 mr-2" />
                Abrir máscara da prova
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
