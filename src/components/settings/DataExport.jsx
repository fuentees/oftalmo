import React, { useState } from "react";
import { dataClient } from "@/api/dataClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Download, Database, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function DataExport() {
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState(
    /** @type {Record<string, boolean>} */ ({
      professionals: true,
      trainings: true,
      participants: true,
      materials: true,
      events: true,
      requests: true,
    })
  );

  const entities = [
    { key: "professionals", label: "Profissionais", entity: "Professional" },
    { key: "trainings", label: "Treinamentos", entity: "Training" },
    { key: "participants", label: "Participantes", entity: "TrainingParticipant" },
    { key: "materials", label: "Materiais", entity: "Material" },
    { key: "events", label: "Eventos", entity: "Event" },
    { key: "requests", label: "Solicitações", entity: "MaterialRequest" },
  ];

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportData = {};
      
      for (const item of entities) {
        if (selected[item.key]) {
          const data = await dataClient.entities[item.entity].list();
          exportData[item.key] = data;
        }
      }

      // Create JSON file
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      
      // Download
      const link = document.createElement("a");
      link.href = url;
      link.download = `backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Backup exportado com sucesso!");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Erro ao exportar dados");
    } finally {
      setExporting(false);
    }
  };

  const handleSelectAll = (checked) => {
    const nextValue = checked === true;
    const newSelected = /** @type {Record<string, boolean>} */ ({});
    entities.forEach(item => {
      newSelected[item.key] = nextValue;
    });
    setSelected(newSelected);
  };

  const allSelected = entities.every(item => selected[item.key]);
  const someSelected = entities.some(item => selected[item.key]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-blue-600" />
          Backup e Exportação de Dados
        </CardTitle>
        <CardDescription>
          Exporte todos os dados do sistema em formato JSON
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center space-x-2 pb-2 border-b">
            <Checkbox
              id="select-all"
              checked={allSelected}
              onCheckedChange={handleSelectAll}
            />
            <Label htmlFor="select-all" className="font-semibold">
              Selecionar Todos
            </Label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {entities.map((item) => (
              <div key={item.key} className="flex items-center space-x-2">
                <Checkbox
                  id={item.key}
                  checked={selected[item.key]}
                  onCheckedChange={(checked) =>
                    setSelected(prev => ({ ...prev, [item.key]: checked === true }))
                  }
                />
                <Label htmlFor={item.key} className="cursor-pointer">
                  {item.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t">
          <Button
            onClick={handleExport}
            disabled={!someSelected || exporting}
            className="w-full"
          >
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exportando...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Exportar Dados Selecionados
              </>
            )}
          </Button>
        </div>

        <div className="text-xs text-slate-500 space-y-1">
          <p>• O arquivo será baixado em formato JSON</p>
          <p>• Mantenha o backup em local seguro</p>
          <p>• Use para recuperação ou migração de dados</p>
        </div>
      </CardContent>
    </Card>
  );
}