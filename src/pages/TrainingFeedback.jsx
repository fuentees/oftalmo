import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, AlertCircle, Loader2, Star } from "lucide-react";

const StarRating = ({ value, onChange, label }) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="focus:outline-none"
        >
          <Star
            className={`h-8 w-8 ${
              star <= value ? "fill-yellow-400 text-yellow-400" : "text-slate-300"
            }`}
          />
        </button>
      ))}
    </div>
  </div>
);

export default function TrainingFeedback() {
  const queryString =
    window.location.search || window.location.hash.split("?")[1] || "";
  const urlParams = new URLSearchParams(queryString);
  const trainingId = urlParams.get("training");

  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [lookupError, setLookupError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const [formData, setFormData] = useState({
    rating: 0,
    content_quality: 0,
    instructor_rating: 0,
    comments: "",
    would_recommend: false,
  });

  const { data: training, isLoading } = useQuery({
    queryKey: ["feedback-training", trainingId],
    queryFn: async () => {
      const trainings = await dataClient.entities.Training.list();
      return trainings.find((t) => t.id === trainingId);
    },
    enabled: !!trainingId,
  });

  const submitFeedback = useMutation({
    mutationFn: async () => {
      setLookupError(null);
      const cpfDigits = cpf.replace(/\D/g, "");
      const emailValue = email.trim().toLowerCase();
      if (!cpfDigits && !emailValue) {
        throw new Error("Informe CPF ou e-mail para identificar sua inscrição.");
      }

      let participants = [];
      if (cpfDigits) {
        participants = await dataClient.entities.TrainingParticipant.filter({
          training_id: trainingId,
          professional_cpf: cpfDigits,
        });
      } else if (emailValue) {
        participants = await dataClient.entities.TrainingParticipant.filter({
          training_id: trainingId,
          professional_email: emailValue,
        });
      }

      if (participants.length === 0) {
        throw new Error("Inscrição não encontrada para este treinamento.");
      }
      if (participants.length > 1) {
        throw new Error("Encontramos mais de uma inscrição. Use o CPF completo.");
      }

      const participant = participants[0];

      if (formData.rating === 0) {
        throw new Error("Informe a avaliação geral.");
      }

      await dataClient.entities.TrainingFeedback.create({
        training_id: trainingId,
        training_title: training.title,
        participant_id: participant.id,
        participant_name: participant.professional_name,
        rating: formData.rating,
        content_quality: formData.content_quality,
        instructor_rating: formData.instructor_rating,
        comments: formData.comments,
        would_recommend: formData.would_recommend,
      });
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (error) => {
      setLookupError(error.message || "Erro ao enviar avaliação.");
    },
  });

  if (!trainingId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                Link inválido. Informe o treinamento corretamente.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!training) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                Treinamento não encontrado.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Avaliação enviada!</h2>
              <p className="text-slate-600 mt-2">Obrigado pelo seu feedback.</p>
            </div>
            <Button onClick={() => setSubmitted(false)} variant="outline">
              Enviar outra avaliação
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Avaliação do Treinamento</CardTitle>
          <p className="text-sm text-slate-600 mt-1">{training.title}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF (opcional)</Label>
              <Input
                id="cpf"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail (opcional)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@email.com"
              />
            </div>
          </div>

          <StarRating
            label="Avaliação Geral"
            value={formData.rating}
            onChange={(value) => setFormData({ ...formData, rating: value })}
          />
          <StarRating
            label="Qualidade do Conteúdo"
            value={formData.content_quality}
            onChange={(value) => setFormData({ ...formData, content_quality: value })}
          />
          <StarRating
            label="Avaliação do Instrutor"
            value={formData.instructor_rating}
            onChange={(value) => setFormData({ ...formData, instructor_rating: value })}
          />

          <div>
            <Label>Comentários e Sugestões</Label>
            <Textarea
              value={formData.comments}
              onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
              rows={4}
              placeholder="Compartilhe sua experiência..."
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="would_recommend"
              type="checkbox"
              checked={formData.would_recommend}
              onChange={(e) =>
                setFormData({ ...formData, would_recommend: e.target.checked })
              }
            />
            <Label htmlFor="would_recommend" className="font-normal">
              Eu recomendaria este treinamento
            </Label>
          </div>

          {lookupError && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {lookupError}
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={() => submitFeedback.mutate()}
            className="w-full"
            disabled={submitFeedback.isPending}
          >
            {submitFeedback.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              "Enviar Avaliação"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
