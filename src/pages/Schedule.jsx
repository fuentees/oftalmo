import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
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
  Circle
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday } from "date-fns";
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

  const queryClient = useQueryClient();

  // Check URL params to auto-open form
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'create') {
      setShowEventForm(true);
    }
  }, []);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => dataClient.entities.Event.list("-start_date"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => dataClient.entities.Event.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setDeleteEvent(null);
    },
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

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

  const statusLabels = {
    planejado: "Planejado",
    confirmado: "Confirmado",
    em_andamento: "Em Andamento",
    concluido: "Concluído",
    cancelado: "Cancelado",
  };

  const statusColors = {
    planejado: "bg-blue-100 text-blue-700",
    confirmado: "bg-green-100 text-green-700",
    em_andamento: "bg-amber-100 text-amber-700",
    concluido: "bg-slate-100 text-slate-700",
    cancelado: "bg-red-100 text-red-700",
  };

  const getEventsForDate = (date) => {
    return events.filter((event) => {
      const eventStart = new Date(event.start_date);
      const eventEnd = event.end_date ? new Date(event.end_date) : eventStart;
      return date >= eventStart && date <= eventEnd;
    });
  };

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
    setShowEventForm(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda"
        subtitle="Gerencie viagens, trabalhos de campo, treinamentos e eventos"
        actionLabel="Novo Evento"
        actionIcon={Plus}
        onActionClick={handleNewEvent}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="lg:col-span-2">
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
                    onClick={() => setSelectedDate(day)}
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
                            onClick={() => setDeleteEvent(event)}
                          >
                            <Trash2 className="h-3 w-3 text-red-600" />
                          </Button>
                        </div>
                      </div>

                      {event.description && (
                        <p className="text-xs text-slate-600">{event.description}</p>
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
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {event.professional_names.join(", ")}
                          </div>
                        )}
                      </div>

                      <Badge className={statusColors[event.status]}>
                        {statusLabels[event.status]}
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
              Tem certeza que deseja excluir "{deleteEvent?.title}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteEvent.id)}
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