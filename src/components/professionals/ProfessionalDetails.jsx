import React, { useMemo, useState, useRef, useCallback } from "react";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  User,
  Mail,
  Phone,
  GraduationCap,
  CalendarDays,
  Award,
  Briefcase,
  CheckCircle2,
  Route,
  Calendar,
  RefreshCw,
  Loader2,
  Link2Off,
} from "lucide-react";
import DataTable from "@/components/common/DataTable";
import TrainingHistory from "./TrainingHistory";
import CertificatesPanel from "./CertificatesPanel";
import { dataClient } from "@/api/dataClient";
import { connectGoogleCalendar, silentGoogleToken } from "@/lib/googleAuth";
import {
  createCalendarEvent,
  updateCalendarEvent,
  buildTrainingGCalEvent,
  buildEventGCalEvent,
} from "@/lib/googleCalendarSync";
import { toast } from "@/components/ui/use-toast";

const EVENT_TYPE_LABELS = {
  viagem: "Viagem",
  trabalho_campo: "Trabalho de Campo",
  treinamento: "Treinamento",
  ferias: "Férias",
  reuniao: "Reunião",
  outro: "Outro",
};

const EVENT_STATUS_STYLES = {
  planejado: "bg-slate-100 text-slate-700",
  confirmado: "bg-blue-100 text-blue-700",
  em_andamento: "bg-amber-100 text-amber-700",
  concluido: "bg-green-100 text-green-700",
  cancelado: "bg-red-100 text-red-700",
};

const EVENT_STATUS_LABELS = {
  planejado: "Planejado",
  confirmado: "Confirmado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();

const toTimestamp = (value) => {
  if (!value) return 0;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 0;
  return parsed.getTime();
};

const formatDateLabel = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return format(parsed, "dd/MM/yyyy");
};

const isTravelEvent = (event) =>
  ["viagem", "trabalho_campo"].includes(String(event?.type || "").trim().toLowerCase());

