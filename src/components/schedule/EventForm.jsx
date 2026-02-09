import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, X } from "lucide-react";

export default function EventForm({ event, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    title: "",
    type: "outro",
    description: "",
    start_date: "",
    end_date: "",
    start_time: "",
    end_time: "",
    location: "",
    professional_ids: [],
    professional_names: [],
    status: "planejado",
    color: "#3b82f6",
    notes: "",
  });

  const queryClient = useQueryClient();

  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals"],
    queryFn: () => dataClient.entities.Professional.list(),
  });

  useEffect(() => {
    if (event) {
      setFormData({
        title: event.title || "",
        type: event.type || "outro",
        description: event.description || "",
        start_date: event.start_date || "",
        end_date: event.end_date || "",
        start_time: event.start_time || "",
        end_time: event.end_time || "",
        location: event.location || "",
        professional_ids: event.professional_ids || [],
        professional_names: event.professional_names || [],
        status: event.status || "planejado",
        color: event.color || "#3b82f6",
        notes: event.notes || "",
      });
    }
  }, [event]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (event) {
        return dataClient.entities.Event.update(event.id, data);
      } else {
        return dataClient.entities.Event.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      onSuccess?.();
      onClose();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
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

        <div className="space-y-2">
          <Label htmlFor="end_date">Data Fim</Label>
          <Input
            id="end_date"
            type="date"
            value={formData.end_date}
            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
          />
        </div>

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

        <div className="col-span-2 space-y-2">
          <Label htmlFor="location">Local</Label>
          <Input
            id="location"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
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