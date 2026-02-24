import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { dataClient } from "@/api/dataClient";
import { isRepadronizacaoTraining } from "@/lib/trainingType";
import PageHeader from "@/components/common/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  ArrowLeft,
  ClipboardCheck,
  Loader2,
  MessageSquare,
  SlidersHorizontal,
} from "lucide-react";
import EnrollmentPage from "./EnrollmentPage";
import TrainingFeedbackPage from "./TrainingFeedbackPage";
import TracomaExaminerEvaluationPage from "./TracomaExaminerEvaluationPage";

export default function TrainingWorkspaceMasks() {
  const navigate = useNavigate();
  const queryString =
    window.location.search || window.location.hash.split("?")[1] || "";
  const urlParams = new URLSearchParams(queryString);
  const trainingId = String(urlParams.get("training") || "").trim();
  const [activeTab, setActiveTab] = useState("enrollment_mask");

  const { data: trainings = [], isLoading } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => dataClient.entities.Training.list("-date"),
  });

  const training =
    trainings.find((item) => String(item?.id || "").trim() === trainingId) || null;
  const isRepadTraining = isRepadronizacaoTraining(training);

  React.useEffect(() => {
    if (!isRepadTraining && activeTab === "exam_mask") {
      setActiveTab("enrollment_mask");
    }
  }, [activeTab, isRepadTraining]);

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

      <Alert className="border-blue-200 bg-blue-50">
        <AlertDescription className="text-blue-800">
          Esta área contém somente máscaras de criação. Resultados e históricos ficam no
          painel principal do treinamento.
        </AlertDescription>
      </Alert>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-lg bg-muted p-1">
          <TabsTrigger value="enrollment_mask" className="gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Máscara de Inscrição
          </TabsTrigger>
          <TabsTrigger value="feedback_mask" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Máscara de Avaliação
          </TabsTrigger>
          {isRepadTraining && (
            <TabsTrigger value="exam_mask" className="gap-1.5">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Máscara da Prova
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="enrollment_mask" className="mt-6">
          <EnrollmentPage
            showBackButton={false}
            allowedTabs={["mask", "form"]}
            initialTab="mask"
          />
        </TabsContent>

        <TabsContent value="feedback_mask" className="mt-6">
          <TrainingFeedbackPage
            showBackButton={false}
            allowedTabs={["mask", "preview"]}
            initialTab="mask"
          />
        </TabsContent>

        {isRepadTraining && (
          <TabsContent value="exam_mask" className="mt-6">
            <TracomaExaminerEvaluationPage
              showBackButton={false}
              allowedTabs={["mask"]}
              initialTab="mask"
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