export default function ProfessionalDetails({
  professional,
  participations,
  trainings,
  events,
}) {
  const normalizedName = normalizeText(professional?.name);
  const normalizedEmail = normalizeEmail(professional?.email);

  const matchesName = (value) =>
    normalizedName && normalizeText(value) === normalizedName;

  const matchesEmail = (value) =>
    normalizedEmail && normalizeEmail(value) === normalizedEmail;

  const getTrainingDate = (training) => {
    if (!training) return null;
    if (training.date) return training.date;
    const dates = Array.isArray(training.dates)
      ? training.dates.map((item) => item?.date).filter(Boolean)
      : [];
    if (dates.length === 0) return null;
    const parsed = dates
      .map((date) => new Date(date))
      .filter((date) => !Number.isNaN(date.getTime()));
    if (parsed.length === 0) return null;
    const earliest = new Date(Math.min(...parsed.map((date) => date.getTime())));
    return earliest.toISOString().split("T")[0];
  };

  const trainingEngagements = useMemo(() => {
    const map = new Map();

    (participations || []).forEach((participant) => {
      const key = participant.training_id || `participant-${participant.id}`;
      map.set(key, {
        ...participant,
        roles: participant.roles || [],
        engagement_type: "participant",
      });
    });

    (trainings || []).forEach((training) => {
      if (!training) return;
      const roles = [];

      if (matchesName(training.coordinator) || matchesEmail(training.coordinator_email)) {
        roles.push("Coordenador");
      }
      if (matchesName(training.instructor) || matchesEmail(training.instructor_email)) {
        roles.push("Palestrante");
      }

      const monitors = Array.isArray(training.monitors) ? training.monitors : [];
      const isMonitor = monitors.some((monitor) => {
        if (!monitor) return false;
        if (typeof monitor === "string") return matchesName(monitor);
        return matchesName(monitor.name) || matchesEmail(monitor.email);
      });
      if (isMonitor) roles.push("Monitor");

      if (roles.length === 0) return;

      const key = training.id || training.code || training.title;
      if (!key) return;

      const existing = map.get(key);
      const trainingDate = getTrainingDate(training);
      if (existing) {
        const mergedRoles = new Set([...(existing.roles || []), ...roles]);
        existing.roles = Array.from(mergedRoles);
        if (!existing.training_title && training.title) {
          existing.training_title = training.title;
        }
        if (!existing.training_date && trainingDate) {
          existing.training_date = trainingDate;
        }
        return;
      }

      map.set(key, {
        id: `role-${training.id || training.code || training.title}`,
        training_id: training.id,
        training_title: training.title || "Treinamento",
        training_date: trainingDate,
        roles,
        engagement_type: "role",
      });
    });

    return Array.from(map.values()).sort((a, b) => {
      const aTime = toTimestamp(a.training_date || a.created_date || a.date);
      const bTime = toTimestamp(b.training_date || b.created_date || b.date);
      return bTime - aTime;
    });
  }, [participations, trainings, normalizedName, normalizedEmail]);

  const participantTrainingEntries = useMemo(
    () => trainingEngagements.filter((item) => item.engagement_type !== "role"),
    [trainingEngagements]
  );

  const eventsRows = useMemo(
    () => [...(events || [])].sort((a, b) => toTimestamp(b.start_date) - toTimestamp(a.start_date)),
    [events]
  );

  const travelRows = useMemo(
    () => eventsRows.filter((item) => isTravelEvent(item)),
    [eventsRows]
  );

  const approvedCount = participantTrainingEntries.filter(
    (item) => item.approved === true || item.certificate_issued
  ).length;
  const certificatesCount = participantTrainingEntries.filter(
    (item) => item.certificate_issued || item.certificate_url
  ).length;
  const averageAttendance = participantTrainingEntries.length
    ? (
        participantTrainingEntries.reduce((sum, item) => {
          const percentage = Number(item.attendance_percentage);
          return sum + (Number.isFinite(percentage) ? percentage : 0);
        }, 0) / participantTrainingEntries.length
      ).toFixed(1)
    : "0.0";

  const recentEngagements = trainingEngagements.slice(0, 8);
  const recentEvents = eventsRows.slice(0, 8);

  // ── Google Calendar integration ─────────────────────────────────────────────
  const queryClient = useQueryClient();
  const [gcalSyncing, setGcalSyncing] = useState(false);
  const [gcalConnecting, setGcalConnecting] = useState(false);
  const isSyncingRef = useRef(false);
  const hasSynced = useRef(false);

  // Conta quantos itens ainda não foram sincronizados
  const gcalPendingCount = useMemo(() => {
    if (!professional?.google_calendar_refresh_token) return 0;
    const synced = professional.google_calendar_synced_events || {};
    let count = 0;
    for (const engagement of trainingEngagements) {
      if (engagement.training_id && !synced[`training_${engagement.training_id}`]) count++;
    }
    for (const event of eventsRows) {
      if (!synced[`event_${event.id}`]) count++;
    }
    return count;
  }, [professional, trainingEngagements, eventsRows]);

  const doSync = useCallback(async (accessToken, initialSynced) => {
    const synced = { ...(initialSynced || {}) };
    const delay = () => new Promise((r) => setTimeout(r, 400));
    let created = 0;

    for (const engagement of trainingEngagements) {
      const trainingId = engagement.training_id;
      if (!trainingId || synced[`training_${trainingId}`]) continue; // já sincronizado
      const training = (trainings || []).find((t) => t.id === trainingId);
      if (!training) continue;
      const gcEvent = buildTrainingGCalEvent(training);
      if (!gcEvent) continue;
      await delay();
      const res = await createCalendarEvent(accessToken, gcEvent);
      synced[`training_${trainingId}`] = res.id;
      created++;
    }

    for (const event of eventsRows) {
      if (synced[`event_${event.id}`]) continue; // já sincronizado
      const gcEvent = buildEventGCalEvent(event);
      if (!gcEvent) continue;
      await delay();
      const res = await createCalendarEvent(accessToken, gcEvent);
      synced[`event_${event.id}`] = res.id;
      created++;
    }

    await dataClient.entities.Professional.update(professional.id, {
      google_calendar_synced_events: synced,
    });
    queryClient.invalidateQueries({ queryKey: ["professionals"] });

    toast({
      title: "Agenda sincronizada!",
      description: created > 0
        ? `${created} novo${created > 1 ? "s evento adicionado" : " evento adicionado"}s ao Google Calendar.`
        : "Tudo já estava atualizado.",
    });
  }, [professional, trainingEngagements, eventsRows, trainings, queryClient]);

  const handleConnectGoogle = async () => {
    setGcalConnecting(true);
    try {
      const accessToken = await connectGoogleCalendar();
      hasSynced.current = true; // evita que o auto-sync dispare em paralelo
      await dataClient.entities.Professional.update(professional.id, {
        google_calendar_refresh_token: "gis_connected",
        google_calendar_synced_events: {},
      });
      queryClient.invalidateQueries({ queryKey: ["professionals"] });
      toast({ title: "Google Calendar conectado! Sincronizando eventos..." });
      await doSync(accessToken, {});
    } catch (err) {
      if (err.message !== "access_denied" && err.message !== "popup_closed_by_user") {
        toast({ title: "Erro ao conectar", description: err.message, variant: "destructive" });
      }
    } finally {
      setGcalConnecting(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    await dataClient.entities.Professional.update(professional.id, {
      google_calendar_refresh_token: null,
      google_calendar_synced_events: {},
    });
    hasSynced.current = false;
    queryClient.invalidateQueries({ queryKey: ["professionals"] });
    toast({ title: "Google Calendar desconectado." });
  };

  const handleSyncGoogle = useCallback(async () => {
    if (!professional.google_calendar_refresh_token) return;
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setGcalSyncing(true);
    try {
      const accessToken = await silentGoogleToken();
      await doSync(accessToken, professional.google_calendar_synced_events || {});
    } catch (err) {
      toast({ title: "Erro na sincronização", description: err.message, variant: "destructive" });
    } finally {
      isSyncingRef.current = false;
      setGcalSyncing(false);
    }
  }, [professional, doSync]);

  // ────────────────────────────────────────────────────────────────────────────

  const eventColumns = [
    {
      header: "Data",
      render: (row) => {
        const start = formatDateLabel(row.start_date);
        const end =
          row.end_date && row.end_date !== row.start_date
            ? ` até ${formatDateLabel(row.end_date)}`
            : "";
        return `${start}${end}`;
      },
    },
    { header: "Evento", accessor: "title", cellClassName: "font-medium" },
    {
      header: "Categoria",
      render: (row) => {
        const type = String(row.type || "").trim().toLowerCase();
        return (
          <Badge variant="outline">
            {EVENT_TYPE_LABELS[type] || row.type || "Evento"}
          </Badge>
        );
      },
    },
    {
      header: "Local",
      render: (row) => row.location || row.online_link || "-",
    },
    {
      header: "Status",
      render: (row) => {
        const status = String(row.status || "").trim().toLowerCase();
        return (
          <Badge className={EVENT_STATUS_STYLES[status] || "bg-slate-100 text-slate-700"}>
            {EVENT_STATUS_LABELS[status] || row.status || "Sem status"}
          </Badge>
        );
      },
    },
  ];

  if (!professional) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Identificação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center">
                <User className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-lg text-slate-900">{professional.name}</p>
                {professional.position && (
                  <p className="text-sm text-slate-500">{professional.position}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-slate-500">RG</p>
                <p className="font-medium">{professional.rg || "-"}</p>
              </div>
              <div>
                <p className="text-slate-500">CPF</p>
                <p className="font-medium">{professional.cpf || "-"}</p>
              </div>
              <div>
                <p className="text-slate-500">Matrícula</p>
                <p className="font-medium">{professional.registration || "-"}</p>
              </div>
              <div>
                <p className="text-slate-500">Setor</p>
                <p className="font-medium">{professional.sector || "-"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-slate-700">
              <Mail className="h-4 w-4 text-slate-400" />
              {professional.email ? (
                <a href={`mailto:${professional.email}`} className="hover:underline">
                  {professional.email}
                </a>
              ) : (
                "-"
              )}
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <Mail className="h-4 w-4 text-slate-400" />
              {professional.google_email ? (
                <a href={`mailto:${professional.google_email}`} className="hover:underline">
                  Google: {professional.google_email}
                </a>
              ) : (
                "Google: -"
              )}
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <Phone className="h-4 w-4 text-slate-400" />
              {professional.phone || "-"}
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <Briefcase className="h-4 w-4 text-slate-400" />
              {professional.position || professional.sector || "-"}
            </div>

            <div className="border-t pt-3 mt-1 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Google Calendar
              </p>
              {professional.google_calendar_refresh_token ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                    <span className="text-xs text-slate-500">Conectado</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={handleSyncGoogle}
                      disabled={gcalSyncing}
                    >
                      {gcalSyncing ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      {gcalSyncing
                        ? "Sincronizando..."
                        : gcalPendingCount > 0
                          ? `Sincronizar (${gcalPendingCount})`
                          : "Sincronizar"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-slate-400 hover:text-red-500"
                      onClick={handleDisconnectGoogle}
                    >
                      <Link2Off className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs gap-2"
                  onClick={handleConnectGoogle}
                  disabled={gcalConnecting}
                >
                  {gcalConnecting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  )}
                  {gcalConnecting ? "Aguardando autorização..." : "Conectar Google Calendar"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-semibold text-blue-700">{trainingEngagements.length}</p>
            <p className="text-xs text-slate-500">Vínculos em treinamentos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-semibold text-green-700">{approvedCount}</p>
            <p className="text-xs text-slate-500">Aprovações</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-semibold text-amber-700">{certificatesCount}</p>
            <p className="text-xs text-slate-500">Certificados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-semibold text-indigo-700">{eventsRows.length}</p>
            <p className="text-xs text-slate-500">Eventos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-semibold text-purple-700">{travelRows.length}</p>
            <p className="text-xs text-slate-500">Viagens/Campo</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg bg-muted p-1 md:grid-cols-4">
          <TabsTrigger value="overview" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Resumo
          </TabsTrigger>
          <TabsTrigger value="trainings" className="gap-1.5">
            <GraduationCap className="h-3.5 w-3.5" />
            Treinamentos
          </TabsTrigger>
          <TabsTrigger value="certificates" className="gap-1.5">
            <Award className="h-3.5 w-3.5" />
            Certificados
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            Eventos e viagens
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">
                  Últimos treinamentos e atuações
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[320px] pr-3">
                  <div className="space-y-3 pr-2">
                    {recentEngagements.length === 0 ? (
                      <p className="text-sm text-slate-500">Sem registros de treinamento.</p>
                    ) : (
                      recentEngagements.map((item) => (
                        <div
                          key={`${item.id}-${item.training_id || item.training_title}`}
                          className="rounded-md border bg-slate-50 p-3"
                        >
                          <p className="font-medium text-slate-900">
                            {item.training_title || "Treinamento"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="outline">
                              {item.training_date ? formatDateLabel(item.training_date) : "Sem data"}
                            </Badge>
                            {item.engagement_type === "role" ? (
                              <Badge className="bg-purple-100 text-purple-700">Atuação</Badge>
                            ) : (
                              <Badge className="bg-blue-100 text-blue-700">Participação</Badge>
                            )}
                            {(item.roles || []).map((role) => (
                              <Badge key={`${item.id}-${role}`} variant="outline">
                                {role}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">
                  Últimos eventos e viagens
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[320px] pr-3">
                  <div className="space-y-3 pr-2">
                    {recentEvents.length === 0 ? (
                      <p className="text-sm text-slate-500">Sem eventos vinculados.</p>
                    ) : (
                      recentEvents.map((event) => {
                        const type = String(event?.type || "").trim().toLowerCase();
                        const status = String(event?.status || "").trim().toLowerCase();
                        return (
                          <div key={event.id} className="rounded-md border bg-slate-50 p-3">
                            <p className="font-medium text-slate-900">{event.title || "Evento"}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge variant="outline">
                                {formatDateLabel(event.start_date)}
                              </Badge>
                              <Badge variant="outline">
                                {EVENT_TYPE_LABELS[type] || event.type || "Evento"}
                              </Badge>
                              <Badge
                                className={
                                  EVENT_STATUS_STYLES[status] ||
                                  "bg-slate-100 text-slate-700"
                                }
                              >
                                {EVENT_STATUS_LABELS[status] || event.status || "Sem status"}
                              </Badge>
                            </div>
                            {(event.location || event.online_link) && (
                              <p className="mt-2 text-xs text-slate-500">
                                {event.location || event.online_link}
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trainings" className="mt-6">
          <Card>
            <CardContent className="pt-4">
              <ScrollArea className="h-[65vh] pr-3">
                <div className="pr-2">
                  <TrainingHistory professional={professional} entries={trainingEngagements} />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="certificates" className="mt-6">
          <Card>
            <CardContent className="pt-4">
              <ScrollArea className="h-[65vh] pr-3">
                <div className="pr-2">
                  <CertificatesPanel
                    professional={professional}
                    entries={participantTrainingEntries}
                  />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="mt-6 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xl font-semibold text-slate-900">{eventsRows.length}</p>
                <p className="text-xs text-slate-500">Total de eventos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xl font-semibold text-emerald-700">{travelRows.length}</p>
                <p className="text-xs text-slate-500">Viagens / Campo</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xl font-semibold text-blue-700">
                  {eventsRows.filter((event) => !isTravelEvent(event)).length}
                </p>
                <p className="text-xs text-slate-500">Outros eventos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xl font-semibold text-purple-700">{averageAttendance}%</p>
                <p className="text-xs text-slate-500">Média de presença</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Route className="h-4 w-4" />
                Agenda consolidada (eventos, viagens e trabalho de campo)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[65vh] overflow-y-auto">
                <DataTable
                  columns={eventColumns}
                  data={eventsRows}
                  emptyMessage="Nenhum evento registrado para este profissional"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}