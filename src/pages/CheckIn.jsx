import React, { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Clock,
  Calendar,
  GraduationCap
} from "lucide-react";
import { format } from "date-fns";

export default function CheckIn() {
  const [rgPrefix, setRgPrefix] = useState("");
  const [submitted, setSubmitted] = useState(false);
  
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");

  const { data: linkData, isLoading: linkLoading, error: linkError } = useQuery({
    queryKey: ["attendanceLink", token],
    queryFn: async () => {
      if (!token) throw new Error("Token não fornecido");
      
      const links = await dataClient.entities.AttendanceLink.filter({ token });
      if (links.length === 0) throw new Error("Link inválido");
      
      const link = links[0];
      
      if (!link.is_active) throw new Error("Link desativado");
      
      const now = new Date();
      const expiresAt = new Date(link.expires_at);
      if (now > expiresAt) throw new Error("Link expirado");
      
      return link;
    },
    enabled: !!token,
    retry: false,
  });

  const checkIn = useMutation({
    mutationFn: async () => {
      const rgDigits = rgPrefix.replace(/\D/g, "");
      if (!rgDigits) {
        throw new Error("Informe os 4 primeiros dígitos do RG");
      }
      if (rgDigits.length < 4) {
        throw new Error("Informe ao menos 4 dígitos do RG");
      }

      const participants = await dataClient.entities.TrainingParticipant.filter({
        training_id: linkData.training_id,
      });

      const matched = participants.filter((participant) => {
        const participantRg = String(participant.professional_rg || "").replace(/\D/g, "");
        return participantRg.startsWith(rgDigits);
      });

      if (matched.length === 0) {
        throw new Error("RG não encontrado neste treinamento");
      }

      if (matched.length > 1) {
        throw new Error("Mais de um participante encontrado. Informe mais dígitos do RG");
      }

      const participant = matched[0];

      if (participant.enrollment_status === "cancelado") {
        throw new Error("Sua inscrição foi cancelada");
      }

      const records = participant.attendance_records || [];
      const existingIndex = records.findIndex(r => r.date === linkData.date);
      const updatedRecords = [...records];

      if (existingIndex >= 0) {
        updatedRecords[existingIndex] = {
          date: linkData.date,
          status: "presente",
          check_in_time: format(new Date(), "HH:mm"),
        };
      } else {
        updatedRecords.push({
          date: linkData.date,
          status: "presente",
          check_in_time: format(new Date(), "HH:mm"),
        });
      }

      const training = await dataClient.entities.Training.filter({ id: linkData.training_id });
      const totalDates = training[0]?.dates?.length || 1;
      const presentCount = updatedRecords.filter(r => r.status === "presente").length;
      const percentage = Math.round((presentCount / totalDates) * 100);

      await dataClient.entities.TrainingParticipant.update(participant.id, {
        attendance_records: updatedRecords,
        attendance_percentage: percentage,
        approved: percentage >= 75,
      });

      await dataClient.entities.AttendanceLink.update(linkData.id, {
        check_ins_count: (linkData.check_ins_count || 0) + 1,
      });

      return { participant, percentage };
    },
    onSuccess: () => {
      setSubmitted(true);
    },
  });

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                Link inválido. Entre em contato com o instrutor.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (linkLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
            <p className="mt-4 text-slate-600">Verificando link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (linkError || !linkData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {linkError?.message || "Link inválido ou expirado"}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center flex items-center justify-center gap-2 text-green-600">
              <CheckCircle className="h-6 w-6" />
              Presença Registrada!
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="text-4xl">✅</div>
            <p className="text-slate-700">
              Sua presença foi registrada com sucesso no treinamento.
            </p>
            <div className="p-4 bg-slate-50 rounded-lg text-sm text-left">
              <p><strong>Treinamento:</strong> {linkData.training_title}</p>
              <p><strong>Data:</strong> {format(new Date(linkData.date), "dd/MM/yyyy")}</p>
              <p><strong>Horário:</strong> {format(new Date(), "HH:mm")}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <GraduationCap className="h-8 w-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">Registrar Presença</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-slate-50 rounded-lg space-y-2 text-sm">
            <div className="flex items-center gap-2 text-slate-700">
              <GraduationCap className="h-4 w-4 text-blue-600" />
              <span className="font-medium">{linkData.training_title}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Calendar className="h-4 w-4" />
              <span>{format(new Date(linkData.date), "dd/MM/yyyy")}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Clock className="h-4 w-4" />
              <span>Expira: {format(new Date(linkData.expires_at), "dd/MM/yyyy HH:mm")}</span>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              checkIn.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="rgPrefix">RG (4 primeiros dígitos) *</Label>
              <Input
                id="rgPrefix"
                value={rgPrefix}
                onChange={(e) => setRgPrefix(e.target.value)}
                placeholder="Ex: 1234"
                required
                autoFocus
              />
            </div>

            {checkIn.error && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  {checkIn.error.message}
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={checkIn.isPending}
            >
              {checkIn.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Confirmar Presença
                </>
              )}
            </Button>
          </form>

          <p className="text-xs text-center text-slate-500">
            ⚠️ Use os 4 primeiros dígitos do RG. Se houver duplicidade, informe mais dígitos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}