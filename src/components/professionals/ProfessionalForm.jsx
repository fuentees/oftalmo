import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function ProfessionalForm({ professional, onClose }) {
  const [formData, setFormData] = useState({
    name: "",
    registration: "",
    rg: "",
    cpf: "",
    email: "",
    phone: "",
    sector: "",
    position: "",
    admission_date: "",
    status: "ativo",
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    if (professional) {
      setFormData({
        name: professional.name || "",
        registration: professional.registration || "",
        rg: professional.rg || "",
        cpf: professional.cpf || "",
        email: professional.email || "",
        phone: professional.phone || "",
        sector: professional.sector || "",
        position: professional.position || "",
        admission_date: professional.admission_date || "",
        status: professional.status || "ativo",
      });
    }
  }, [professional]);

  const saveProfessional = useMutation({
    mutationFn: (data) => {
      if (professional) {
        return dataClient.entities.Professional.update(professional.id, data);
      }
      return dataClient.entities.Professional.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professionals"] });
      onClose();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      admission_date: formData.admission_date || null,
    };
    saveProfessional.mutate(payload);
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const formatCPF = (value) => {
    const numbers = value.replace(/\D/g, "");
    return numbers
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})/, "$1-$2")
      .replace(/(-\d{2})\d+?$/, "$1");
  };

  const formatPhone = (value) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 10) {
      return numbers
        .replace(/(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    }
    return numbers
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nome Completo *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleChange("name", e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="registration">Matrícula</Label>
          <Input
            id="registration"
            value={formData.registration}
            onChange={(e) => handleChange("registration", e.target.value)}
            placeholder="Ex: 12345"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="rg">RG</Label>
          <Input
            id="rg"
            value={formData.rg}
            onChange={(e) => handleChange("rg", e.target.value)}
            placeholder="00.000.000-0"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cpf">CPF</Label>
          <Input
            id="cpf"
            value={formData.cpf}
            onChange={(e) => handleChange("cpf", formatCPF(e.target.value))}
            placeholder="000.000.000-00"
            maxLength={14}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Telefone</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => handleChange("phone", formatPhone(e.target.value))}
            placeholder="(00) 00000-0000"
            maxLength={15}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => handleChange("email", e.target.value)}
          placeholder="email@exemplo.com"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sector">Setor *</Label>
          <Input
            id="sector"
            value={formData.sector}
            onChange={(e) => handleChange("sector", e.target.value)}
            placeholder="Ex: Manutenção"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="position">Cargo/Função</Label>
          <Input
            id="position"
            value={formData.position}
            onChange={(e) => handleChange("position", e.target.value)}
            placeholder="Ex: Eletricista"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="admission_date">Data de Admissão</Label>
          <Input
            id="admission_date"
            type="date"
            value={formData.admission_date}
            onChange={(e) => handleChange("admission_date", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={formData.status} onValueChange={(v) => handleChange("status", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
              <SelectItem value="afastado">Afastado</SelectItem>
              <SelectItem value="ferias">Férias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saveProfessional.isPending} className="bg-blue-600 hover:bg-blue-700">
          {saveProfessional.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {professional ? "Salvar Alterações" : "Cadastrar Profissional"}
        </Button>
      </div>
    </form>
  );
}