import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Checkbox } from "@/components/ui/checkbox";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import { Edit, Trash2, Plus } from "lucide-react";

export default function EnrollmentFieldsManager() {
  const [showForm, setShowForm] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [formData, setFormData] = useState({
    training_id: null,
    field_key: "",
    label: "",
    type: "text",
    required: true,
    placeholder: "",
    section: "pessoais",
    order: 0,
    is_active: true,
  });

  const queryClient = useQueryClient();

  const { data: fields = [], isLoading } = useQuery({
    queryKey: ["enrollment-fields"],
    queryFn: () => dataClient.entities.EnrollmentField.list("order"),
  });

  const { data: trainings = [] } = useQuery({
    queryKey: ["trainings"],
    queryFn: () => dataClient.entities.Training.list("title"),
  });

  const createField = useMutation({
    mutationFn: (/** @type {any} */ data) =>
      dataClient.entities.EnrollmentField.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollment-fields"] });
      resetForm();
    },
  });

  const updateField = useMutation({
    mutationFn: (/** @type {{ id: any; data: any }} */ payload) =>
      dataClient.entities.EnrollmentField.update(payload.id, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollment-fields"] });
      resetForm();
    },
  });

  const deleteField = useMutation({
    mutationFn: (/** @type {any} */ id) =>
      dataClient.entities.EnrollmentField.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollment-fields"] });
      setDeleteConfirm(null);
    },
  });

  const resetForm = () => {
    setFormData({
      training_id: null,
      field_key: "",
      label: "",
      type: "text",
      required: true,
      placeholder: "",
      section: "pessoais",
      order: 0,
      is_active: true,
    });
    setEditingField(null);
    setShowForm(false);
  };

  const handleEdit = (field) => {
    setEditingField(field);
    setFormData(field);
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingField) {
      updateField.mutate({ id: editingField.id, data: formData });
    } else {
      createField.mutate(formData);
    }
  };

  const sectionLabels = {
    pessoais: "Dados Pessoais",
    instituicao: "Instituição",
    enderecos: "Endereços",
    contatos: "Contatos",
  };

  const typeLabels = {
    text: "Texto",
    email: "E-mail",
    tel: "Telefone",
    number: "Número",
    date: "Data",
  };

  const columns = [
    {
      header: "Ordem",
      accessor: "order",
      cellClassName: "font-mono text-center",
    },
    {
      header: "Campo",
      accessor: "label",
      cellClassName: "font-medium",
      render: (row) => (
        <div>
          <p className="font-medium">{row.label}</p>
          <p className="text-xs text-slate-500">{row.field_key}</p>
        </div>
      ),
    },
    {
      header: "Treinamento",
      render: (row) => {
        if (!row.training_id) return <Badge variant="outline">Global</Badge>;
        const training = trainings.find(t => t.id === row.training_id);
        return <span className="text-sm">{training?.title || "..."}</span>;
      },
    },
    {
      header: "Seção",
      render: (row) => (
        <Badge variant="outline">{sectionLabels[row.section]}</Badge>
      ),
    },
    {
      header: "Tipo",
      render: (row) => typeLabels[row.type],
    },
    {
      header: "Obrigatório",
      cellClassName: "text-center",
      render: (row) => row.required ? "✓" : "-",
    },
    {
      header: "Status",
      render: (row) => (
        <Badge className={row.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700"}>
          {row.is_active ? "Ativo" : "Inativo"}
        </Badge>
      ),
    },
    {
      header: "Ações",
      cellClassName: "text-right",
      sortable: false,
      render: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleEdit(row)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteConfirm(row)}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campos do Formulário de Inscrição"
        subtitle="Gerencie os campos personalizados do formulário"
        action={() => setShowForm(true)}
        actionLabel="Novo Campo"
        actionIcon={Plus}
      />

      <DataTable
        columns={columns}
        data={fields}
        isLoading={isLoading}
        emptyMessage="Nenhum campo cadastrado"
      />

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingField ? "Editar Campo" : "Novo Campo"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="training_id">Treinamento</Label>
              <Select
                value={formData.training_id || "global"}
                onValueChange={(value) => setFormData({...formData, training_id: value === "global" ? null : value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (todos os treinamentos)</SelectItem>
                  {trainings.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                Campo global ou específico de um treinamento
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="field_key">Chave do Campo *</Label>
              <Input
                id="field_key"
                value={formData.field_key}
                onChange={(e) => setFormData({...formData, field_key: e.target.value})}
                placeholder="Ex: nome_completo"
                required
                disabled={!!editingField}
              />
              <p className="text-xs text-slate-500">
                Identificador único (sem espaços, use underscore)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="label">Rótulo *</Label>
              <Input
                id="label"
                value={formData.label}
                onChange={(e) => setFormData({...formData, label: e.target.value})}
                placeholder="Ex: Nome Completo"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="section">Seção *</Label>
                <Select
                  value={formData.section}
                  onValueChange={(value) => setFormData({...formData, section: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pessoais">Dados Pessoais</SelectItem>
                    <SelectItem value="instituicao">Instituição</SelectItem>
                    <SelectItem value="enderecos">Endereços</SelectItem>
                    <SelectItem value="contatos">Contatos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Tipo *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({...formData, type: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="tel">Telefone</SelectItem>
                    <SelectItem value="number">Número</SelectItem>
                    <SelectItem value="date">Data</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="placeholder">Texto de Ajuda</Label>
              <Input
                id="placeholder"
                value={formData.placeholder}
                onChange={(e) => setFormData({...formData, placeholder: e.target.value})}
                placeholder="Ex: Digite seu nome completo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="order">Ordem de Exibição</Label>
              <Input
                id="order"
                type="number"
                value={formData.order}
                onChange={(e) => setFormData({...formData, order: parseInt(e.target.value) || 0})}
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="required"
                  checked={formData.required}
                  onCheckedChange={(checked) => setFormData({...formData, required: checked})}
                />
                <Label htmlFor="required" className="cursor-pointer">Campo Obrigatório</Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
                />
                <Label htmlFor="is_active" className="cursor-pointer">Campo Ativo</Label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingField ? "Atualizar" : "Criar"} Campo
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o campo "{deleteConfirm?.label}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteField.mutate(deleteConfirm.id)}
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