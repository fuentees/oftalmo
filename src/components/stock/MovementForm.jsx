import React, { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { useAuth } from "@/lib/AuthContext";
import { useGveMapping } from "@/hooks/useGveMapping";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  ArrowDownCircle,
  ArrowUpCircle,
  MapPin,
  Briefcase,
  Package,
  Plus,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import {
  buildStockMovementNotes,
  parseStockMovementNotes,
} from "@/lib/stockMovementMetadata";

const createMovementItemId = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const buildBatchItem = (material) => ({
  row_id: createMovementItemId(),
  material_id: material?.id || "",
  material_name: material?.name || "",
  material_input: material?.code
    ? `${material.code} - ${material.name}`
    : material?.name || "",
  quantity: 1,
});

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
    output_for_event: false,
    output_for_training: false,
    output_for_distribution: false,
    destination_mode: type === "entrada" ? "setor" : "municipio",
    destination_municipio: "",
    destination_gve: "",
    destination_sector: type === "entrada" ? "Setor de Compras" : "",
    destination_other: "",
    document_number: "",
    notes: "",
  });
  const [materialInput, setMaterialInput] = useState("");
  const [batchItems, setBatchItems] = useState(() => [buildBatchItem(preselectedMaterial)]);
  const [formStatus, setFormStatus] = useState(null);

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { gveMapping, municipalityOptions, getGveByMunicipio } = useGveMapping();
  const loggedResponsible = useMemo(
    () =>
      String(
        currentUser?.full_name || currentUser?.name || currentUser?.email || ""
      ).trim(),
    [currentUser?.full_name, currentUser?.name, currentUser?.email]
  );

  useEffect(() => {
    if (movement) {
      const parsedNotes = parseStockMovementNotes(
        movement.notes_raw || movement.notes
      );
      const metadata = parsedNotes.metadata;
      const fallbackSector = String(movement.sector || "").trim();
      const fallbackIsGve = /^gve\s*:/i.test(fallbackSector);
      const fallbackIsSetor = /^setor\s*:/i.test(fallbackSector);
      const fallbackIsOutros = /^outros\s*:/i.test(fallbackSector);
      const fallbackGve = fallbackIsGve
        ? fallbackSector.replace(/^gve\s*:/i, "").trim()
        : "";
      const fallbackSectorLabel = fallbackIsSetor
        ? fallbackSector.replace(/^setor\s*:/i, "").trim()
        : "";
      const fallbackOther = fallbackIsOutros
        ? fallbackSector.replace(/^outros\s*:/i, "").trim()
        : "";
      const fallbackMunicipio =
        fallbackIsGve || fallbackIsSetor || fallbackIsOutros ? "" : fallbackSector;
      const destinationMunicipio =
        metadata?.destination_municipio || fallbackMunicipio || "";
      const destinationGve =
        metadata?.destination_gve ||
        fallbackGve ||
        getGveByMunicipio(destinationMunicipio) ||
        "";
      const destinationSector =
        metadata?.destination_sector ||
        fallbackSectorLabel ||
        (movement.type === "entrada" ? "Setor de Compras" : "");
      const destinationOther = metadata?.destination_other || fallbackOther || "";
      const destinationMode =
        metadata?.destination_mode ||
        (fallbackIsGve
          ? "gve"
          : fallbackIsSetor
          ? "setor"
          : fallbackIsOutros
          ? "outros"
          : movement.type === "entrada"
          ? "setor"
          : "municipio");

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
        output_for_event: Boolean(metadata?.purpose_event),
        output_for_training: Boolean(metadata?.purpose_training),
        output_for_distribution: Boolean(metadata?.purpose_distribution),
        destination_mode:
          destinationMode === "gve"
            ? "gve"
            : destinationMode === "setor"
            ? "setor"
            : destinationMode === "outros"
            ? "outros"
            : "municipio",
        destination_municipio: destinationMunicipio,
        destination_gve: destinationGve,
        destination_sector: destinationSector,
        destination_other: destinationOther,
        document_number: movement.document_number || "",
        notes: parsedNotes.notes || "",
      });
      return;
    }
    if (preselectedMaterial) {
      setFormData((prev) => ({
        ...prev,
        material_id: preselectedMaterial.id,
        material_name: preselectedMaterial.name,
      }));
      const preselectedLabel = preselectedMaterial.code
        ? `${preselectedMaterial.code} - ${preselectedMaterial.name}`
        : preselectedMaterial.name;
      setMaterialInput(preselectedLabel);
      setBatchItems((prev) => {
        if (prev.length > 0 && prev.some((item) => item.material_id)) return prev;
        return [buildBatchItem(preselectedMaterial)];
      });
      return;
    }
    setBatchItems((prev) => (prev.length > 0 ? prev : [buildBatchItem()]));
  }, [movement, preselectedMaterial, getGveByMunicipio]);

  useEffect(() => {
    if (!movement) return;
    if (materialInput) return;
    const match = materials.find((item) => item.id === movement.material_id);
    if (match) {
      setMaterialInput(
        match.code ? `${match.code} - ${match.name}` : match.name
      );
    } else if (movement.material_name) {
      setMaterialInput(movement.material_name);
    }
  }, [movement, materials, materialInput]);

  useEffect(() => {
    if (movement) return;
    setFormData((prev) => ({
      ...prev,
      type,
      destination_mode: type === "entrada" ? "setor" : "municipio",
      destination_sector:
        type === "entrada"
          ? prev.destination_sector || "Setor de Compras"
          : prev.destination_sector,
      output_for_event: type === "saida" ? prev.output_for_event : false,
      output_for_training: type === "saida" ? prev.output_for_training : false,
      output_for_distribution: type === "saida" ? prev.output_for_distribution : false,
    }));
  }, [type, movement]);

  useEffect(() => {
    if (movement) return;
    if (!loggedResponsible) return;
    setFormData((prev) =>
      prev.responsible
        ? prev
        : {
            ...prev,
            responsible: loggedResponsible,
          }
    );
  }, [movement, loggedResponsible]);

  const normalizeText = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const gveOptions = useMemo(
    () =>
      Array.from(
        new Set(
          gveMapping
            .map((item) => String(item?.gve || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })),
    [gveMapping]
  );
  const hasPurposeSelection =
    formData.output_for_event ||
    formData.output_for_training ||
    formData.output_for_distribution;
  const responsibleDisplayValue = String(
    loggedResponsible || formData.responsible || ""
  ).trim();
  const linkedMunicipioGve =
    getGveByMunicipio(formData.destination_municipio) ||
    formData.destination_gve ||
    "";

  const materialOptions = useMemo(
    () =>
      materials
        .map((material) => ({
          id: material.id,
          name: material.name,
          code: material.code,
          label: material.code
            ? `${material.code} - ${material.name}`
            : material.name,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [materials]
  );

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
        const { items = [], ...baseData } = data || {};
        if (!Array.isArray(items) || items.length === 0) {
          throw new Error("Adicione ao menos um item para registrar a movimentação.");
        }
        const payloads = items
          .map((item) => ({
            ...baseData,
            material_id: item.material_id,
            material_name: item.material_name,
            quantity: Number(item.quantity || 0),
          }))
          .filter(
            (item) =>
              item.material_id &&
              Number.isFinite(item.quantity) &&
              item.quantity > 0
          );
        if (payloads.length === 0) {
          throw new Error("Nenhum item válido encontrado para registrar.");
        }
        await dataClient.entities.StockMovement.bulkCreate(payloads);
        for (const movementItem of payloads) {
          const effect = computeEffect(movementItem);
          await applyStockDelta(movementItem.material_id, effect);
        }
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
      setFormStatus(null);
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      onClose();
    },
    onError: (error) => {
      setFormStatus({
        type: "error",
        message: error?.message || "Não foi possível salvar a movimentação.",
      });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormStatus(null);
    const quantityValue = Number(formData.quantity || 0);
    if (movement) {
      if (!formData.material_id) {
        setFormStatus({
          type: "error",
          message: "Selecione um material válido para continuar.",
        });
        return;
      }
      if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
        setFormStatus({
          type: "error",
          message: "Informe uma quantidade maior que zero.",
        });
        return;
      }
    }
    if (!movement) {
      if (!Array.isArray(batchItems) || batchItems.length === 0) {
        setFormStatus({
          type: "error",
          message: "Adicione ao menos um item para registrar a movimentação.",
        });
        return;
      }
      const hasInvalidItem = batchItems.some((item) => {
        const itemQuantity = Number(item.quantity || 0);
        return !item.material_id || !Number.isFinite(itemQuantity) || itemQuantity <= 0;
      });
      if (hasInvalidItem) {
        setFormStatus({
          type: "error",
          message:
            "Verifique os itens: cada linha precisa ter material válido e quantidade maior que zero.",
        });
        return;
      }
    }
    const responsibleValue = responsibleDisplayValue;
    if (!responsibleValue) {
      setFormStatus({
        type: "error",
        message: "Não foi possível identificar o usuário responsável.",
      });
      return;
    }

    const destinationMode =
      formData.destination_mode === "gve"
        ? "gve"
        : formData.destination_mode === "setor"
        ? "setor"
        : formData.destination_mode === "outros"
        ? "outros"
        : "municipio";
    const destinationMunicipio = String(formData.destination_municipio || "").trim();
    let destinationGve = String(formData.destination_gve || "").trim();
    const destinationSectorLabel = String(
      formData.destination_sector || ""
    ).trim();
    const destinationOther = String(formData.destination_other || "").trim();

    if (destinationMode === "municipio" && !destinationMunicipio) {
      setFormStatus({
        type: "error",
        message:
          formData.type === "entrada"
            ? "Informe o município de origem da entrada."
            : "Informe o município de destino.",
      });
      return;
    }
    if (destinationMode === "gve" && !destinationGve) {
      setFormStatus({
        type: "error",
        message:
          formData.type === "entrada"
            ? "Informe o GVE de origem da entrada."
            : "Informe o GVE de destino.",
      });
      return;
    }
    if (destinationMode === "setor" && !destinationSectorLabel) {
      setFormStatus({
        type: "error",
        message: "Informe o setor.",
      });
      return;
    }
    if (destinationMode === "outros" && !destinationOther) {
      setFormStatus({
        type: "error",
        message: "Descreva o destino/origem em Outros.",
      });
      return;
    }
    if (formData.type === "saida" && destinationMode === "setor" && !hasPurposeSelection) {
      setFormStatus({
        type: "error",
        message:
          "No destino Setor, selecione ao menos uma finalidade: Evento, Treinamento ou Distribuição.",
      });
      return;
    }

    if (formData.type === "saida" && destinationMode === "municipio") {
      destinationGve = getGveByMunicipio(destinationMunicipio) || destinationGve;
    }

    const destinationSector =
      formData.type === "saida"
        ? destinationMode === "gve"
          ? destinationGve
            ? `GVE: ${destinationGve}`
            : ""
          : destinationMode === "setor"
          ? `SETOR: ${destinationSectorLabel}`
          : destinationMode === "outros"
          ? `OUTROS: ${destinationOther}`
          : destinationMunicipio
        : destinationMode === "gve"
        ? `GVE: ${destinationGve}`
        : destinationMode === "setor"
        ? `SETOR: ${destinationSectorLabel}`
        : destinationMode === "outros"
        ? `OUTROS: ${destinationOther}`
        : destinationMunicipio;

    const metadataBase = {
      responsible_auto: Boolean(loggedResponsible),
      responsible_user: currentUser?.email || loggedResponsible || null,
    };
    const notesValue = buildStockMovementNotes(
      formData.notes,
      {
        ...metadataBase,
        purpose_event: formData.type === "saida" ? formData.output_for_event : false,
        purpose_training:
          formData.type === "saida" ? formData.output_for_training : false,
        purpose_distribution:
          formData.type === "saida" ? formData.output_for_distribution : false,
        destination_mode: destinationMode,
        destination_municipio:
          destinationMode === "municipio" ? destinationMunicipio || null : null,
        destination_gve: destinationMode === "gve" ? destinationGve || null : null,
        destination_sector:
          destinationMode === "setor" ? destinationSectorLabel || null : null,
        destination_other:
          destinationMode === "outros" ? destinationOther || null : null,
      }
    );

    const payload = movement
      ? {
          material_id: formData.material_id,
          material_name: formData.material_name,
          type: formData.type,
          quantity: quantityValue,
          date: formData.date,
          responsible: responsibleValue,
          sector: destinationSector,
          document_number: formData.document_number,
          notes: notesValue,
        }
      : {
          type: formData.type,
          date: formData.date,
          responsible: responsibleValue,
          sector: destinationSector,
          document_number: formData.document_number,
          notes: notesValue,
          items: (() => {
            const grouped = new Map();
            batchItems.forEach((item) => {
              const materialId = String(item.material_id || "").trim();
              const materialName = String(item.material_name || "").trim();
              const itemQuantity = Number(item.quantity || 0);
              if (!materialId || !Number.isFinite(itemQuantity) || itemQuantity <= 0) return;
              const current = grouped.get(materialId);
              if (current) {
                current.quantity += itemQuantity;
                return;
              }
              grouped.set(materialId, {
                material_id: materialId,
                material_name: materialName,
                quantity: itemQuantity,
              });
            });
            return Array.from(grouped.values());
          })(),
        };

    saveMovement.mutate(payload);
  };

  const handleChange = (field, value) => {
    setFormData((prev) => {
      if (field === "destination_municipio") {
        const nextGve = getGveByMunicipio(value) || prev.destination_gve || "";
        return {
          ...prev,
          destination_municipio: value,
          destination_gve: nextGve,
        };
      }
      if (field === "destination_mode") {
        const nextMode =
          value === "gve"
            ? "gve"
            : value === "setor"
            ? "setor"
            : value === "outros"
            ? "outros"
            : "municipio";
        const nextGve =
          nextMode === "municipio"
            ? getGveByMunicipio(prev.destination_municipio) ||
              prev.destination_gve ||
              ""
            : nextMode === "gve"
            ? prev.destination_gve || ""
            : "";
        return {
          ...prev,
          destination_mode: nextMode,
          destination_gve: nextGve,
          destination_sector:
            nextMode === "setor"
              ? prev.destination_sector ||
                (prev.type === "entrada" ? "Setor de Compras" : "")
              : prev.destination_sector,
          destination_other: nextMode === "outros" ? prev.destination_other : "",
          output_for_event:
            nextMode === "setor" && prev.type === "saida"
              ? prev.output_for_event
              : false,
          output_for_training:
            nextMode === "setor" && prev.type === "saida"
              ? prev.output_for_training
              : false,
          output_for_distribution:
            nextMode === "setor" && prev.type === "saida"
              ? prev.output_for_distribution
              : false,
        };
      }
      return { ...prev, [field]: value };
    });
  };

  const findMaterialByInput = (value) => {
    const normalized = normalizeText(value);
    return materials.find((material) => {
      const name = normalizeText(material.name);
      const code = normalizeText(material.code);
      const label = normalizeText(
        material.code ? `${material.code} - ${material.name}` : material.name
      );
      return (
        normalized === name ||
        (code && normalized === code) ||
        normalized === label
      );
    });
  };

  const handleMaterialInput = (value) => {
    setMaterialInput(value);
    const match = findMaterialByInput(value);
    if (match) {
      setFormData((prev) => ({
        ...prev,
        material_id: match.id,
        material_name: match.name,
      }));
      return;
    }
    setFormData((prev) => ({
      ...prev,
      material_id: "",
      material_name: value,
    }));
  };

  const updateBatchItem = (rowId, updater) => {
    setBatchItems((prev) =>
      prev.map((item) =>
        item.row_id === rowId
          ? {
              ...item,
              ...(typeof updater === "function" ? updater(item) : updater),
            }
          : item
      )
    );
  };

  const handleBatchMaterialInput = (rowId, value) => {
    const match = findMaterialByInput(value);
    updateBatchItem(rowId, () => ({
      material_input: value,
      material_id: match?.id || "",
      material_name: match?.name || value,
    }));
  };

  const handleBatchQuantityChange = (rowId, value) => {
    const parsed = Number(value);
    updateBatchItem(rowId, {
      quantity: Number.isFinite(parsed) ? parsed : 0,
    });
  };

  const handleAddBatchItem = () => {
    setBatchItems((prev) => [...prev, buildBatchItem()]);
  };

  const handleRemoveBatchItem = (rowId) => {
    setBatchItems((prev) =>
      prev.length <= 1 ? prev : prev.filter((item) => item.row_id !== rowId)
    );
  };

  const hasInvalidBatchItems =
    !movement &&
    batchItems.some((item) => {
      const quantity = Number(item.quantity || 0);
      return !item.material_id || !Number.isFinite(quantity) || quantity <= 0;
    });

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
      {!movement && (
        <p className="text-xs text-slate-500">
          Você pode registrar vários materiais de uma vez usando o botão
          "Adicionar item".
        </p>
      )}

      {movement ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="material-input">Material *</Label>
            <Input
              id="material-input"
              value={materialInput}
              onChange={(e) => handleMaterialInput(e.target.value)}
              placeholder="Digite o nome ou código do material"
              list="materials-list"
            />
            <datalist id="materials-list">
              {materialOptions.map((option) => (
                <option key={option.id} value={option.label} />
              ))}
            </datalist>
            {materialInput && !formData.material_id && (
              <p className="text-sm text-slate-500">
                Selecione um material da lista para continuar.
              </p>
            )}
            {selectedMaterial && (
              <p className="text-sm text-slate-500">
                Estoque atual: {selectedMaterial.current_stock || 0}{" "}
                {selectedMaterial.unit}
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
        </>
      ) : (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Itens da movimentação *</Label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddBatchItem}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar item
              </Button>
            </div>

            <datalist id="materials-list">
              {materialOptions.map((option) => (
                <option key={option.id} value={option.label} />
              ))}
            </datalist>

            {batchItems.map((item, index) => {
              const selectedBatchMaterial = materials.find(
                (material) => material.id === item.material_id
              );
              return (
                <div
                  key={item.row_id}
                  className="space-y-2 rounded-lg border border-slate-200 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">
                      Item {index + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveBatchItem(item.row_id)}
                      disabled={batchItems.length <= 1}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Remover
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Material</Label>
                      <Input
                        value={item.material_input}
                        onChange={(e) =>
                          handleBatchMaterialInput(item.row_id, e.target.value)
                        }
                        placeholder="Digite o nome ou código do material"
                        list="materials-list"
                      />
                      {item.material_input && !item.material_id && (
                        <p className="text-xs text-slate-500">
                          Selecione um material da lista.
                        </p>
                      )}
                      {selectedBatchMaterial && (
                        <p className="text-xs text-slate-500">
                          Estoque atual: {selectedBatchMaterial.current_stock || 0}{" "}
                          {selectedBatchMaterial.unit}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Quantidade</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          handleBatchQuantityChange(item.row_id, e.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>
              );
            })}
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
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="responsible">Responsável *</Label>
        <Input
          id="responsible"
          value={responsibleDisplayValue}
          onChange={(e) => handleChange("responsible", e.target.value)}
          readOnly={Boolean(loggedResponsible)}
          required
        />
        {loggedResponsible && (
          <p className="text-xs text-slate-500">
            O responsável é preenchido automaticamente com o usuário logado.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label>
            {formData.type === "entrada" ? "Origem da entrada" : "Destino da saída"}
          </Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={
                formData.destination_mode === "municipio" ? "default" : "outline"
              }
              size="sm"
              onClick={() => handleChange("destination_mode", "municipio")}
              className="gap-1.5"
            >
              <MapPin className="h-3.5 w-3.5" />
              Município
            </Button>
            <Button
              type="button"
              variant={formData.destination_mode === "gve" ? "default" : "outline"}
              size="sm"
              onClick={() => handleChange("destination_mode", "gve")}
              className="gap-1.5"
            >
              <Package className="h-3.5 w-3.5" />
              GVE
            </Button>
            <Button
              type="button"
              variant={formData.destination_mode === "setor" ? "default" : "outline"}
              size="sm"
              onClick={() => handleChange("destination_mode", "setor")}
              className="gap-1.5"
            >
              <Briefcase className="h-3.5 w-3.5" />
              Setor
            </Button>
            <Button
              type="button"
              variant={formData.destination_mode === "outros" ? "default" : "outline"}
              size="sm"
              onClick={() => handleChange("destination_mode", "outros")}
              className="gap-1.5"
            >
              Outros
            </Button>
          </div>
        </div>

        {formData.destination_mode === "setor" ? (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <Label htmlFor="destination_sector" className="text-sm font-medium">
              Setor
            </Label>
            <Input
              id="destination_sector"
              value={formData.destination_sector}
              onChange={(e) => handleChange("destination_sector", e.target.value)}
              placeholder="Ex.: Setor de Compras"
            />
            {formData.type === "saida" && (
              <>
                <Label className="text-sm font-medium">Finalidade no setor</Label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="output_for_event"
                      checked={formData.output_for_event}
                      onCheckedChange={(checked) =>
                        handleChange("output_for_event", Boolean(checked))
                      }
                    />
                    <Label htmlFor="output_for_event" className="text-sm font-normal">
                      Evento
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="output_for_training"
                      checked={formData.output_for_training}
                      onCheckedChange={(checked) =>
                        handleChange("output_for_training", Boolean(checked))
                      }
                    />
                    <Label
                      htmlFor="output_for_training"
                      className="text-sm font-normal"
                    >
                      Treinamento
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="output_for_distribution"
                      checked={formData.output_for_distribution}
                      onCheckedChange={(checked) =>
                        handleChange("output_for_distribution", Boolean(checked))
                      }
                    />
                    <Label
                      htmlFor="output_for_distribution"
                      className="text-sm font-normal"
                    >
                      Distribuição
                    </Label>
                  </div>
                </div>
                {!hasPurposeSelection && (
                  <p className="text-xs text-slate-500">
                    Selecione ao menos uma finalidade para a saída do setor.
                  </p>
                )}
              </>
            )}
          </div>
        ) : formData.destination_mode === "outros" ? (
          <div className="space-y-2">
            <Label htmlFor="destination_other">
              {formData.type === "entrada" ? "Origem (outros)" : "Destino (outros)"}
            </Label>
            <Input
              id="destination_other"
              value={formData.destination_other}
              onChange={(e) => handleChange("destination_other", e.target.value)}
              placeholder="Descreva livremente"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label>
              {formData.type === "entrada"
                ? "Origem territorial"
                : "Destino territorial"}
            </Label>
            {gveMapping.length === 0 ? (
              <>
                <Alert>
                  <AlertDescription>
                    Carregue a planilha de municípios/GVE nas configurações para
                    preencher vínculos automáticos de destino.
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
                {formData.destination_mode === "municipio" ? (
                  <>
                    <Input
                      id="destination_municipio_manual"
                      value={formData.destination_municipio}
                      onChange={(e) =>
                        handleChange("destination_municipio", e.target.value)
                      }
                      placeholder="Digite o município manualmente"
                    />
                    <Input
                      id="destination_gve_manual"
                      value={formData.destination_gve}
                      onChange={(e) =>
                        handleChange("destination_gve", e.target.value)
                      }
                      placeholder="Informe o GVE manualmente (opcional)"
                    />
                  </>
                ) : (
                  <Input
                    id="destination_gve_only_manual"
                    value={formData.destination_gve}
                    onChange={(e) => handleChange("destination_gve", e.target.value)}
                    placeholder="Informe o GVE"
                  />
                )}
              </>
            ) : (
              <>
                {formData.destination_mode === "municipio" ? (
                  <>
                    <Input
                      value={formData.destination_municipio}
                      onChange={(e) =>
                        handleChange("destination_municipio", e.target.value)
                      }
                      placeholder="Digite o município"
                      list="municipios-list"
                    />
                    <datalist id="municipios-list">
                      {municipalityOptions.map((municipio) => (
                        <option key={municipio} value={municipio} />
                      ))}
                    </datalist>
                  </>
                ) : (
                  <>
                    <Input
                      value={formData.destination_gve}
                      onChange={(e) => handleChange("destination_gve", e.target.value)}
                      placeholder="Digite o GVE"
                      list="gves-list"
                    />
                    <datalist id="gves-list">
                      {gveOptions.map((gve) => (
                        <option key={gve} value={gve} />
                      ))}
                    </datalist>
                  </>
                )}
                {formData.destination_mode === "municipio" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>GVE Vinculado</Label>
                      <Input
                        value={linkedMunicipioGve || "-"}
                        readOnly
                        placeholder="GVE"
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {formStatus && (
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-800">
            {formStatus.message}
          </AlertDescription>
        </Alert>
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
          disabled={
            saveMovement.isPending ||
            (movement ? !formData.material_id : hasInvalidBatchItems)
          }
          className={
            formData.type === "entrada"
              ? "bg-green-600 hover:bg-green-700"
              : "bg-red-600 hover:bg-red-700"
          }
        >
          {saveMovement.isPending && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          {movement
            ? "Salvar Alterações"
            : `Registrar ${formData.type === "entrada" ? "Entrada" : "Saída"}`}
          {!movement ? ` (${batchItems.length} item(ns))` : ""}
        </Button>
      </div>
    </form>
  );
}