import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import {
  extractOnlineLinkFromEventNotes,
  extractTrainingIdFromEventNotes,
} from "@/lib/eventMetadata";
import { getEffectiveEventStatus } from "@/lib/statusRules";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus,
  MapPin,
  Clock,
  Edit,
  Trash2,
  Plane,
  Briefcase,
  GraduationCap,
  Umbrella,
  Users,
  Circle,
  ExternalLink
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import PageHeader from "../components/common/PageHeader";
import EventForm from "../components/schedule/EventForm";
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

export default function Schedule() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [deleteEvent, setDeleteEvent] = useState(null);
  const [deleteStatus, setDeleteStatus] = useState(null);
  const [prefillDate, setPrefillDate] = useState(null);
  const statusUpdateRef = useRef(new Map());

  const queryClient = useQueryClient();

  // Check URL params to auto-open form
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'create') {
      setShowEventForm(true);
    }
  }, []);

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: () => dataClient.entities.Event.list("-start_date"),
  });

  const normalizeComparisonText = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const getTrainingPrimaryDate = (training) => {
    if (Array.isArray(training?.dates) && training.dates.length > 0) {
      const firstDate = training.dates.find((item) => item?.date)?.date;
      if (firstDate) return String(firstDate);
    }
    if (training?.date) return String(training.date);
    return "";
  };

  const findLegacyTrainingFromEvent = (eventData, trainings) => {
    if (!eventData || !Array.isArray(trainings)) return null;
    const expectedTitle = normalizeComparisonText(eventData.title);
    const expectedStartDate = String(eventData.start_date || "");
    return (
      trainings.find((item) => {
        if (!item?.id) return false;
        const sameTitle =
          normalizeComparisonText(item.title) === expectedTitle;
        if (!sameTitle) return false;
        if (!expectedStartDate) return true;
        return getTrainingPrimaryDate(item) === expectedStartDate;
      }) || null
    );
  };

  const mapEventStatusToTrainingStatus = (status) => {
    const normalized = String(status || "").trim().toLowerCase();
    if (normalized === "confirmado") return "confirmado";
    if (normalized === "em_andamento") return "em_andamento";
    if (normalized === "concluido") return "concluido";
    if (normalized === "cancelado") return "cancelado";
    return "agendado";
  };

  const resolveLinkedTrainingId = async (eventData) => {
    const directTrainingId = String(
      extractTrainingIdFromEventNotes(eventData?.notes) || ""
    ).trim();
    if (directTrainingId) return directTrainingId;
    if (eventData?.type !== "treinamento") return "";
    const trainings = await dataClient.entities.Training.list("-date");
    const legacyTraining = findLegacyTrainingFromEvent(eventData, trainings);
    return String(legacyTraining?.id || "").trim();
  };

  const syncLinkedTrainingStatus = async (eventData, nextEventStatus) => {
    if (eventData?.type !== "treinamento") return;
    const linkedTrainingId = await resolveLinkedTrainingId(eventData);
    if (!linkedTrainingId) return;
    const nextTrainingStatus = mapEventStatusToTrainingStatus(nextEventStatus);
    try {
      await dataClient.entities.Training.update(linkedTrainingId, {
        status: nextTrainingStatus,
      });
    } catch (error) {
      const message = String(error?.message || "").toLowerCase();
      if (
        message.includes("not found") ||
        message.includes("no rows") ||
        message.includes("0 rows")
      ) {
        return;
      }
      throw error;
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (eventToDelete) => {
      const eventId = String(eventToDelete?.id || "").trim();
      if (!eventId) {
        throw new Error("Evento inválido para exclusão.");
      }

      const deleteTrainingSafely = async (trainingId) => {
        if (!trainingId) return false;
        try {
          await dataClient.entities.Training.delete(trainingId);
          return true;
        } catch (error) {
          const message = String(error?.message || "").toLowerCase();
          if (
            message.includes("not found") ||
            message.includes("no rows") ||
            message.includes("0 rows")
          ) {
            return false;
          }
          throw error;
        }
      };

      await dataClient.entities.Event.delete(eventId);

      let deletedTraining = false;
      let warningMessage = null;
      const linkedTrainingId = extractTrainingIdFromEventNotes(
        eventToDelete?.notes
      );

      if (linkedTrainingId) {
        deletedTraining = await deleteTrainingSafely(linkedTrainingId);
      } else if (eventToDelete?.type === "treinamento") {
        const trainings = await dataClient.entities.Training.list("-date");
        const legacyTraining = findLegacyTrainingFromEvent(
          eventToDelete,
          trainings
        );
        if (legacyTraining?.id) {
          deletedTraining = await deleteTrainingSafely(legacyTraining.id);
        }
      }

      if (eventToDelete?.type === "treinamento" && !deletedTraining) {
        warningMessage =
          "Evento excluído, mas nenhum treinamento vinculado foi encontrado para remover.";
      }

      return { deletedTraining, warningMessage };
    },
    onSuccess: ({ deletedTraining, warningMessage }) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      setDeleteEvent(null);
      if (warningMessage) {
        setDeleteStatus({ type: "warning", message: warningMessage });
        return;
      }
      setDeleteStatus({
        type: "success",
        message: deletedTraining
          ? "Evento e treinamento vinculado foram excluídos."
          : "Evento excluído com sucesso.",
      });
    },
    onError: (error) => {
      setDeleteStatus({
        type: "error",
        message: error?.message || "Não foi possível excluir o evento.",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (payload) => {
      await dataClient.entities.Event.update(payload.id, { status: payload.status });
      await syncLinkedTrainingStatus(payload.event, payload.status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
    },
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const daysInMonth = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  });

  const typeIcons = {
    viagem: Plane,
    trabalho_campo: Briefcase,
    treinamento: GraduationCap,
    ferias: Umbrella,
    reuniao: Users,
    outro: Circle,
  };

  const typeColors = {
    viagem: "#10b981",
    trabalho_campo: "#f59e0b",
    treinamento: "#6366f1",
    ferias: "#ec4899",
    reuniao: "#8b5cf6",
    outro: "#64748b",
  };

  const typeLabels = {
    viagem: "Viagem",
    trabalho_campo: "Trabalho de Campo",
    treinamento: "Treinamento",
    ferias: "Férias",
    reuniao: "Reunião",
    outro: "Outro",
  };

  const statusLabels = {
    agendado: "Agendado",
    planejado: "Planejado",
    confirmado: "Confirmado",
    em_andamento: "Em Andamento",
    concluido: "Concluído",
    cancelado: "Cancelado",
  };

  const statusColors = {
    agendado: "bg-blue-100 text-blue-700",
    planejado: "bg-blue-100 text-blue-700",
    confirmado: "bg-green-100 text-green-700",
    em_andamento: "bg-amber-100 text-amber-700",
    concluido: "bg-slate-100 text-slate-700",
    cancelado: "bg-red-100 text-red-700",
  };

  const parseLocalDate = (value) => {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const parts = trimmed.split("-");
      if (parts.length === 3) {
        const year = Number(parts[0]);
        const month = Number(parts[1]);
        const day = Number(parts[2]);
        if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
          return new Date(year, month - 1, day);
        }
      }
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
      }
    }
    return null;
  };

  const getOnlineLink = (event) => {
    if (!event) return "";
    const direct = String(event.online_link || "").trim();
    if (direct) return direct;
    const fromNotes = extractOnlineLinkFromEventNotes(event.notes);
    if (fromNotes) return fromNotes;
    const fromDescription = extractOnlineLinkFromEventNotes(event.description);
    return fromDescription;
  };

  const getEventsForDate = (date) => {
    return events.filter((event) => {
      const eventStart = parseLocalDate(event.start_date);
      const eventEnd = parseLocalDate(event.end_date || event.start_date);
      if (!eventStart || !eventEnd) return false;
      return date >= eventStart && date <= eventEnd;
    });
  };

  const getEffectiveStatus = (event) => getEffectiveEventStatus(event);

  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleEditEvent = (event) => {
    setEditingEvent(event);
    setShowEventForm(true);
  };

  const handleNewEvent = () => {
    setEditingEvent(null);
    setPrefillDate(
      selectedDate ? format(selectedDate, "yyyy-MM-dd") : null
    );
    setShowEventForm(true);
  };

  const handleDayClick = (day) => {
    if (selectedDate && isSameDay(day, selectedDate)) {
      setEditingEvent(null);
      setPrefillDate(format(day, "yyyy-MM-dd"));
      setShowEventForm(true);
      return;
    }
    setSelectedDate(day);
  };

  React.useEffect(() => {
    const syncStatuses = async () => {
      if (!events || events.length === 0) return;
      const updates = [];
      events.forEach((event) => {
        const effective = getEffectiveStatus(event);
        if (!effective || effective === event.status) return;
        const lastStatus = statusUpdateRef.current.get(event.id);
        if (lastStatus === effective) return;
        if (event.status === "cancelado") return;
        updates.push({ id: event.id, status: effective });
        statusUpdateRef.current.set(event.id, effective);
      });
      if (updates.length === 0) return;
      await Promise.all(
        updates.map((payload) =>
          dataClient.entities.Event.update(payload.id, { status: payload.status })
        )
      );
      queryClient.invalidateQueries({ queryKey: ["events"] });
    };

    syncStatuses();
    const timer = window.setInterval(syncStatuses, 60000);
    return () => window.clearInterval(timer);
  }, [events, queryClient]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda"
        subtitle="Gerencie viagens, trabalhos de campo, treinamentos e eventos"
        actionLabel="Novo Evento"
        actionIcon={Plus}
        onActionClick={handleNewEvent}
      />

      {deleteStatus && (
        <Alert
          className={
            deleteStatus.type === "error"
              ? "border-red-200 bg-red-50"
              : deleteStatus.type === "warning"
                ? "border-amber-200 bg-amber-50"
                : "border-green-200 bg-green-50"
          }
        >
          <AlertDescription
            className={
              deleteStatus.type === "error"
                ? "text-red-800"
                : deleteStatus.type === "warning"
                  ? "text-amber-800"
                  : "text-green-800"
            }
          >
            {deleteStatus.message}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* Calendar */}
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">
                  {format(currentDate, "MMMM yyyy", { locale: ptBR })}
                </CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleToday}>
                    Hoje
                  </Button>
                  <Button variant="outline" size="sm" onClick={handlePrevMonth}>
                    ←
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleNextMonth}>
                    →
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-7 border-b">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
                  <div
                    key={day}
                    className="p-2 text-center text-xs font-semibold text-slate-600 border-r last:border-r-0"
                  >
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {daysInMonth.map((day, index) => {
                  const dayEvents = getEventsForDate(day);
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const isTodayDate = isToday(day);

                  return (
                    <div
                      key={index}
                      onClick={() => handleDayClick(day)}
                      className={`min-h-24 p-2 border-r border-b last:border-r-0 cursor-pointer hover:bg-slate-50 transition-colors ${
                        !isSameMonth(day, currentDate) ? "bg-slate-50" : ""
                      } ${isSelected ? "bg-blue-50" : ""}`}
                    >
                      <div
                        className={`text-sm font-medium mb-1 ${
                          isTodayDate
                            ? "w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center"
                            : ""
                        }`}
                      >
                        {format(day, "d")}
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 2).map((event) => {
                          const Icon = typeIcons[event.type] || Circle;
                          return (
                            <div
                              key={event.id}
                              className="text-xs p-1 rounded truncate flex items-center gap-1"
                              style={{
                                backgroundColor: event.color + "20",
                                color: event.color,
                              }}
                            >
                              <Icon className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{event.title}</span>
                            </div>
                          );
                        })}
                        {dayEvents.length > 2 && (
                          <div className="text-xs text-slate-500 pl-1">
                            +{dayEvents.length - 2} mais
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Legenda */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-slate-600 mb-2">Legenda</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(typeLabels).map(([key, label]) => (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: typeColors[key] }}
                    />
                    {label}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Events List */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-lg">
              {selectedDate ? format(selectedDate, "dd 'de' MMMM", { locale: ptBR }) : "Eventos"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
            {selectedDateEvents.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">
                {selectedDate ? "Nenhum evento nesta data" : "Selecione uma data"}
              </p>
            ) : (
              selectedDateEvents.map((event) => {
                const Icon = typeIcons[event.type] || Circle;
                const effectiveStatus = getEffectiveStatus(event);
                const showPlanActions =
                  effectiveStatus === "planejado" || effectiveStatus === "agendado";
                return (
                  <Card key={event.id} className="border shadow-sm">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1">
                          <div
                            className="p-2 rounded-lg"
                            style={{ backgroundColor: event.color + "20" }}
                          >
                            <Icon className="h-4 w-4" style={{ color: event.color }} />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-sm">{event.title}</h4>
                            <p className="text-xs text-slate-500">{typeLabels[event.type]}</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditEvent(event)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteStatus(null);
                              setDeleteEvent(event);
                            }}
                          >
                            <Trash2 className="h-3 w-3 text-red-600" />
                          </Button>
                        </div>
                      </div>

                      {event.description && (
                        <p className="text-xs text-slate-600">{event.description}</p>
                      )}

                      {getOnlineLink(event) && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(getOnlineLink(event), "_blank")}
                          className="h-7 px-2 text-xs"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Evento online
                        </Button>
                      )}

                      {showPlanActions && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateStatusMutation.mutate({
                                id: event.id,
                                status: "confirmado",
                                event,
                              })
                            }
                            className="h-7 px-2 text-xs"
                          >
                            Confirmar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateStatusMutation.mutate({
                                id: event.id,
                                status: "cancelado",
                                event,
                              })
                            }
                            className="h-7 px-2 text-xs text-red-600 border-red-200"
                          >
                            Cancelar
                          </Button>
                        </div>
                      )}

                      <div className="space-y-1 text-xs text-slate-500">
                        {event.start_time && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {event.start_time}
                            {event.end_time && ` - ${event.end_time}`}
                          </div>
                        )}
                        {event.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {event.location}
                          </div>
                        )}
                        {event.professional_names && event.professional_names.length > 0 && (
                          <div className="flex items-start gap-1">
                            <Users className="h-3 w-3 mt-0.5" />
                            <ul className="list-disc pl-4 space-y-0.5">
                              {event.professional_names.map((name) => (
                                <li key={name}>{name}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      <Badge className={statusColors[effectiveStatus]}>
                        {statusLabels[effectiveStatus]}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Event Form Dialog */}
      <Dialog open={showEventForm} onOpenChange={setShowEventForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEvent ? "Editar" : "Novo"} Evento</DialogTitle>
          </DialogHeader>
          <EventForm
            event={editingEvent}
            initialDate={prefillDate}
            onClose={() => {
              setShowEventForm(false);
              setEditingEvent(null);
            }}
            onSuccess={() => {
              setShowEventForm(false);
              setEditingEvent(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteEvent} onOpenChange={() => setDeleteEvent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Evento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deleteEvent?.title}"?
              {deleteEvent?.type === "treinamento" &&
                " O treinamento vinculado também será removido."}{" "}
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteEvent)}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Floating Action Button */}
      <Button
        onClick={handleNewEvent}
        className="fixed bottom-8 right-8 h-14 w-14 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700"
        size="icon"
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}