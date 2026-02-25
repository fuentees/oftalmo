import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { dataClient } from "@/api/dataClient";
import ProfessionalDetails from "@/components/professionals/ProfessionalDetails";
import PageHeader from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";

const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();

const normalizeRg = (value) => String(value ?? "").replace(/\D/g, "");

const matchesProfessionalRecord = (participant, professional) => {
  if (!participant || !professional) return false;
  if (participant.professional_id && participant.professional_id === professional.id) {
    return true;
  }

  const nameMatch =
    normalizeText(participant.professional_name) === normalizeText(professional.name);
  const emailMatch =
    normalizeEmail(participant.professional_email) === normalizeEmail(professional.email);
  const rgMatch =
    normalizeRg(participant.professional_rg || participant.professional_cpf) ===
    normalizeRg(professional.rg || professional.cpf);

  if (emailMatch || rgMatch) return true;
  if (!normalizeEmail(professional.email) && !normalizeRg(professional.rg || professional.cpf)) {
    return nameMatch;
  }
  return nameMatch && (emailMatch || rgMatch);
};

export default function ProfessionalProfile() {
  const navigate = useNavigate();
  const location = useLocation();

  const professionalId = useMemo(() => {
    const queryString = location.search || location.hash.split("?")[1] || "";
    return String(new URLSearchParams(queryString).get("id") || "").trim();
  }, [location.hash, location.search]);

  const { data: professionals = [], isLoading: loadingProfessionals } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => dataClient.entities.Professional.list(),
  });

  const { data: participants = [], isLoading: loadingParticipants } = useQuery({
    queryKey: ["participants"],
    queryFn: () => dataClient.entities.TrainingParticipant.list("-enrollment_date"),
  });

  const { data: trainings = [], isLoading: loadingTrainings } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => dataClient.entities.Training.list("-date"),
  });

  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ["events"],
    queryFn: () => dataClient.entities.Event.list("-start_date"),
  });

  const professional = useMemo(
    () =>
      (professionals || []).find(
        (item) => String(item?.id || "").trim() === String(professionalId || "").trim()
      ) || null,
    [professionals, professionalId]
  );

  const linkedParticipations = useMemo(() => {
    if (!professional) return [];
    return (participants || []).filter((item) =>
      matchesProfessionalRecord(item, professional)
    );
  }, [participants, professional]);

  const linkedEvents = useMemo(() => {
    if (!professional) return [];
    const normalizedName = normalizeText(professional?.name);
    const normalizedId = String(professional?.id || "").trim();
    return (events || []).filter((event) => {
      const hasId = Array.isArray(event?.professional_ids)
        ? event.professional_ids.some((id) => String(id || "").trim() === normalizedId)
        : false;
      if (hasId) return true;
      if (!normalizedName) return false;
      return Array.isArray(event?.professional_names)
        ? event.professional_names.some((name) => normalizeText(name) === normalizedName)
        : false;
    });
  }, [events, professional]);

  const loading =
    loadingProfessionals || loadingParticipants || loadingTrainings || loadingEvents;

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/Professionals")}
        className="-ml-2"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Voltar para Profissionais
      </Button>

      {!professionalId ? (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-700" />
          <AlertDescription className="text-amber-800">
            ID do profissional não informado. Abra o perfil a partir da lista de
            profissionais.
          </AlertDescription>
        </Alert>
      ) : loading ? (
        <div className="min-h-[45vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : !professional ? (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-700" />
          <AlertDescription className="text-red-800">
            Profissional não encontrado.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <PageHeader
            title="Perfil do profissional"
            subtitle={`${professional.name || "Profissional"} • ${linkedParticipations.length} vínculos em treinamentos`}
          />
          <ProfessionalDetails
            professional={professional}
            participations={linkedParticipations}
            trainings={trainings}
            events={linkedEvents}
          />
        </>
      )}
    </div>
  );
}
