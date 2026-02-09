import React, { useState, useEffect } from "react";
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
import { Loader2 } from "lucide-react";

export default function MaterialForm({ material, onClose }) {
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    unit: "unidade",
    category: "outros",
    minimum_stock: 0,
    current_stock: 0,
    location: "",
    expiry_date: "",
    status: "ativo",
  });

  const queryClient = useQueryClient();

  // Gerar código automático baseado na categoria
  const generateCode = (category) => {
    const prefixes = {
      EPI: "EPI",
      escritorio: "ESC",
      limpeza: "LMP",
      ferramentas: "FER",
      eletrico: "ELE",
      hidraulico: "HID",
      informatica: "INF",
      outros: "OUT",
    };
    const prefix = prefixes[category] || "OUT";
    const random = Math.floor(Math.random() * 9999).toString().padStart(4, "0");
    return `${prefix}-${random}`;
  };

  useEffect(() => {
    if (material) {
      setFormData({
        name: material.name || "",
        code: material.code || "",
        description: material.description || "",
        unit: material.unit || "unidade",
        category: material.category || "outros",
        minimum_stock: material.minimum_stock || 0,
        current_stock: material.current_stock || 0,
        location: material.location || "",
        expiry_date: material.expiry_date || "",
        status: material.status || "ativo",
      });
    } else {
      // Gerar código para novo material
      setFormData(prev => ({ ...prev, code: generateCode(prev.category) }));
    }
  }, [material]);

  const saveMaterial = useMutation({
    mutationFn: (data) => {
      if (material) {
        return dataClient.entities.Material.update(material.id, data);
      }
      return dataClient.entities.Material.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      onClose();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMaterial.mutate(formData);
  };

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      // Gerar novo código ao mudar categoria (apenas para novos materiais)
      if (field === "category" && !material) {
        updated.code = generateCode(value);
      }
      return updated;
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="code">Código</Label>
          <Input
            id="code"
            value={formData.code}
            onChange={(e) => handleChange("code", e.target.value)}
            placeholder="Gerado automaticamente"
            disabled={!material}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Nome *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleChange("name", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => handleChange("description", e.target.value)}
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Categoria *</Label>
          <Select value={formData.category} onValueChange={(v) => handleChange("category", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EPI">EPI</SelectItem>
              <SelectItem value="escritorio">Escritório</SelectItem>
              <SelectItem value="limpeza">Limpeza</SelectItem>
              <SelectItem value="ferramentas">Ferramentas</SelectItem>
              <SelectItem value="eletrico">Elétrico</SelectItem>
              <SelectItem value="hidraulico">Hidráulico</SelectItem>
              <SelectItem value="informatica">Informática</SelectItem>
              <SelectItem value="outros">Outros</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Unidade *</Label>
          <Select value={formData.unit} onValueChange={(v) => handleChange("unit", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unidade">Unidade</SelectItem>
              <SelectItem value="caixa">Caixa</SelectItem>
              <SelectItem value="pacote">Pacote</SelectItem>
              <SelectItem value="litro">Litro</SelectItem>
              <SelectItem value="kg">Kg</SelectItem>
              <SelectItem value="metro">Metro</SelectItem>
              <SelectItem value="rolo">Rolo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="current_stock">Estoque Atual</Label>
          <Input
            id="current_stock"
            type="number"
            min="0"
            value={formData.current_stock}
            onChange={(e) => handleChange("current_stock", Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="minimum_stock">Estoque Mínimo</Label>
          <Input
            id="minimum_stock"
            type="number"
            min="0"
            value={formData.minimum_stock}
            onChange={(e) => handleChange("minimum_stock", Number(e.target.value))}
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
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="location">Localização</Label>
          <Input
            id="location"
            value={formData.location}
            onChange={(e) => handleChange("location", e.target.value)}
            placeholder="Ex: Prateleira A, Gaveta 3"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expiry_date">Data de Validade</Label>
          <Input
            id="expiry_date"
            type="date"
            value={formData.expiry_date}
            onChange={(e) => handleChange("expiry_date", e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saveMaterial.isPending} className="bg-blue-600 hover:bg-blue-700">
          {saveMaterial.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {material ? "Salvar Alterações" : "Cadastrar Material"}
        </Button>
      </div>
    </form>
  );
}