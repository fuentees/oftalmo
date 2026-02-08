import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Upload, Trash2, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import DataTable from "@/components/common/DataTable";

export default function MaterialsManager({ training }) {
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    file: null,
  });

  const queryClient = useQueryClient();

  const { data: materials = [] } = useQuery({
    queryKey: ["trainingMaterials", training?.id],
    queryFn: () => base44.entities.TrainingMaterial.list(),
    select: (data) => data.filter(m => m.training_id === training?.id),
  });

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const uploadMaterial = useMutation({
    mutationFn: async (data) => {
      setUploading(true);
      const { file_url } = await base44.integrations.Core.UploadFile({ file: data.file });
      
      return base44.entities.TrainingMaterial.create({
        training_id: training.id,
        training_title: training.title,
        name: data.name,
        description: data.description,
        file_url,
        file_type: data.file.name.split('.').pop(),
        uploaded_by: user.email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainingMaterials"] });
      setFormData({ name: "", description: "", file: null });
      setUploading(false);
    },
    onError: () => {
      setUploading(false);
    },
  });

  const deleteMaterial = useMutation({
    mutationFn: (id) => base44.entities.TrainingMaterial.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainingMaterials"] });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.file) {
      uploadMaterial.mutate(formData);
    }
  };

  const columns = [
    {
      header: "Material",
      render: (row) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-400" />
          <div>
            <p className="font-medium">{row.name}</p>
            {row.description && (
              <p className="text-xs text-slate-500">{row.description}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      header: "Tipo",
      render: (row) => row.file_type?.toUpperCase(),
    },
    {
      header: "Upload por",
      accessor: "uploaded_by",
    },
    {
      header: "Ações",
      sortable: false,
      render: (row) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.open(row.file_url, '_blank')}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600"
            onClick={() => deleteMaterial.mutate(row.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-slate-50">
        <div>
          <Label>Nome do Material</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>

        <div>
          <Label>Descrição (opcional)</Label>
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
          />
        </div>

        <div>
          <Label>Arquivo</Label>
          <Input
            type="file"
            onChange={(e) => setFormData({ ...formData, file: e.target.files[0] })}
            required
          />
        </div>

        <Button type="submit" disabled={uploading} className="w-full">
          <Upload className="h-4 w-4 mr-2" />
          {uploading ? "Enviando..." : "Upload Material"}
        </Button>
      </form>

      <DataTable
        columns={columns}
        data={materials}
        emptyMessage="Nenhum material adicionado"
      />
    </div>
  );
}