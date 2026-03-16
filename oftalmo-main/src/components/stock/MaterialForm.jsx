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
import { Loader2, Plus, Trash2, RefreshCw } from "lucide-react";

export default function MaterialForm({
  material,
  onClose,
  categories = [],
  customCategories = [],
  onAddCategory = null,
  onDeleteCategory = null,
  canDeleteCategory = null,
}) {
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    unit: "unidade",
    category: "outras",
    minimum_stock: 0,
    current_stock: 0,
    location: "",
    expiry_date: "",
  });
  const [newCategory, setNewCategory] = useState("");

  const queryClient = useQueryClient();

  // Gerar código automático baseado na categoria
  const generateCode = (category) => {
    const normalized = String(category || "").trim().toLowerCase();
    const prefixes = {
      escritorio: "ESC",
      folhetos: "FOL",
      limpeza: "LMP",
      manuais: "MAN",
      informatica: "INF",
      outras: "OUT",
    };
    const prefix =
      prefixes[category] ||
      prefixes[normalized] ||
      normalized.replace(/[^a-z0-9]/g, "").slice(0, 3).toUpperCase() ||
      "OUT";
    const random = Math.floor(Math.random() * 9999).toString().padStart(4, "0");
    return `${prefix}-${random}`;
  };

  const defaultCategoryOptions = [
    { value: "escritorio", label: "Escritório" },
    { value: "folhetos", label: "Folhetos" },
    { value: "informatica", label: "Informática" },
    { value: "limpeza", label: "Limpeza" },
    { value: "manuais", label: "Manuais" },
    { value: "outras", label: "Outras" },
  ];

  const categoryOptions = categories.length > 0 ? categories : defaultCategoryOptions;

  const resolveCategoryLabel = (value) => {
    if (!value) return "-";
    const match = categoryOptions.find((item) => item.value === value);
    if (match) return match.label;
    return String(value)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const sortedCategoryOptions = [...categoryOptions].sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR")
  );
  const sortedCustomCategories = [...customCategories].sort((a, b) =>
    resolveCategoryLabel(a).localeCompare(resolveCategoryLabel(b), "pt-BR")
  );

  useEffect(() => {
    if (material) {
      const allowedCategories = categoryOptions.map((option) => option.value);
      const incomingCategory = material.category || "outras";
      const normalizedCategory = allowedCategories.includes(incomingCategory)
        ? incomingCategory
        : "outras";
      setFormData({
        name: material.name || "",
        code: material.code || "",
        description: material.description || "",
        unit: material.unit || "unidade",
        category: normalizedCategory,
        minimum_stock: material.minimum_stock || 0,
        current_stock: material.current_stock || 0,
        location: material.location || "",
        expiry_date: material.expiry_date || "",
      });
    } else {
      // Gerar código para novo material
      setFormData((prev) => ({
        ...prev,
        code: prev.code || generateCode(prev.category),
      }));
    }
  }, [material, categoryOptions]);

  const saveMaterial = useMutation({
    mutationFn: (/** @type {any} */ data) => {
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
    const payload = {
      ...formData,
      code: formData.code || generateCode(formData.category),
      expiry_date: formData.expiry_date || null,
    };
    saveMaterial.mutate(payload);
  };

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      // Gerar novo código ao mudar categoria (apenas para novos materiais)
      if (field === "category" && !material && !updated.code) {
        updated.code = generateCode(value);
      }
      return updated;
    });
  };

  const handleGenerateCode = () => {
    handleChange("code", generateCode(formData.category));
  };

  const handleAddCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    const created = onAddCategory ? onAddCategory(trimmed) : trimmed;
    if (created) {
      handleChange("category", created);
      setNewCategory("");
    }
  };

  const handleDeleteCategory = (value) => {
    if (!onDeleteCategory) return;
    const removed = onDeleteCategory(value);
    if (!removed) {
      window.alert("Não é possível excluir uma categoria em uso.");
      return;
    }
    if (formData.category === value) {
      handleChange("category", "outras");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="code">Código</Label>
          <div className="flex gap-2">
            <Input
              id="code"
              value={formData.code}
              onChange={(e) => handleChange("code", e.target.value)}
              placeholder="Gerado automaticamente"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleGenerateCode}
              className="shrink-0"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Gerar
            </Button>
          </div>
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
              {sortedCategoryOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="pt-2 space-y-2">
            <div className="flex gap-2">
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Nova categoria"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddCategory}
                disabled={!newCategory.trim()}
              >
                <Plus className="h-4 w-4 mr-1" />
                Adicionar
              </Button>
            </div>
            {sortedCustomCategories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {sortedCustomCategories.map((category) => {
                  const deletable = canDeleteCategory
                    ? canDeleteCategory(category)
                    : true;
                  return (
                    <div
                      key={category}
                      className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                    >
                      <span>{resolveCategoryLabel(category)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteCategory(category)}
                        disabled={!deletable}
                        className="h-6 w-6 text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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

      <div className="grid grid-cols-2 gap-4">
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