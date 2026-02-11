import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, X, Video, Plus, XCircle, Mic } from "lucide-react";
import { format, addDays, addWeeks } from "date-fns";

export default function TrainingForm({ training, onClose, professionals = [] }) {
  const [formData, setFormData] = useState({
    title: "",
    code: "",
    type: "teorico",
    description: "",
    dates: [{ date: format(new Date(), "yyyy-MM-dd"), start_time: "08:00", end_time: "12:00" }],
    duration_hours: 4,
    location: "",
    municipality: "",
    gve: "",
    online_link: "",
    coordinator: "",
    coordinator_email: "",
    instructor: "",
    monitors: [],
    speakers: [],
    max_participants: "",
    status: "agendado",
    validity_months: "",
    notes: "",
  });
  const [gveMapping, setGveMapping] = useState([]);

  const [repeatConfig, setRepeatConfig] = useState({
    enabled: false,
    type: "daily",
    occurrences: 5,
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    const defaultDates = [
      { date: format(new Date(), "yyyy-MM-dd"), start_time: "08:00", end_time: "12:00" }
    ];

    if (training) {
      const normalizedDates = Array.isArray(training.dates)
        ? training.dates.filter((dateItem) => dateItem?.date)
        : [];
      const parsedLocation = parseLocation(training.location);

      setFormData({
        title: training.title || "",
        code: training.code || "",
        type: training.type || "teorico",
        description: training.description || "",
        dates: normalizedDates.length > 0 ? normalizedDates : defaultDates,
        duration_hours: training.duration_hours || 4,
        location: training.location || "",
        municipality: parsedLocation.municipality,
        gve: parsedLocation.gve,
        online_link: training.online_link || "",
        coordinator: training.coordinator || "",
        coordinator_email: training.coordinator_email || "",
        instructor: training.instructor || "",
        monitors: training.monitors || [],
        speakers: training.speakers || [],
        max_participants: training.max_participants || "",
        status: training.status || "agendado",
        validity_months: training.validity_months || "",
        notes: training.notes || "",
      });
    } else {
      // Generate code for new training
      generateTrainingCode();
    }
  }, [training]);

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

  const generateTrainingCode = async () => {
    const currentYear = new Date().getFullYear();
    const trainings = await dataClient.entities.Training.list();
    
    // Filter trainings from current year
    const yearTrainings = trainings.filter(t => {
      const trainingYear = t.code?.split('-')[1];
      return trainingYear === String(currentYear);
    });
    
    const nextNumber = yearTrainings.length + 1;
    const code = `${String(nextNumber).padStart(2, '0')}-${currentYear}`;
    
    setFormData(prev => ({ ...prev, code }));
  };

  const ONLINE_LINK_PREFIX = "link_online:";

  const buildEventNotes = (notes, link) => {
    const cleanNotes = String(notes || "").trim();
    const cleanLink = String(link || "").trim();
    if (!cleanLink) return cleanNotes;
    return [cleanNotes, `${ONLINE_LINK_PREFIX} ${cleanLink}`]
      .filter(Boolean)
      .join("\n")
      .trim();
  };

  const getTrainingDateRange = (dates = []) => {
    const parsedDates = (dates || [])
      .map((item) => {
        const raw = item?.date;
        if (!raw) return null;
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return null;
        return {
          date: raw,
          start_time: item?.start_time || "",
          end_time: item?.end_time || "",
          value: parsed.getTime(),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.value - b.value);
    if (!parsedDates.length) return {};
    const first = parsedDates[0];
    const last = parsedDates[parsedDates.length - 1];
    return {
      start_date: first.date,
      end_date: last.date,
      start_time: first.start_time,
      end_time: last.end_time,
    };
  };

  const mapTrainingStatusToEvent = (status) => {
    if (status === "concluido") return "concluido";
    if (status === "em_andamento") return "em_andamento";
    if (status === "cancelado") return "cancelado";
    return "planejado";
  };

  const buildEventPayload = (payload) => {
    const dateRange = getTrainingDateRange(payload.dates || []);
    const professionalNames = [
      payload.coordinator,
      payload.instructor,
      ...(payload.monitors || []).map((monitor) => monitor?.name),
      ...(payload.speakers || []).map((speaker) => speaker?.name),
    ]
      .map((name) => String(name || "").trim())
      .filter(Boolean);
    return {
      title: payload.title || "Treinamento",
      type: "treinamento",
      description: payload.description || "",
      start_date: dateRange.start_date || payload.date || null,
      end_date: dateRange.end_date || payload.date || null,
      start_time: dateRange.start_time || "",
      end_time: dateRange.end_time || "",
      location: payload.location || "",
      professional_names: professionalNames.length ? professionalNames : null,
      status: mapTrainingStatusToEvent(payload.status),
      color: "#6366f1",
      notes: buildEventNotes(payload.notes, payload.online_link),
    };
  };

  const saveTraining = useMutation({
    mutationFn: async (/** @type {any} */ data) => {
      if (training) {
        return dataClient.entities.Training.update(training.id, data);
      }
      const created = await dataClient.entities.Training.create(data);
      try {
        await dataClient.entities.Event.create(buildEventPayload(data));
      } catch (error) {
        console.error("Falha ao criar evento do treinamento:", error);
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      onClose();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Auto-calculate status based on dates
    const now = new Date();
    const firstDate = formData.dates[0] ? new Date(formData.dates[0].date) : null;
    const lastDate = formData.dates[formData.dates.length - 1] ? new Date(formData.dates[formData.dates.length - 1].date) : null;
    
    let autoStatus = "agendado";
    if (firstDate && lastDate) {
      if (now > lastDate) {
        autoStatus = "concluido";
      } else if (now >= firstDate && now <= lastDate) {
        autoStatus = "em_andamento";
      }
    }
    
    const { municipality, gve, ...restForm } = formData;
    const resolvedGve = getGveByMunicipio(municipality) || gve;
    const dataToSave = {
      ...restForm,
      location: buildLocation(municipality, resolvedGve),
      date: formData.dates?.[0]?.date || null,
      status: autoStatus,
      duration_hours: formData.duration_hours ? Number(formData.duration_hours) : null,
      max_participants: formData.max_participants ? Number(formData.max_participants) : null,
      validity_months: formData.validity_months ? Number(formData.validity_months) : null,
      coordinator_email: formData.coordinator_email || null,
    };
    saveTraining.mutate(dataToSave);
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const normalizeText = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const activeProfessionals = useMemo(
    () => (professionals || []).filter(
      (prof) => !prof.status || prof.status === "ativo"
    ),
    [professionals]
  );

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
    return unique.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
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

  const buildLocation = (municipalityValue, gveValue) => {
    const cleanMunicipality = String(municipalityValue || "").trim();
    const cleanGve = String(gveValue || "").trim();
    if (cleanMunicipality && cleanGve) {
      return `${cleanMunicipality} - GVE ${cleanGve}`;
    }
    if (cleanMunicipality) return cleanMunicipality;
    if (cleanGve) return `GVE ${cleanGve}`;
    return "";
  };

  const findProfessionalByName = (value) => {
    const normalized = normalizeText(value);
    if (!normalized) return null;
    return (
      activeProfessionals.find(
        (prof) => normalizeText(prof.name) === normalized
      ) || null
    );
  };

  const findProfessionalByEmail = (email) => {
    if (!email) return null;
    const normalized = email.trim().toLowerCase();
    return activeProfessionals.find(
      (prof) => prof.email?.trim().toLowerCase() === normalized
    );
  };

  const findProfessionalByRg = (rg) => {
    if (!rg) return null;
    const normalized = rg.replace(/\D/g, "");
    return activeProfessionals.find(
      (prof) => String(prof.rg || "").replace(/\D/g, "") === normalized
    );
  };

  const addDate = () => {
    setFormData(prev => ({
      ...prev,
      dates: [...prev.dates, { date: format(new Date(), "yyyy-MM-dd"), start_time: "08:00", end_time: "12:00" }]
    }));
  };

  const removeDate = (index) => {
    if (formData.dates.length > 1) {
      setFormData(prev => ({
        ...prev,
        dates: prev.dates.filter((_, i) => i !== index)
      }));
    }
  };

  const updateDate = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      dates: prev.dates.map((d, i) => i === index ? { ...d, [field]: value } : d)
    }));
  };

  const generateRepeatDates = () => {
    if (!formData.dates[0]) return;
    
    const baseDate = new Date(formData.dates[0].date);
    const startTime = formData.dates[0].start_time;
    const endTime = formData.dates[0].end_time;
    const newDates = [formData.dates[0]];

    for (let i = 1; i < repeatConfig.occurrences; i++) {
      let nextDate;
      
      switch (repeatConfig.type) {
        case "daily":
          nextDate = addDays(baseDate, i);
          break;
        case "weekly":
          nextDate = addWeeks(baseDate, i);
          break;
        case "biweekly":
          nextDate = addWeeks(baseDate, i * 2);
          break;
        case "monthly":
          nextDate = new Date(baseDate);
          nextDate.setMonth(baseDate.getMonth() + i);
          break;
        default:
          nextDate = addDays(baseDate, i);
      }
      
      newDates.push({
        date: format(nextDate, "yyyy-MM-dd"),
        start_time: startTime,
        end_time: endTime,
      });
    }

    setFormData(prev => ({ ...prev, dates: newDates }));
    setRepeatConfig(prev => ({ ...prev, enabled: false }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="code">Código</Label>
          <Input
            id="code"
            value={formData.code}
            disabled
            className="bg-slate-50"
          />
          <p className="text-xs text-slate-500">Gerado automaticamente</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="title">Título *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => handleChange("title", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tipo *</Label>
          <Select value={formData.type} onValueChange={(v) => handleChange("type", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="teorico">Teórico</SelectItem>
              <SelectItem value="pratico">Prático</SelectItem>
              <SelectItem value="teorico_pratico">Teórico e Prático</SelectItem>
              <SelectItem value="repadronizacao">Repadronização</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Descrição/Conteúdo</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => handleChange("description", e.target.value)}
          rows={2}
          className="text-sm"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Datas e Horários *</Label>
          <div className="flex gap-2">
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={() => setRepeatConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
            >
              🔁 Repetir
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={addDate}>
              + Adicionar Data
            </Button>
          </div>
        </div>

        {repeatConfig.enabled && (
          <div className="p-3 border rounded-lg bg-blue-50 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Frequência</Label>
                <Select 
                  value={repeatConfig.type} 
                  onValueChange={(v) => setRepeatConfig(prev => ({ ...prev, type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diariamente</SelectItem>
                    <SelectItem value="weekly">Semanalmente</SelectItem>
                    <SelectItem value="biweekly">Quinzenalmente</SelectItem>
                    <SelectItem value="monthly">Mensalmente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ocorrências</Label>
                <Input
                  type="number"
                  min="2"
                  max="30"
                  value={repeatConfig.occurrences}
                  onChange={(e) => setRepeatConfig(prev => ({ ...prev, occurrences: Number(e.target.value) }))}
                />
              </div>
              <div className="flex items-end">
                <Button type="button" onClick={generateRepeatDates} size="sm" className="w-full">
                  Gerar Datas
                </Button>
              </div>
            </div>
          </div>
        )}

        {formData.dates.map((dateItem, index) => (
          <div key={index} className="flex gap-2 items-start p-3 border rounded-lg bg-slate-50">
            <div className="flex-1 grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Data</Label>
                <Input
                  type="date"
                  value={dateItem.date}
                  onChange={(e) => updateDate(index, "date", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Início</Label>
                <Input
                  type="time"
                  value={dateItem.start_time}
                  onChange={(e) => updateDate(index, "start_time", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Término</Label>
                <Input
                  type="time"
                  value={dateItem.end_time}
                  onChange={(e) => updateDate(index, "end_time", e.target.value)}
                />
              </div>
            </div>
            {formData.dates.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeDate(index)}
                className="text-red-600 mt-5"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="duration_hours">Carga Horária (h)</Label>
          <Input
            id="duration_hours"
            type="number"
            min="0"
            step="0.5"
            value={formData.duration_hours}
            onChange={(e) => handleChange("duration_hours", Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="municipality">Município</Label>
          <Input
            id="municipality"
            list="municipios-treinamento"
            value={formData.municipality}
            onChange={(e) => {
              const nextValue = e.target.value;
              const autoGve = getGveByMunicipio(nextValue);
              setFormData((prev) => ({
                ...prev,
                municipality: nextValue,
                gve: autoGve || "",
              }));
            }}
            placeholder="Digite o município"
          />
          {municipalityOptions.length > 0 && (
            <datalist id="municipios-treinamento">
              {municipalityOptions.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gve">GVE</Label>
        <Input
          id="gve"
          value={getGveByMunicipio(formData.municipality) || formData.gve}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              gve: e.target.value,
            }))
          }
          placeholder="GVE"
          readOnly={Boolean(getGveByMunicipio(formData.municipality))}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="online_link" className="flex items-center gap-2 text-sm">
          <Video className="h-4 w-4 text-blue-600" />
          Link da Reunião Online (Zoom/Teams)
        </Label>
        <Input
          id="online_link"
          value={formData.online_link}
          onChange={(e) => handleChange("online_link", e.target.value)}
          placeholder="https://zoom.us/j/... ou https://teams.microsoft.com/..."
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="coordinator">Coordenador</Label>
        <Input
          id="coordinator"
          list="professionals-names"
          value={formData.coordinator}
          onChange={(e) => {
            const nextValue = e.target.value;
            const match = findProfessionalByName(nextValue);
            setFormData((prev) => ({
              ...prev,
              coordinator: nextValue,
              coordinator_email: prev.coordinator_email || match?.email || "",
            }));
          }}
          placeholder="Nome do coordenador"
        />
        <Input
          id="coordinator_email"
          type="email"
          list="professionals-emails"
          value={formData.coordinator_email}
          onChange={(e) => {
            const nextValue = e.target.value;
            const match = findProfessionalByEmail(nextValue);
            setFormData((prev) => ({
              ...prev,
              coordinator_email: nextValue,
              coordinator: prev.coordinator || match?.name || "",
            }));
          }}
          placeholder="Email do coordenador (opcional)"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Monitores</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleChange("monitors", [...formData.monitors, { name: "", email: "" }])}
          >
            <Plus className="h-4 w-4 mr-1" />
            Adicionar Monitor
          </Button>
        </div>
        {formData.monitors.map((monitor, index) => (
          <div key={index} className="flex gap-2 p-2 border rounded-lg">
            <Input
              value={monitor.name}
              list="professionals-names"
              onChange={(e) => {
                const newMonitors = [...formData.monitors];
                const nextValue = e.target.value;
                const match = findProfessionalByName(nextValue);
                newMonitors[index].name = nextValue;
                if (!newMonitors[index].email && match?.email) {
                  newMonitors[index].email = match.email;
                }
                handleChange("monitors", newMonitors);
              }}
              placeholder="Nome do monitor"
            />
            <Input
              type="email"
              value={monitor.email}
              list="professionals-emails"
              onChange={(e) => {
                const newMonitors = [...formData.monitors];
                newMonitors[index].email = e.target.value;
                handleChange("monitors", newMonitors);
              }}
              placeholder="Email do monitor"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                const newMonitors = formData.monitors.filter((_, i) => i !== index);
                handleChange("monitors", newMonitors);
              }}
              className="text-red-600"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-sm flex items-center gap-2">
            <Mic className="h-4 w-4 text-amber-600" />
            Palestrantes
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              handleChange("speakers", [
                ...formData.speakers,
                { name: "", rg: "", email: "", lecture: "" },
              ])
            }
          >
            <Plus className="h-4 w-4 mr-1" />
            Adicionar Palestrante
          </Button>
        </div>
        {formData.speakers.map((speaker, index) => (
          <div key={index} className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2 border rounded-lg">
            <Input
              value={speaker.name}
              list="professionals-names"
              onChange={(e) => {
                const nextValue = e.target.value;
                const match = findProfessionalByName(nextValue);
                const newSpeakers = [...formData.speakers];
                newSpeakers[index].name = nextValue;
                if (!newSpeakers[index].email && match?.email) {
                  newSpeakers[index].email = match.email;
                }
                if (!newSpeakers[index].rg && match?.rg) {
                  newSpeakers[index].rg = match.rg;
                }
                handleChange("speakers", newSpeakers);
              }}
              placeholder="Nome do palestrante"
            />
            <Input
              value={speaker.rg}
              list="professionals-rg"
              onChange={(e) => {
                const nextValue = e.target.value;
                const match = findProfessionalByRg(nextValue);
                const newSpeakers = [...formData.speakers];
                newSpeakers[index].rg = nextValue;
                if (!newSpeakers[index].name && match?.name) {
                  newSpeakers[index].name = match.name;
                }
                if (!newSpeakers[index].email && match?.email) {
                  newSpeakers[index].email = match.email;
                }
                handleChange("speakers", newSpeakers);
              }}
              placeholder="RG do palestrante"
            />
            <Input
              type="email"
              value={speaker.email}
              list="professionals-emails"
              onChange={(e) => {
                const nextValue = e.target.value;
                const match = findProfessionalByEmail(nextValue);
                const newSpeakers = [...formData.speakers];
                newSpeakers[index].email = nextValue;
                if (!newSpeakers[index].name && match?.name) {
                  newSpeakers[index].name = match.name;
                }
                if (!newSpeakers[index].rg && match?.rg) {
                  newSpeakers[index].rg = match.rg;
                }
                handleChange("speakers", newSpeakers);
              }}
              placeholder="Email do palestrante"
            />
            <Input
              value={speaker.lecture}
              onChange={(e) => {
                const newSpeakers = [...formData.speakers];
                newSpeakers[index].lecture = e.target.value;
                handleChange("speakers", newSpeakers);
              }}
              placeholder="Aula/tema a ser ministrada"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                const newSpeakers = formData.speakers.filter((_, i) => i !== index);
                handleChange("speakers", newSpeakers);
              }}
              className="text-red-600 justify-self-end"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <datalist id="professionals-names">
        {activeProfessionals.map((prof) => (
          <option key={prof.id} value={prof.name} />
        ))}
      </datalist>
      <datalist id="professionals-emails">
        {activeProfessionals
          .filter((prof) => prof.email)
          .map((prof) => (
            <option key={prof.id} value={prof.email} />
          ))}
      </datalist>
      <datalist id="professionals-rg">
        {activeProfessionals
          .filter((prof) => prof.rg)
          .map((prof) => (
            <option key={prof.id} value={prof.rg} />
          ))}
      </datalist>

      <div className="space-y-1.5">
        <Label htmlFor="max_participants">Capacidade Máxima</Label>
        <Input
          id="max_participants"
          type="number"
          min="1"
          value={formData.max_participants}
          onChange={(e) => handleChange("max_participants", e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="validity_months">Validade (meses)</Label>
        <Input
          id="validity_months"
          type="number"
          min="1"
          value={formData.validity_months}
          onChange={(e) => handleChange("validity_months", e.target.value)}
          placeholder="Ex: 12"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Observações</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleChange("notes", e.target.value)}
          rows={2}
          className="text-sm"
        />
      </div>

      <div className="flex justify-end gap-3 pt-2 sticky bottom-0 bg-white pb-2 border-t mt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saveTraining.isPending} className="bg-blue-600 hover:bg-blue-700">
          {saveTraining.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {training ? "Salvar Alterações" : "Cadastrar Treinamento"}
        </Button>
      </div>
    </form>
  );
}