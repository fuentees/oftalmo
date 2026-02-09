import React, { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useNavigate } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { format } from "date-fns";

export default function MovementForm({
  type,
  materials,
  preselectedMaterial = null,
  onClose,
  movement = null,
}) {
  const [formData, setFormData] = useState({
    material_id: "",
    material_name: "",
    type: type,
    quantity: 1,
    date: format(new Date(), "yyyy-MM-dd"),
    responsible: "",
    sector: "",
    document_number: "",
    notes: "",
  });
  const [materialSearch, setMaterialSearch] = useState("");
  const [municipioSearch, setMunicipioSearch] = useState("");
  const [gveMapping, setGveMapping] = useState([]);

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (movement) {
      setFormData({
        material_id: movement.material_id || "",
        material_name: movement.material_name || "",
        type: movement.type || "entrada",
        quantity: Number(movement.quantity || 1),
        date: movement.date
          ? format(new Date(movement.date), "yyyy-MM-dd")
          : format(new Date(), "yyyy-MM-dd"),
        responsible: movement.responsible || "",
        sector: movement.sector || "",
        document_number: movement.document_number || "",
        notes: movement.notes || "",
      });
      setMaterialSearch(movement.material_name || "");
      return;
    }
    if (preselectedMaterial) {
      setFormData((prev) => ({
        ...prev,
        material_id: preselectedMaterial.id,
        material_name: preselectedMaterial.name,
      }));
    }
  }, [movement, preselectedMaterial]);

  useEffect(() => {
    if (movement) return;
    setFormData((prev) => ({ ...prev, type }));
  }, [type, movement]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("gveMappingSp");
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
      map.set(normalizeText(item.municipio), item.gve);
    });
    return map;
  }, [gveMapping]);

  const selectedGve = gveMap.get(normalizeText(formData.sector)) || "";

  const municipalityOptions = useMemo(
    () =>
      gveMapping
        .map((item) => item.municipio)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [gveMapping]
  );

  const filteredMunicipios = municipalityOptions.filter((item) =>
    normalizeText(item).includes(normalizeText(municipioSearch))
  );

  const filteredMaterials = useMemo(() => {
    if (!materialSearch.trim()) return materials;
    const query = normalizeText(materialSearch);
    return materials.filter((material) => {
      const name = normalizeText(material.name);
      const code = normalizeText(material.code);
      return name.includes(query) || code.includes(query);
    });
  }, [materials, materialSearch]);

  const applyStockDelta = async (materialId, delta) => {
    if (!materialId || !Number.isFinite(delta) || delta === 0) return;
    const material = materials.find((item) => item.id === materialId);
    if (!material) return;
    const currentStock = material.current_stock || 0;
    const newStock = currentStock + delta;
    await dataClient.entities.Material.update(material.id, {
      current_stock: Math.max(0, newStock),
    });
  };

  const computeEffect = (movementData) => {
    const quantity = Number(movementData.quantity || 0);
    if (!Number.isFinite(quantity)) return 0;
    return movementData.type === "entrada" ? quantity : -quantity;
  };

  const saveMovement = useMutation({
    mutationFn: async (/** @type {any} */ data) => {
      if (!movement) {
        await dataClient.entities.StockMovement.create(data);
        const effect = computeEffect(data);
        await applyStockDelta(data.material_id, effect);
        return;
      }

      await dataClient.entities.StockMovement.update(movement.id, data);
      const previousEffect = computeEffect(movement);
      const newEffect = computeEffect(data);

      if (movement.material_id && movement.material_id === data.material_id) {
        const delta = newEffect - previousEffect;
        await applyStockDelta(movement.material_id, delta);
      } else {
        if (movement.material_id) {
          await applyStockDelta(movement.material_id, -previousEffect);
        }
        if (data.material_id) {
          await applyStockDelta(data.material_id, newEffect);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      onClose();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMovement.mutate(formData);
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleMaterialSelect = (materialId) => {
    const material = materials.find((m) => m.id === materialId);
    setFormData((prev) => ({
      ...prev,
      material_id: materialId,
      material_name: material?.name || "",
    }));
  };

  const selectedMaterial = materials.find((m) => m.id === formData.material_id);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div
        className={`p-3 rounded-lg flex items-center gap-2 ${
          formData.type === "entrada"
            ? "bg-green-50 text-green-700"
            : "bg-red-50 text-red-700"
        }`}
      >
        {formData.type === "entrada" ? (
          <ArrowDownCircle className="h-5 w-5" />
        ) : (
          <ArrowUpCircle className="h-5 w-5" />
        )}
        <span className="font-medium">
          {formData.type === "entrada"
            ? "Entrada de Material"
            : "Saída de Material"}
        </span>
      </div>

      <div className="space-y-2">
        <Label htmlFor="material-search">Buscar material</Label>
        <Input
          id="material-search"
          value={materialSearch}
          onChange={(e) => setMaterialSearch(e.target.value)}
          placeholder="Digite nome ou código"
        />
        <Label>Material *</Label>
        <Select value={formData.material_id} onValueChange={handleMaterialSelect}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione o material" />
          </SelectTrigger>
          <SelectContent>
            {filteredMaterials.map((material) => (
              <SelectItem key={material.id} value={material.id}>
                {material.code ? `${material.code} - ` : ""}{material.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filteredMaterials.length === 0 && (
          <p className="text-sm text-slate-500">Nenhum material encontrado.</p>
        )}
        {selectedMaterial && (
          <p className="text-sm text-slate-500">
            Estoque atual: {selectedMaterial.current_stock || 0} {selectedMaterial.unit}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="quantity">Quantidade *</Label>
          <Input
            id="quantity"
            type="number"
            min="1"
            value={formData.quantity}
            onChange={(e) => handleChange("quantity", Number(e.target.value))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">Data *</Label>
          <Input
            id="date"
            type="date"
            value={formData.date}
            onChange={(e) => handleChange("date", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="responsible">Responsável *</Label>
        <Input
          id="responsible"
          value={formData.responsible}
          onChange={(e) => handleChange("responsible", e.target.value)}
          required
        />
      </div>

      {formData.type === "saida" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Município (Destino)</Label>
            {gveMapping.length === 0 ? (
              <>
                <Alert>
                  <AlertDescription>
                    Carregue a planilha de municípios/GVE nas configurações para
                    selecionar o destino e preencher o GVE automaticamente.
                  </AlertDescription>
                </Alert>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/Settings")}
                  >
                    Abrir Configurações
                  </Button>
                </div>
                <Input
                  id="sector"
                  value={formData.sector}
                  onChange={(e) => handleChange("sector", e.target.value)}
                  placeholder="Digite o município manualmente"
                />
              </>
            ) : (
              <>
                <Input
                  value={municipioSearch}
                  onChange={(e) => setMunicipioSearch(e.target.value)}
                  placeholder="Buscar município"
                />
                <Select
                  value={formData.sector}
                  onValueChange={(value) => handleChange("sector", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o município" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredMunicipios.map((municipio) => (
                      <SelectItem key={municipio} value={municipio}>
                        {municipio}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>GVE</Label>
                    <Input value={selectedGve} readOnly placeholder="GVE" />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="document_number">Nº Documento</Label>
        <Input
          id="document_number"
          value={formData.document_number}
          onChange={(e) => handleChange("document_number", e.target.value)}
          placeholder="NF, Requisição, etc."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Observações</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleChange("notes", e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button 
          type="submit" 
          disabled={saveMovement.isPending || !formData.material_id} 
          className={
            formData.type === "entrada"
              ? "bg-green-600 hover:bg-green-700"
              : "bg-red-600 hover:bg-red-700"
          }
        >
          {saveMovement.isPending && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          {movement ? "Salvar Alterações" : "Registrar"}{" "}
          {formData.type === "entrada" ? "Entrada" : "Saída"}
        </Button>
      </div>
    </form>
  );
}