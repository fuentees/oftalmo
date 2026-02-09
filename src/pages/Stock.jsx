import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { format, differenceInCalendarDays } from "date-fns";
import {
  Package,
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  Edit,
  Trash2,
  Eye,
  History,
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PageHeader from "@/components/common/PageHeader";
import SearchFilter from "@/components/common/SearchFilter";
import DataTable from "@/components/common/DataTable";
import MaterialForm from "@/components/stock/MaterialForm";
import MovementForm from "@/components/stock/MovementForm";
import MaterialDetails from "@/components/stock/MaterialDetails";

const DEFAULT_CATEGORIES = [
  { value: "escritorio", label: "Escritório" },
  { value: "folhetos", label: "Folhetos" },
  { value: "informatica", label: "Informática" },
  { value: "limpeza", label: "Limpeza" },
  { value: "manuais", label: "Manuais" },
  { value: "outras", label: "Outras" },
];

const CATEGORY_LABELS = DEFAULT_CATEGORIES.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

export default function Stock() {
  const [activeTab, setActiveTab] = useState("materials");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [movementTypeFilter, setMovementTypeFilter] = useState("all");
  
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [movementType, setMovementType] = useState("entrada");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importTarget, setImportTarget] = useState("materials");
  const [importFile, setImportFile] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [customCategories, setCustomCategories] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem("stockCategories");
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  });

  const queryClient = useQueryClient();

  // Check URL params to auto-open form
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'create') {
      setShowMaterialForm(true);
    }
  }, []);

  const { data: materials = [], isLoading: loadingMaterials } = useQuery({
    queryKey: ["materials"],
    queryFn: () => dataClient.entities.Material.list(),
  });

  const { data: movements = [], isLoading: loadingMovements } = useQuery({
    queryKey: ["movements"],
    queryFn: () => dataClient.entities.StockMovement.list("-date", 100),
  });

  const deleteMaterial = useMutation({
    mutationFn: (id) => dataClient.entities.Material.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      setDeleteConfirm(null);
    },
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "stockCategories",
      JSON.stringify(customCategories)
    );
  }, [customCategories]);

  const normalizeCategoryKey = (value) =>
    String(value ?? "").trim().toLowerCase();

  const formatCategoryLabel = (value) => {
    if (!value) return "-";
    const rawValue = String(value);
    const normalized = normalizeCategoryKey(rawValue);
    return (
      CATEGORY_LABELS[rawValue] ||
      CATEGORY_LABELS[normalized] ||
      rawValue
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())
    );
  };

  const generateMaterialCode = (categoryValue) => {
    const normalized = normalizeCategoryKey(categoryValue);
    const prefixes = {
      escritorio: "ESC",
      folhetos: "FOL",
      limpeza: "LMP",
      manuais: "MAN",
      informatica: "INF",
      outras: "OUT",
    };
    const prefix =
      prefixes[categoryValue] ||
      prefixes[normalized] ||
      normalized.replace(/[^a-z0-9]/g, "").slice(0, 3).toUpperCase() ||
      "OUT";
    const random = Math.floor(Math.random() * 9999)
      .toString()
      .padStart(4, "0");
    return `${prefix}-${random}`;
  };

  const formatDate = (value) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return format(parsed, "dd/MM/yyyy");
  };

  const allCategories = React.useMemo(() => {
    const merged = [
      ...DEFAULT_CATEGORIES.map((item) => item.value),
      ...customCategories,
    ];
    const unique = [];
    const seen = new Set();
    merged.forEach((value) => {
      if (!value) return;
      const key = normalizeCategoryKey(value);
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(value);
    });
    return unique;
  }, [customCategories]);

  const categoryOptions = allCategories
    .map((value) => ({
      value,
      label: formatCategoryLabel(value),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  React.useEffect(() => {
    if (!materials.length) return;
    setCustomCategories((prev) => {
      const existingKeys = new Set(
        [...DEFAULT_CATEGORIES.map((item) => item.value), ...prev].map(
          normalizeCategoryKey
        )
      );
      const additions = [];
      materials.forEach((material) => {
        if (!material.category) return;
        const key = normalizeCategoryKey(material.category);
        if (existingKeys.has(key)) return;
        existingKeys.add(key);
        additions.push(material.category);
      });
      if (additions.length === 0) return prev;
      return [...prev, ...additions];
    });
  }, [materials]);

  const canDeleteCategory = (value) => {
    const key = normalizeCategoryKey(value);
    const isDefault = DEFAULT_CATEGORIES.some(
      (item) => normalizeCategoryKey(item.value) === key
    );
    if (isDefault) return false;
    return !materials.some((material) => normalizeCategoryKey(material.category) === key);
  };

  const handleAddCategory = (value) => {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return null;
    const key = normalizeCategoryKey(trimmed);
    const existing = allCategories.find(
      (item) => normalizeCategoryKey(item) === key
    );
    if (existing) return existing;
    setCustomCategories((prev) => [...prev, trimmed]);
    return trimmed;
  };

  const getExpiryStatus = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    const today = new Date();
    const days = differenceInCalendarDays(parsed, today);
    if (days < 0) {
      return { status: "expired", days };
    }
    if (days <= 30) {
      return { status: "expiring", days };
    }
    return null;
  };

  const getExpiryLabel = (value) => {
    const result = getExpiryStatus(value);
    if (!result) return null;
    if (result.status === "expired") return "Vencido";
    if (result.days === 0) return "Vence hoje";
    if (result.days === 1) return "Vence amanhã";
    return `Vence em ${result.days} dias`;
  };

  const isLowStock = (material) => {
    const current = material?.current_stock;
    const minimum = material?.minimum_stock;
    if (current === null || current === undefined) return false;
    if (minimum === null || minimum === undefined) return false;
    return current <= minimum;
  };

  const lowStockCount = materials.filter(isLowStock).length;
  const expiredCount = materials.filter(
    (material) => getExpiryStatus(material.expiry_date)?.status === "expired"
  ).length;
  const expiringCount = materials.filter(
    (material) => getExpiryStatus(material.expiry_date)?.status === "expiring"
  ).length;

  const handleDeleteCategory = (value) => {
    if (!value || !canDeleteCategory(value)) return false;
    setCustomCategories((prev) =>
      prev.filter((item) => normalizeCategoryKey(item) !== normalizeCategoryKey(value))
    );
    return true;
  };

  const normalizeHeader = (value) => {
    if (value === null || value === undefined) return "";
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  };

  const normalizeRow = (row) => {
    const normalized = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      const normalizedKey = normalizeHeader(key);
      if (!normalizedKey) return;
      normalized[normalizedKey] = value;
    });
    return normalized;
  };

  const pickValue = (row, keys) => {
    for (const key of keys) {
      const value = row[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return null;
  };

  const cleanValue = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    }
    return value;
  };

  const toNumber = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const normalized = String(value).replace(",", ".").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const toInteger = (value) => {
    const numeric = toNumber(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
  };

  const normalizeDateValue = (value) => {
    if (value === undefined || value === null) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return format(value, "yyyy-MM-dd");
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      if (value >= 20000) {
        const excelDate = new Date(Math.round((value - 25569) * 86400 * 1000));
        if (!Number.isNaN(excelDate.getTime())) {
          return format(excelDate, "yyyy-MM-dd");
        }
      }
      return null;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
        const [day, month, year] = trimmed.split("/");
        return `${year}-${month}-${day}`;
      }
      const numeric = Number(trimmed.replace(",", "."));
      if (
        Number.isFinite(numeric) &&
        numeric >= 20000 &&
        /^\d+(\.\d+)?$/.test(trimmed)
      ) {
        const excelDate = new Date(
          Math.round((numeric - 25569) * 86400 * 1000)
        );
        if (!Number.isNaN(excelDate.getTime())) {
          return format(excelDate, "yyyy-MM-dd");
        }
      }
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return format(parsed, "yyyy-MM-dd");
      }
      return trimmed;
    }
    return null;
  };

  const normalizeMovementType = (value) => {
    const normalized = normalizeHeader(value);
    if (!normalized) return null;
    if (normalized.includes("entrada")) return "entrada";
    if (normalized.includes("saida")) return "saida";
    return null;
  };

  const importStock = useMutation({
    mutationFn: async (/** @type {{ file: File; target: "materials" | "movements" }} */ payload) => {
      const { file, target } = payload;
      setImportStatus({ type: "loading", message: "Processando planilha..." });

      const { file_url } = await dataClient.integrations.Core.UploadFile({ file });
      const result = await dataClient.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
      });

      if (result.status === "error") {
        throw new Error(result.details || "Erro ao processar planilha");
      }

      const rows = result.output?.participants || result.output || [];
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error("Nenhum dado encontrado na planilha.");
      }

      if (target === "materials") {
        const payloads = rows
          .map((rawRow) => {
            const row = normalizeRow(rawRow);
            const name = cleanValue(pickValue(row, ["name", "nome"]));
            if (!name) return null;
            const categoryValue =
              cleanValue(pickValue(row, ["category", "categoria"])) || "outras";
            const codeValue =
              cleanValue(pickValue(row, ["code", "codigo"])) ||
              generateMaterialCode(categoryValue);
            handleAddCategory(categoryValue);
            return {
              name,
              code: codeValue,
              description: cleanValue(pickValue(row, ["description", "descricao"])),
              unit: cleanValue(pickValue(row, ["unit", "unidade"])),
              category: categoryValue,
              minimum_stock: toInteger(
                pickValue(row, ["minimum_stock", "estoque_minimo", "minimo"])
              ),
              current_stock: toInteger(
                pickValue(row, ["current_stock", "estoque_atual", "estoque", "saldo"])
              ),
              location: cleanValue(pickValue(row, ["location", "localizacao", "local"])),
              expiry_date: normalizeDateValue(
                pickValue(row, ["expiry_date", "validade"])
              ),
            };
          })
          .filter(Boolean);

        if (payloads.length === 0) {
          throw new Error("Nenhum material válido encontrado.");
        }

        await dataClient.entities.Material.bulkCreate(payloads);

        const skipped = rows.length - payloads.length;
        setImportStatus({
          type: "success",
          message: `${payloads.length} material(is) importado(s) com sucesso${
            skipped > 0 ? ` (${skipped} linha(s) ignoradas)` : ""
          }.`,
        });

        return { imported: payloads.length, target };
      }

      const payloads = rows
        .map((rawRow) => {
          const row = normalizeRow(rawRow);
          const materialId = cleanValue(
            pickValue(row, ["material_id", "id_material"])
          );
          const materialCode = cleanValue(
            pickValue(row, ["material_code", "codigo_material", "codigo"])
          );
          const materialName = cleanValue(
            pickValue(row, ["material_name", "nome_material", "material", "nome"])
          );
          const quantity = toInteger(pickValue(row, ["quantity", "quantidade"]));
          const type = normalizeMovementType(pickValue(row, ["type", "tipo"]));

          const matchedByCode = materialCode
            ? materials.find(
                (item) =>
                  String(item.code || "").toLowerCase().trim() ===
                  String(materialCode).toLowerCase().trim()
              )
            : null;
          const matchedByName = materialName
            ? materials.find(
                (item) =>
                  String(item.name || "").toLowerCase().trim() ===
                  String(materialName).toLowerCase().trim()
              )
            : null;

          const resolvedMaterial = matchedByCode || matchedByName;
          const resolvedMaterialId = materialId || resolvedMaterial?.id || null;
          const resolvedMaterialName =
            materialName || resolvedMaterial?.name || null;

          if (!type || !quantity || (!resolvedMaterialId && !resolvedMaterialName)) {
            return null;
          }

          return {
            material_id: resolvedMaterialId,
            material_name: resolvedMaterialName,
            type,
            quantity,
            date: normalizeDateValue(pickValue(row, ["date", "data"])),
            responsible: cleanValue(pickValue(row, ["responsible", "responsavel"])),
            sector: cleanValue(pickValue(row, ["sector", "setor", "destino"])),
            document_number: cleanValue(
              pickValue(row, ["document_number", "documento", "numero_documento"])
            ),
            notes: cleanValue(pickValue(row, ["notes", "observacoes", "obs"])),
          };
        })
        .filter(Boolean);

      if (payloads.length === 0) {
        throw new Error("Nenhuma movimentação válida encontrada.");
      }

      await dataClient.entities.StockMovement.bulkCreate(payloads);

      const skipped = rows.length - payloads.length;
      setImportStatus({
        type: "success",
        message: `${payloads.length} movimentação(ões) importada(s) com sucesso${
          skipped > 0 ? ` (${skipped} linha(s) ignoradas)` : ""
        }.`,
      });

      return { imported: payloads.length, target };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      setTimeout(() => {
        setShowImport(false);
        setImportFile(null);
        setImportStatus(null);
      }, 2000);
    },
    onError: (error) => {
      setImportStatus({
        type: "error",
        message: error.message || "Erro ao importar planilha",
      });
    },
  });

  const handleImportFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      setImportFile(file);
      setImportStatus(null);
    }
  };

  const handleImport = () => {
    if (importFile) {
      importStock.mutate({ file: importFile, target: importTarget });
    }
  };

  const downloadTemplate = (target) => {
    const template =
      target === "materials"
        ? `name,code,description,unit,category,minimum_stock,current_stock,location,expiry_date
Papel A4,ESC-1001,Papel sulfite,caixa,escritorio,10,30,Almoxarifado,2026-01-01
Álcool 70%,LIM-0002,Frasco 1L,un,limpeza,20,45,Depósito,2025-11-30
Manual NR-10,MAN-0100,Manual de segurança,un,manuais,5,15,Arquivo,2027-12-31`
        : `material_code,material_name,type,quantity,date,responsible,sector,document_number,notes
EPI-001,Luvas de Proteção,entrada,100,2025-01-10,Almoxarifado,Manutenção,NF-123,Entrada inicial
LIM-002,Álcool 70%,saida,5,2025-01-12,João Silva,Enfermagem,REQ-45,Reposição`;

    const blob = new Blob([template], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      target === "materials"
        ? "modelo_materiais.csv"
        : "modelo_movimentacoes.csv";
    link.click();
  };

  const handleOpenImport = (target) => {
    setImportTarget(target);
    setImportFile(null);
    setImportStatus(null);
    setShowImport(true);
  };

  const handleCloseImport = () => {
    setShowImport(false);
    setImportFile(null);
    setImportStatus(null);
  };

  const filteredMaterials = materials.filter((m) => {
    const matchesSearch = m.name?.toLowerCase().includes(search.toLowerCase()) ||
                          m.code?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "all" || m.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const filteredMovements = movements.filter((m) => {
    const matchesSearch = m.material_name?.toLowerCase().includes(search.toLowerCase()) ||
                          m.responsible?.toLowerCase().includes(search.toLowerCase());
    const matchesType = movementTypeFilter === "all" || m.type === movementTypeFilter;
    return matchesSearch && matchesType;
  });

  const materialColumns = [
    { header: "Código", accessor: "code" },
    { header: "Nome", accessor: "name", cellClassName: "font-medium" },
    {
      header: "Categoria",
      render: (row) => {
        return (
          <Badge variant="outline">
            {formatCategoryLabel(row.category)}
          </Badge>
        );
      },
    },
    {
      header: "Estoque",
      render: (row) => {
        const isLow = isLowStock(row);
        return (
          <span className={isLow ? "text-red-600 font-semibold" : ""}>
            {row.current_stock || 0} {row.unit}
          </span>
        );
      },
    },
    { header: "Mínimo", render: (row) => `${row.minimum_stock || 0} ${row.unit}` },
    {
      header: "Validade",
      render: (row) => formatDate(row.expiry_date),
    },
    {
      header: "Alertas",
      render: (row) => {
        const alerts = [];
        if (isLowStock(row)) {
          alerts.push(
            <Badge
              key="low-stock"
              className="bg-red-100 text-red-700"
            >
              Estoque baixo
            </Badge>
          );
        }
        const expiryLabel = getExpiryLabel(row.expiry_date);
        if (expiryLabel) {
          const status = getExpiryStatus(row.expiry_date)?.status;
          alerts.push(
            <Badge
              key="expiry"
              className={
                status === "expired"
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"
              }
            >
              {expiryLabel}
            </Badge>
          );
        }
        if (alerts.length === 0) return "-";
        return <div className="flex flex-wrap gap-1">{alerts}</div>;
      },
    },
    {
      header: "Ações",
      cellClassName: "text-right",
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedMaterial(row);
              setShowDetails(true);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedMaterial(row);
              setShowMaterialForm(true);
            }}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-red-600"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteConfirm(row);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const movementColumns = [
    {
      header: "Data",
      render: (row) => formatDate(row.date),
    },
    {
      header: "Tipo",
      render: (row) => (
        <Badge className={row.type === "entrada" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
          {row.type === "entrada" ? (
            <ArrowDownCircle className="h-3 w-3 mr-1" />
          ) : (
            <ArrowUpCircle className="h-3 w-3 mr-1" />
          )}
          {row.type === "entrada" ? "Entrada" : "Saída"}
        </Badge>
      ),
    },
    { header: "Material", accessor: "material_name", cellClassName: "font-medium" },
    { header: "Quantidade", accessor: "quantity" },
    { header: "Responsável", accessor: "responsible" },
    { header: "Município (Destino)", accessor: "sector" },
    { header: "Documento", accessor: "document_number" },
  ];

  const handleNewMovement = (type) => {
    setMovementType(type);
    setSelectedMaterial(null);
    setShowMovementForm(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Controle de Estoque"
        subtitle="Gerencie materiais e movimentações"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <TabsList>
            <TabsTrigger value="materials" className="gap-2">
              <Package className="h-4 w-4" />
              Materiais
            </TabsTrigger>
            <TabsTrigger value="movements" className="gap-2">
              <History className="h-4 w-4" />
              Movimentações
            </TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            {activeTab === "materials" ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => downloadTemplate("materials")}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Modelo
                </Button>
                <Button
                  onClick={() => handleOpenImport("materials")}
                  className="bg-green-600 hover:bg-green-700 flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Importar Planilha
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleNewMovement("entrada")}
                  className="text-green-600 border-green-200 hover:bg-green-50"
                >
                  <ArrowDownCircle className="h-4 w-4 mr-2" />
                  Entrada
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleNewMovement("saida")}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  <ArrowUpCircle className="h-4 w-4 mr-2" />
                  Saída
                </Button>
                <Button
                  onClick={() => {
                    setSelectedMaterial(null);
                    setShowMaterialForm(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Material
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => downloadTemplate("movements")}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Modelo
                </Button>
                <Button
                  onClick={() => handleOpenImport("movements")}
                  className="bg-green-600 hover:bg-green-700 flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Importar Planilha
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleNewMovement("entrada")}
                  className="text-green-600 border-green-200 hover:bg-green-50"
                >
                  <ArrowDownCircle className="h-4 w-4 mr-2" />
                  Nova Entrada
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleNewMovement("saida")}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  <ArrowUpCircle className="h-4 w-4 mr-2" />
                  Nova Saída
                </Button>
              </>
            )}
          </div>
        </div>

        <TabsContent value="materials">
          <SearchFilter
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por nome ou código..."
            filters={[
              {
                value: categoryFilter,
                onChange: setCategoryFilter,
                placeholder: "Categoria",
                allLabel: "Todas categorias",
                options: categoryOptions,
              },
            ]}
          />
          {(lowStockCount > 0 || expiredCount > 0 || expiringCount > 0) && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {lowStockCount > 0 && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    {lowStockCount} material(is) com estoque mínimo.
                  </AlertDescription>
                </Alert>
              )}
              {expiredCount > 0 && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    {expiredCount} material(is) com validade vencida.
                  </AlertDescription>
                </Alert>
              )}
              {expiringCount > 0 && (
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    {expiringCount} material(is) vencem em até 30 dias.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
          <DataTable
            columns={materialColumns}
            data={filteredMaterials}
            isLoading={loadingMaterials}
            emptyMessage="Nenhum material cadastrado"
          />
        </TabsContent>

        <TabsContent value="movements">
          <SearchFilter
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por material ou responsável..."
            filters={[
              {
                value: movementTypeFilter,
                onChange: setMovementTypeFilter,
                placeholder: "Tipo",
                allLabel: "Todos os tipos",
                options: [
                  { value: "entrada", label: "Entrada" },
                  { value: "saida", label: "Saída" },
                ],
              },
            ]}
          />
          <DataTable
            columns={movementColumns}
            data={filteredMovements}
            isLoading={loadingMovements}
            emptyMessage="Nenhuma movimentação registrada"
          />
        </TabsContent>
      </Tabs>

      {/* Import Dialog */}
      <Dialog
        open={showImport}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseImport();
            return;
          }
          setShowImport(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              {importTarget === "materials"
                ? "Importar Materiais"
                : "Importar Movimentações"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Baixe o modelo, preencha com os dados e envie a planilha
                ({importTarget === "materials"
                  ? "materiais"
                  : "movimentações"}
                ).
              </AlertDescription>
            </Alert>

            <div className="flex">
              <Button
                variant="outline"
                onClick={() => downloadTemplate(importTarget)}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Baixar modelo
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="stock-import-file">
                Selecione o arquivo (.xlsx, .csv)
              </Label>
              <Input
                id="stock-import-file"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImportFileChange}
              />
              {importFile && (
                <p className="text-sm text-slate-500">
                  Arquivo selecionado: {importFile.name}
                </p>
              )}
            </div>

            {importStatus && (
              <Alert
                className={
                  importStatus.type === "error"
                    ? "border-red-200 bg-red-50"
                    : importStatus.type === "success"
                    ? "border-green-200 bg-green-50"
                    : "border-blue-200 bg-blue-50"
                }
              >
                {importStatus.type === "error" && (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                )}
                {importStatus.type === "success" && (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                )}
                {importStatus.type === "loading" && (
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                )}
                <AlertDescription
                  className={
                    importStatus.type === "error"
                      ? "text-red-800"
                      : importStatus.type === "success"
                      ? "text-green-800"
                      : "text-blue-800"
                  }
                >
                  {importStatus.message}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleCloseImport}>
                Cancelar
              </Button>
              <Button
                onClick={handleImport}
                disabled={!importFile || importStock.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {importStock.isPending ? (
                  <>
                    <AlertCircle className="h-4 w-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Importar
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Material Form Dialog */}
      <Dialog open={showMaterialForm} onOpenChange={setShowMaterialForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedMaterial ? "Editar Material" : "Novo Material"}
            </DialogTitle>
          </DialogHeader>
          <MaterialForm
            material={selectedMaterial}
            categories={categoryOptions}
            customCategories={customCategories}
            onAddCategory={handleAddCategory}
            onDeleteCategory={handleDeleteCategory}
            canDeleteCategory={canDeleteCategory}
            onClose={() => {
              setShowMaterialForm(false);
              setSelectedMaterial(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Movement Form Dialog */}
      <Dialog open={showMovementForm} onOpenChange={setShowMovementForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {movementType === "entrada" ? "Registrar Entrada" : "Registrar Saída"}
            </DialogTitle>
          </DialogHeader>
          <MovementForm
            type={movementType}
            materials={materials}
            onClose={() => setShowMovementForm(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Material Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Material</DialogTitle>
          </DialogHeader>
          <MaterialDetails
            material={selectedMaterial}
            movements={movements.filter((m) => m.material_id === selectedMaterial?.id)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o material "{deleteConfirm?.name}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMaterial.mutate(deleteConfirm.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}