import React, { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, X } from "lucide-react";
import { format } from "date-fns";

export default function EventForm({ event, onClose, onSuccess, initialDate }) {
  const [formData, setFormData] = useState({
    title: "",
    type: "outro",
    description: "",
    start_date: "",
    end_date: "",
    start_time: "",
    end_time: "",
    municipality: "",
    gve: "",
    online_link: "",
    professional_ids: [],
    professional_names: [],
    status: "planejado",
    color: "#3b82f6",
    notes: "",
  });
  const [gveMapping, setGveMapping] = useState([]);
  const [repeatConfig, setRepeatConfig] = useState({
    enabled: false,
    weeks: 4,
    days: [],
  });
  const [vacationDays, setVacationDays] = useState(null);
  const ONLINE_LINK_PREFIX = "link_online:";
  const weekDays = [
    { value: 0, label: "Dom" },
    { value: 1, label: "Seg" },
    { value: 2, label: "Ter" },
    { value: 3, label: "Qua" },
    { value: 4, label: "Qui" },
    { value: 5, label: "Sex" },
    { value: 6, label: "Sáb" },
  ];

  const queryClient = useQueryClient();

  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => dataClient.entities.Professional.list(),
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem("gveMappingSp");
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setGveMapping(parsed);
      }
    } catch (error) {
      // Ignora erro de leitura
    }
  }, []);

  const normalizeText = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const gveMap = useMemo(() => {
    const map = new Map();
    gveMapping.forEach((item) => {
      const key = normalizeText(item.municipio);
      if (!key) return;
      if (map.has(key)) return;
      map.set(key, String(item.gve || "").trim());
    });
    return map;
  }, [gveMapping]);

  const municipalityOptions = useMemo(() => {
    const values = gveMapping
      .map((item) => String(item.municipio || "").trim())
      .filter(Boolean);
    const unique = Array.from(new Set(values));
    return unique.sort((a, b) => a.localeCompare(b));
  }, [gveMapping]);

  const getGveByMunicipio = (value) => {
    const key = normalizeText(value);
    if (!key) return "";
    return gveMap.get(key) || "";
  };

  const parseLocation = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return { municipality: "", gve: "" };
    const hasGve = /gve/i.test(raw);
    if (!hasGve) return { municipality: raw, gve: "" };
    const match = raw.match(/^(.*?)\s*(?:-|•|\|)?\s*GVE\s*[:\-]?\s*(.+)$/i);
    if (match) {
      return {
        municipality: String(match[1] || "").trim(),
        gve: String(match[2] || "").trim(),
      };
    }
    return { municipality: raw, gve: "" };
  };

  const parseDateInput = (value) => {
    if (!value) return null;
    const parts = String(value).split("-");
    if (parts.length !== 3) return null;
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null;
    }
    return new Date(year, month - 1, day);
  };

  const formatDate = (date) => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const addDays = (date, days) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  };

  const getWeekday = (dateValue) => {
    const parsed = parseDateInput(dateValue);
    if (!parsed) return null;
    return parsed.getDay();
  };

  const startOfWeek = (date, weekStartsOn = 1) => {
    const day = date.getDay();
    const diff = (day - weekStartsOn + 7) % 7;
    const start = new Date(date);
    start.setDate(date.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return start;
  };

  const buildRecurringEvents = (basePayload) => {
    if (!repeatConfig.enabled || repeatConfig.days.length === 0) {
      return [basePayload];
    }
    const startDate = parseDateInput(basePayload.start_date);
    if (!startDate) return [basePayload];
    const rangeEnd = basePayload.end_date
      ? parseDateInput(basePayload.end_date)
      : null;

    const occurrences = [];

    if (rangeEnd && rangeEnd >= startDate) {
      let cursor = new Date(startDate);
      while (cursor <= rangeEnd) {
        if (repeatConfig.days.includes(cursor.getDay())) {
          occurrences.push({
            ...basePayload,
            start_date: formatDate(cursor),
            end_date: formatDate(cursor),
          });
        }
        cursor = addDays(cursor, 1);
      }
      return occurrences.length > 0 ? occurrences : [basePayload];
    }

    const weekStart = startOfWeek(startDate, 1);
    const weeks = Math.max(1, Number(repeatConfig.weeks) || 1);

    for (let weekIndex = 0; weekIndex < weeks; weekIndex += 1) {
      const baseWeek = addDays(weekStart, weekIndex * 7);
      repeatConfig.days.forEach((weekday) => {
        const offset = (weekday - 1 + 7) % 7;
        const occurrenceStart = addDays(baseWeek, offset);
        if (weekIndex === 0 && occurrenceStart < startDate) return;
        occurrences.push({
          ...basePayload,
          start_date: formatDate(occurrenceStart),
          end_date: formatDate(occurrenceStart),
        });
      });
    }

    return occurrences.length > 0 ? occurrences : [basePayload];
  };

  const formatLocation = (municipality, gve) => {
    const cleanMunicipality = String(municipality || "").trim();
    const cleanGve = String(gve || "").trim();
    if (cleanMunicipality && cleanGve) {
      return `${cleanMunicipality} - GVE ${cleanGve}`;
    }
    return cleanMunicipality || (cleanGve ? `GVE ${cleanGve}` : "");
  };

  const extractOnlineLink = (value) => {
    if (!value) return "";
    const lines = String(value).split("\n");
    const match = lines.find((line) =>
      line.trim().toLowerCase().startsWith(ONLINE_LINK_PREFIX)
    );
    if (!match) return "";
    return match.slice(ONLINE_LINK_PREFIX.length).trim();
  };

  const stripOnlineLink = (value) => {
    if (!value) return "";
    return String(value)
      .split("\n")
      .filter(
        (line) => !line.trim().toLowerCase().startsWith(ONLINE_LINK_PREFIX)
      )
      .join("\n")
      .trim();
  };

  const mergeNotesWithLink = (notes, link) => {
    const cleanNotes = stripOnlineLink(notes);
    const cleanLink = String(link || "").trim();
    if (!cleanLink) return cleanNotes;
    return [cleanNotes, `${ONLINE_LINK_PREFIX} ${cleanLink}`]
      .filter(Boolean)
      .join("\n")
      .trim();
  };

  useEffect(() => {
    if (event) {
      const parsed = parseLocation(event.location);
      const linkFromNotes = extractOnlineLink(event.notes);
      const cleanNotes = stripOnlineLink(event.notes);
      const link =
        String(event.online_link || "").trim() || linkFromNotes || "";
      if (event.type === "ferias" && event.start_date && event.end_date) {
        const start = parseDateInput(event.start_date);
        const end = parseDateInput(event.end_date);
        if (start && end) {
          const diff = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
          if (diff === 15 || diff === 30) {
            setVacationDays(diff);
          }
        }
      }
      setFormData({
        title: event.title || "",
        type: event.type || "outro",
        description: event.description || "",
        start_date: event.start_date || "",
        end_date: event.end_date || "",
        start_time: event.start_time || "",
        end_time: event.end_time || "",
        municipality: parsed.municipality || event.location || "",
        gve: parsed.gve || "",
        online_link: link,
        professional_ids: event.professional_ids || [],
        professional_names: event.professional_names || [],
        status: event.status || "planejado",
        color: event.color || "#3b82f6",
        notes: cleanNotes || "",
      });
    }
  }, [event]);

  useEffect(() => {
    if (event || !initialDate) return;
    setFormData((prev) => ({
      ...prev,
      start_date: prev.start_date || initialDate,
    }));
  }, [event, initialDate]);

  useEffect(() => {
    if (formData.type !== "ferias") {
      if (vacationDays) setVacationDays(null);
      return;
    }
    if (!vacationDays) return;
    if (!formData.start_date) return;
    const start = parseDateInput(formData.start_date);
    if (!start) return;
    const end = addDays(start, vacationDays - 1);
    const nextEnd = formatDate(end);
    if (nextEnd !== formData.end_date) {
      setFormData((prev) => ({
        ...prev,
        end_date: nextEnd,
      }));
    }
  }, [formData.type, formData.start_date, vacationDays, formData.end_date]);

  useEffect(() => {
    if (event || !repeatConfig.enabled) return;
    if (repeatConfig.days.length > 0) return;
    const weekday = getWeekday(formData.start_date);
    if (weekday === null) return;
    setRepeatConfig((prev) => ({
      ...prev,
      days: [weekday],
    }));
  }, [event, repeatConfig.enabled, repeatConfig.days.length, formData.start_date]);

  const saveMutation = useMutation({
    mutationFn: async (/** @type {any} */ data) => {
      if (event) {
        const payload = data?.data || data;
        return dataClient.entities.Event.update(event.id, payload);
      }
      if (data?.mode === "bulk") {
        return dataClient.entities.Event.bulkCreate(data.items || []);
      }
      return dataClient.entities.Event.create(data?.data || data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      onSuccess?.();
      onClose();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const location = formatLocation(formData.municipality, formData.gve);
    const notes = mergeNotesWithLink(formData.notes, formData.online_link);
    const payload = {
      ...formData,
      location,
      notes,
      end_date: formData.end_date || null,
    };
    delete payload.municipality;
    delete payload.gve;
    delete payload.online_link;
    if (!event && repeatConfig.enabled && repeatConfig.days.length > 0) {
      const items = buildRecurringEvents(payload);
      saveMutation.mutate({ mode: "bulk", items });
      return;
    }
    saveMutation.mutate({ mode: "single", data: payload });
  };

  const toggleRepeatDay = (weekday) => {
    setRepeatConfig((prev) => {
      const exists = prev.days.includes(weekday);
      const nextDays = exists
        ? prev.days.filter((day) => day !== weekday)
        : [...prev.days, weekday];
      return { ...prev, days: nextDays };
    });
  };

  const handleRepeatToggle = (checked) => {
    const enabled = Boolean(checked);
    setRepeatConfig((prev) => {
      if (!enabled) {
        return { ...prev, enabled: false };
      }
      const nextDays = prev.days.length
        ? prev.days
        : (() => {
            const weekday = getWeekday(formData.start_date);
            return weekday === null ? [] : [weekday];
          })();
      return { ...prev, enabled: true, days: nextDays };
    });
  };

  const typeColors = {
    viagem: "#10b981",
    trabalho_campo: "#f59e0b",
    treinamento: "#6366f1",
    ferias: "#ec4899",
    reuniao: "#8b5cf6",
    outro: "#64748b",
  };

  const handleProfessionalToggle = (professionalId, professionalName) => {
    const ids = formData.professional_ids || [];
    const names = formData.professional_names || [];
    
    if (ids.includes(professionalId)) {
      setFormData({
        ...formData,
        professional_ids: ids.filter(id => id !== professionalId),
        professional_names: names.filter((_, index) => ids[index] !== professionalId)
      });
    } else {
      setFormData({
        ...formData,
        professional_ids: [...ids, professionalId],
        professional_names: [...names, professionalName]
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="title">Título *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">Tipo *</Label>
          <Select
            value={formData.type}
            onValueChange={(value) => {
              setFormData({ ...formData, type: value, color: typeColors[value] || "#3b82f6" });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viagem">Viagem</SelectItem>
              <SelectItem value="trabalho_campo">Trabalho de Campo</SelectItem>
              <SelectItem value="treinamento">Treinamento</SelectItem>
              <SelectItem value="ferias">Férias</SelectItem>
              <SelectItem value="reuniao">Reunião</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={formData.status}
            onValueChange={(value) => setFormData({ ...formData, status: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="planejado">Planejado</SelectItem>
              <SelectItem value="confirmado">Confirmado</SelectItem>
              <SelectItem value="em_andamento">Em Andamento</SelectItem>
              <SelectItem value="concluido">Concluído</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="start_date">Data Início *</Label>
          <Input
            id="start_date"
            type="date"
            value={formData.start_date}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            required
          />
        </div>

        {formData.type !== "ferias" ? (
          <div className="space-y-2">
            <Label htmlFor="end_date">Data Fim</Label>
            <Input
              id="end_date"
              type="date"
              value={formData.end_date}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
            />
            {repeatConfig.enabled && (
              <p className="text-xs text-slate-500">
                Com repetição ativa, esta data define o período final.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Período de Férias</Label>
            <div className="flex flex-wrap gap-2">
              {[15, 30].map((days) => (
                <Button
                  key={days}
                  type="button"
                  variant={vacationDays === days ? "default" : "outline"}
                  size="sm"
                  onClick={() => setVacationDays(days)}
                >
                  {days} dias
                </Button>
              ))}
            </div>
            {formData.start_date && vacationDays && (
              <p className="text-xs text-slate-500">
                Fim automático:{" "}
                {format(
                  addDays(parseDateInput(formData.start_date), vacationDays - 1),
                  "dd/MM/yyyy"
                )}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="start_time">Horário Início</Label>
          <Input
            id="start_time"
            type="time"
            value={formData.start_time}
            onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="end_time">Horário Fim</Label>
          <Input
            id="end_time"
            type="time"
            value={formData.end_time}
            onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
          />
        </div>

        {!event && (
          <div className="col-span-2 space-y-2 border rounded-lg p-3 bg-slate-50">
            <div className="flex items-center gap-2">
              <Checkbox
                id="repeat-week"
                checked={repeatConfig.enabled}
                onCheckedChange={handleRepeatToggle}
              />
              <Label htmlFor="repeat-week" className="text-sm">
                Repetir em dias da semana
              </Label>
            </div>
            {repeatConfig.enabled && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                  {weekDays.map((day) => (
                    <label key={day.value} className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={repeatConfig.days.includes(day.value)}
                        onCheckedChange={() => toggleRepeatDay(day.value)}
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Semanas</Label>
                    <Input
                      type="number"
                      min="1"
                      max="52"
                      value={repeatConfig.weeks}
                      onChange={(e) =>
                        setRepeatConfig((prev) => ({
                          ...prev,
                          weeks: Number(e.target.value) || 1,
                        }))
                      }
                    />
                  </div>
                  <p className="text-xs text-slate-500 flex items-end">
                    Com Data Fim preenchida, repete apenas dentro do período.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="col-span-2 space-y-2">
          <Label htmlFor="municipality">Município</Label>
          <Input
            id="municipality"
            list="municipios-gve"
            value={formData.municipality}
            onChange={(e) => {
              const nextValue = e.target.value;
              const autoGve = getGveByMunicipio(nextValue);
              setFormData({
                ...formData,
                municipality: nextValue,
                gve: autoGve || "",
              });
            }}
            placeholder="Digite o município"
          />
          {municipalityOptions.length > 0 && (
            <datalist id="municipios-gve">
              {municipalityOptions.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          )}
        </div>

        <div className="col-span-2 space-y-2">
          <Label htmlFor="gve">GVE</Label>
          <Input
            id="gve"
            value={getGveByMunicipio(formData.municipality) || formData.gve}
            onChange={(e) =>
              setFormData({ ...formData, gve: e.target.value })
            }
            placeholder="GVE"
            readOnly={Boolean(getGveByMunicipio(formData.municipality))}
          />
        </div>

        <div className="col-span-2 space-y-2">
          <Label htmlFor="online_link">Link do evento online</Label>
          <Input
            id="online_link"
            value={formData.online_link}
            onChange={(e) =>
              setFormData({ ...formData, online_link: e.target.value })
            }
            placeholder="https://zoom.us/j/... ou https://teams.microsoft.com/..."
          />
        </div>

        <div className="col-span-2 space-y-2">
          <Label>Profissionais Vinculados</Label>
          <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
            {professionals.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum profissional cadastrado</p>
            ) : (
              professionals.map((prof) => (
                <div key={prof.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`prof-${prof.id}`}
                    checked={formData.professional_ids?.includes(prof.id)}
                    onCheckedChange={() => handleProfessionalToggle(prof.id, prof.name)}
                  />
                  <label
                    htmlFor={`prof-${prof.id}`}
                    className="text-sm cursor-pointer flex-1"
                  >
                    {prof.name} - {prof.sector}
                  </label>
                </div>
              ))
            )}
          </div>
          {formData.professional_names?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {formData.professional_names.map((name, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => handleProfessionalToggle(formData.professional_ids[index], name)}
                    className="hover:text-blue-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="col-span-2 space-y-2">
          <Label htmlFor="description">Descrição</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="h-20"
          />
        </div>

        <div className="col-span-2 space-y-2">
          <Label htmlFor="notes">Observações</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="h-16"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {event ? "Atualizar" : "Criar"} Evento
        </Button>
      </div>
    </form>
  );
}