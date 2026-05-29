import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { format } from "date-fns";
import {
  Users,
  ArrowUpCircle,
  Trash2,
  Mail,
  Loader2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function WaitlistManager({ training }) {
  const queryClient = useQueryClient();
  const [promotingId, setPromotingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [confirmPromote, setConfirmPromote] = useState(null);

  const { data: waitlist = [], isLoading } = useQuery({
    queryKey: ["waitlist", training.id],
    queryFn: () =>
      dataClient.entities.TrainingWaitlist.filter(
        { training_id: training.id },
        "position_in_queue"
      ),
    enabled: !!training?.id,
  });

  const promoteMutation = useMutation({
    mutationFn: async (entry) => {
      // Cria inscrição ativa
      await dataClient.entities.TrainingParticipant.create({
        training_id: training.id,
        training_title: training.title,
        professional_name: entry.professional_name,
        professional_email: entry.professional_email,
        professional_cpf: entry.professional_cpf,
        professional_rg: entry.professional_rg,
        professional_registration: entry.professional_registration,
        professional_sector: entry.professional_sector,
        professional_formation: entry.professional_formation,
        institution: entry.institution,
        state: entry.state,
        municipality: entry.municipality,
        position: entry.position,
        commercial_phone: entry.commercial_phone,
        mobile_phone: entry.mobile_phone,
        enrollment_status: "confirmado",
        enrollment_date: new Date().toISOString(),
      });
      // Remove da lista de espera
      await dataClient.entities.TrainingWaitlist.delete(entry.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waitlist", training.id] });
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      queryClient.invalidateQueries({ queryKey: ["participants"] });
      setPromotingId(null);
      setConfirmPromote(null);
    },
    onError: () => setPromotingId(null),
  });

  const removeMutation = useMutation({
    mutationFn: (id) => dataClient.entities.TrainingWaitlist.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waitlist", training.id] });
      setRemovingId(null);
    },
    onError: () => setRemovingId(null),
  });

  const handlePromote = (entry) => {
    setConfirmPromote(entry);
  };

  const handleConfirmPromote = () => {
    if (!confirmPromote) return;
    setPromotingId(confirmPromote.id);
    promoteMutation.mutate(confirmPromote);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Carregando lista de espera...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold text-slate-700">
            Lista de espera
          </span>
          <Badge className="bg-amber-100 text-amber-700">{waitlist.length}</Badge>
        </div>
        {waitlist.length > 0 && (
          <p className="text-xs text-slate-400">
            Promova para confirmar a inscrição automaticamente.
          </p>
        )}
      </div>

      {waitlist.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
            <Users className="h-5 w-5 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-500">
            Nenhuma pessoa na lista de espera.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {waitlist.map((entry, idx) => (
            <Card key={entry.id} className="border-slate-200 shadow-none">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {entry.professional_name || "—"}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {entry.professional_email && (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {entry.professional_email}
                      </span>
                    )}
                    {entry.municipality && (
                      <span className="text-xs text-slate-400">
                        {entry.municipality}
                        {entry.state ? ` / ${entry.state}` : ""}
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      {entry.created_at
                        ? format(new Date(entry.created_at), "dd/MM/yyyy HH:mm")
                        : ""}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-green-200 text-green-700 hover:bg-green-50"
                    onClick={() => handlePromote(entry)}
                    disabled={promotingId === entry.id}
                  >
                    {promotingId === entry.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ArrowUpCircle className="h-3 w-3" />
                    )}
                    Promover
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => {
                      setRemovingId(entry.id);
                      removeMutation.mutate(entry.id);
                    }}
                    disabled={removingId === entry.id}
                  >
                    {removingId === entry.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!confirmPromote} onOpenChange={(open) => !open && setConfirmPromote(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promover da lista de espera?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{confirmPromote?.professional_name}</strong> será movido para inscritos com status{" "}
              <strong>confirmado</strong>. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPromote}>Promover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
