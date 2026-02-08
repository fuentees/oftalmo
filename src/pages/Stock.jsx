import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Download } from "lucide-react";
import {
  Package,
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  Edit,
  Trash2,
  Eye,
  History
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
import PageHeader from "@/components/common/PageHeader";
import SearchFilter from "@/components/common/SearchFilter";
import DataTable from "@/components/common/DataTable";
import MaterialForm from "@/components/stock/MaterialForm";
import MovementForm from "@/components/stock/MovementForm";
import MaterialDetails from "@/components/stock/MaterialDetails";

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
    queryFn: () => base44.entities.Material.list(),
  });

  const { data: movements = [], isLoading: loadingMovements } = useQuery({
    queryKey: ["movements"],
    queryFn: () => base44.entities.StockMovement.list("-date", 100),
  });

  const deleteMaterial = useMutation({
    mutationFn: (id) => base44.entities.Material.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      setDeleteConfirm(null);
    },
  });

  const categoryOptions = [
    { value: "EPI", label: "EPI" },
    { value: "escritorio", label: "Escritório" },
    { value: "limpeza", label: "Limpeza" },
    { value: "ferramentas", label: "Ferramentas" },
    { value: "eletrico", label: "Elétrico" },
    { value: "hidraulico", label: "Hidráulico" },
    { value: "informatica", label: "Informática" },
    { value: "outros", label: "Outros" },
  ];

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
        const categoryLabels = {
          EPI: "EPI",
          escritorio: "Escritório",
          limpeza: "Limpeza",
          ferramentas: "Ferramentas",
          eletrico: "Elétrico",
          hidraulico: "Hidráulico",
          informatica: "Informática",
          outros: "Outros",
        };
        return <Badge variant="outline">{categoryLabels[row.category] || row.category}</Badge>;
      },
    },
    {
      header: "Estoque",
      render: (row) => {
        const isLow = row.current_stock && row.minimum_stock && row.current_stock <= row.minimum_stock;
        return (
          <span className={isLow ? "text-red-600 font-semibold" : ""}>
            {row.current_stock || 0} {row.unit}
          </span>
        );
      },
    },
    { header: "Mínimo", render: (row) => `${row.minimum_stock || 0} ${row.unit}` },
    {
      header: "Status",
      render: (row) => (
        <Badge className={row.status === "ativo" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700"}>
          {row.status === "ativo" ? "Ativo" : "Inativo"}
        </Badge>
      ),
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
      render: (row) => format(new Date(row.date), "dd/MM/yyyy"),
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
    { header: "Setor/Destino", accessor: "sector" },
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