import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
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
import { Loader2, X, Video, Plus, XCircle } from "lucide-react";
import { format, addDays, addWeeks } from "date-fns";

export default function TrainingForm({ training, onClose }) {
  const [formData, setFormData] = useState({
    title: "",
    code: "",
    type: "teorico",
    category: "tecnico",
    description: "",
    dates: [{ date: format(new Date(), "yyyy-MM-dd"), start_time: "08:00", end_time: "12:00" }],
    duration_hours: 4,
    location: "",
    online_link: "",
    coordinator: "",
    monitors: [],
    max_participants: "",
    status: "agendado",
    validity_months: "",
    notes: "",
  });

  const [repeatConfig, setRepeatConfig] = useState({
    enabled: false,
    type: "daily",
    occurrences: 5,
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    if (training) {
      setFormData({
        title: training.title || "",
        code: training.code || "",
        type: training.type || "teorico",
        category: training.category || "tecnico",
        description: training.description || "",
        dates: training.dates || [{ date: format(new Date(), "yyyy-MM-dd"), start_time: "08:00", end_time: "12:00" }],
        duration_hours: training.duration_hours || 4,
        location: training.location || "",
        online_link: training.online_link || "",
        coordinator: training.coordinator || "",
        monitors: training.monitors || [],
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

  const generateTrainingCode = async () => {
    const currentYear = new Date().getFullYear();
    const trainings = await base44.entities.Training.list();
    
    // Filter trainings from current year
    const yearTrainings = trainings.filter(t => {
      const trainingYear = t.code?.split('-')[1];
      return trainingYear === String(currentYear);
    });
    
    const nextNumber = yearTrainings.length + 1;
    const code = `${String(nextNumber).padStart(2, '0')}-${currentYear}`;
    
    setFormData(prev => ({ ...prev, code }));
  };

  const saveTraining = useMutation({
    mutationFn: (data) => {
      if (training) {
        return base44.entities.Training.update(training.id, data);
      }
      return base44.entities.Training.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
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
    
    const dataToSave = {
      ...formData,
      status: autoStatus,
      max_participants: formData.max_participants ? Number(formData.max_participants) : null,
      validity_months: formData.validity_months ? Number(formData.validity_months) : null,
    };
    saveTraining.mutate(dataToSave);
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Select value={formData.category} onValueChange={(v) => handleChange("category", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NR">NR (Norma Regulamentadora)</SelectItem>
              <SelectItem value="tecnico">Técnico</SelectItem>
              <SelectItem value="comportamental">Comportamental</SelectItem>
              <SelectItem value="integracao">Integração</SelectItem>
              <SelectItem value="reciclagem">Reciclagem</SelectItem>
              <SelectItem value="outros">Outros</SelectItem>
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
          <Label htmlFor="location">Local</Label>
          <Input
            id="location"
            value={formData.location}
            onChange={(e) => handleChange("location", e.target.value)}
            placeholder="Ex: Sala de Treinamentos"
          />
        </div>
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
          value={formData.coordinator}
          onChange={(e) => handleChange("coordinator", e.target.value)}
          placeholder="Nome do coordenador"
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
              onChange={(e) => {
                const newMonitors = [...formData.monitors];
                newMonitors[index].name = e.target.value;
                handleChange("monitors", newMonitors);
              }}
              placeholder="Nome do monitor"
            />
            <Input
              type="email"
              value={monitor.email}
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