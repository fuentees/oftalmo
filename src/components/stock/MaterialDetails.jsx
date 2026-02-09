import React from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownCircle, ArrowUpCircle, MapPin, Package } from "lucide-react";
import DataTable from "@/components/common/DataTable";

export default function MaterialDetails({ material, movements }) {
  if (!material) return null;

  const categoryLabels = {
    escritorio: "Escritório",
    folhetos: "Folhetos",
    informatica: "Informática",
    limpeza: "Limpeza",
    manuais: "Manuais",
    outras: "Outras",
  };

  const formatCategoryLabel = (value) => {
    if (!value) return "-";
    const rawValue = String(value);
    const normalized = rawValue.toLowerCase();
    return (
      categoryLabels[rawValue] ||
      categoryLabels[normalized] ||
      rawValue
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())
    );
  };

  const formatDate = (value) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return format(parsed, "dd/MM/yyyy");
  };

  const isLowStock = material.current_stock && material.minimum_stock && 
                     material.current_stock <= material.minimum_stock;

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
    { header: "Quantidade", accessor: "quantity" },
    { header: "Responsável", accessor: "responsible" },
    { header: "Setor", accessor: "sector" },
  ];

  return (
    <div className="space-y-6">
      {/* Material Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-blue-50 flex items-center justify-center">
                <Package className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-lg">{material.name}</p>
                {material.code && <p className="text-sm text-slate-500">{material.code}</p>}
              </div>
            </div>
            
            <div className="pt-2 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Categoria:</span>
                <Badge variant="outline">{formatCategoryLabel(material.category)}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Unidade:</span>
                <span className="capitalize">{material.unit}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Validade:</span>
                <span>{formatDate(material.expiry_date)}</span>
              </div>
              {material.location && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Localização:</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {material.location}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Estoque</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4">
              <p className={`text-4xl font-bold ${isLowStock ? "text-red-600" : "text-slate-900"}`}>
                {material.current_stock || 0}
              </p>
              <p className="text-slate-500 capitalize">{material.unit}</p>
              {isLowStock && (
                <Badge className="mt-2 bg-red-100 text-red-700">
                  Estoque abaixo do mínimo
                </Badge>
              )}
            </div>
            <div className="pt-4 border-t space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Estoque Mínimo:</span>
                <span>{material.minimum_stock || 0} {material.unit}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total de Movimentações:</span>
                <span>{movements.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      {material.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Descrição</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-700">{material.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Movement History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">
            Histórico de Movimentações
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={movementColumns}
            data={movements}
            emptyMessage="Nenhuma movimentação registrada"
          />
        </CardContent>
      </Card>
    </div>
  );
}