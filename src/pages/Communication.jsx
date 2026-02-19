import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dataClient } from "@/api/dataClient";
import { formatDateSafe } from "@/lib/date";
import {
  getSupabaseErrorMessage,
  isMissingSupabaseTableError,
} from "@/lib/supabaseErrors";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquare, Send, Loader2, AlertCircle } from "lucide-react";

const RECIPIENT_SCOPE_OPTIONS = [
  { value: "todos", label: "Todos" },
  { value: "pessoa", label: "Pessoa específica" },
];
const COMMUNICATION_MESSAGES_TABLE_SQL = `create extension if not exists pgcrypto;

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  sender_name text,
  sender_email text,
  recipient_scope text default 'todos',
  recipient_label text,
  subject text,
  message text not null,
  created_at timestamptz default now()
);

create index if not exists idx_communication_messages_created_at
  on public.communication_messages (created_at desc);

notify pgrst, 'reload schema';`;

const resolveScopeLabel = (scope) =>
  RECIPIENT_SCOPE_OPTIONS.find((item) => item.value === scope)?.label || scope;
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const buildAccountLabel = (name, email) =>
  name && email ? `${name} (${email})` : name || email || "Usuário";

export default function Communication() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [formStatus, setFormStatus] = useState(null);
  const [formData, setFormData] = useState({
    recipient_scope: "todos",
    recipient_label: "",
    subject: "",
    message: "",
  });

  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => dataClient.auth.me(),
  });

  const messagesQuery = useQuery({
    queryKey: ["communication-messages"],
    queryFn: () => dataClient.entities.CommunicationMessage.list("-created_at", 300),
  });
  const managedUsersQuery = useQuery({
    queryKey: ["managed-users-recipient-options"],
    queryFn: () => dataClient.integrations.Core.ListManagedUsers(),
    retry: false,
  });
  const messages = messagesQuery.data || [];
  const managedUsers = Array.isArray(managedUsersQuery.data?.users)
    ? managedUsersQuery.data.users
    : [];
  const missingTable = isMissingSupabaseTableError(
    messagesQuery.error,
    "communication_messages"
  );
  const loadErrorMessage = messagesQuery.isError
    ? missingTable
      ? "A tabela communication_messages não foi encontrada no Supabase. Execute o SQL de criação no SQL Editor."
      : getSupabaseErrorMessage(messagesQuery.error) ||
        "Não foi possível carregar as mensagens."
    : "";

  const recipientAccounts = useMemo(() => {
    const mapped = new Map();
    const upsertAccount = (emailValue, nameValue) => {
      const email = normalizeEmail(emailValue);
      if (!email) return;
      const current = mapped.get(email) || { email, name: "" };
      const nextName = String(nameValue || "").trim();
      mapped.set(email, {
        email,
        name: current.name || nextName,
      });
    };

    managedUsers.forEach((user) => {
      upsertAccount(user?.email, user?.full_name || user?.name);
    });
    messages.forEach((item) => {
      upsertAccount(item?.sender_email, item?.sender_name);
    });
    upsertAccount(currentUser?.email, currentUser?.full_name || currentUser?.name);

    return Array.from(mapped.values())
      .map((item) => ({
        email: item.email,
        name: item.name,
        label: buildAccountLabel(item.name, item.email),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
  }, [managedUsers, messages, currentUser?.email, currentUser?.full_name, currentUser?.name]);
  const hasRecipientOptions = recipientAccounts.length > 0;
  const availableScopeFilters = useMemo(() => {
    const knownScopes = new Set(["todos", "pessoa"]);
    messages.forEach((item) => {
      const scope = String(item?.recipient_scope || "").trim().toLowerCase();
      if (scope) knownScopes.add(scope);
    });
    return Array.from(knownScopes);
  }, [messages]);

  const filteredMessages = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    return messages.filter((message) => {
      const scope = String(message.recipient_scope || "todos");
      if (scopeFilter !== "all" && scope !== scopeFilter) return false;
      if (!searchTerm) return true;
      const sender = `${message.sender_name || ""} ${message.sender_email || ""}`.toLowerCase();
      const recipient = `${message.recipient_label || ""} ${scope}`.toLowerCase();
      const subject = String(message.subject || "").toLowerCase();
      const body = String(message.message || "").toLowerCase();
      return (
        sender.includes(searchTerm) ||
        recipient.includes(searchTerm) ||
        subject.includes(searchTerm) ||
        body.includes(searchTerm)
      );
    });
  }, [messages, search, scopeFilter]);

  const createMessage = useMutation({
    mutationFn: (payload) => dataClient.entities.CommunicationMessage.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communication-messages"] });
      setFormStatus({
        type: "success",
        message: "Mensagem enviada no canal com sucesso.",
      });
      setFormData({
        recipient_scope: "todos",
        recipient_label: "",
        subject: "",
        message: "",
      });
    },
    onError: (error) => {
      setFormStatus({
        type: "error",
        message:
          getSupabaseErrorMessage(error) || "Não foi possível enviar a mensagem.",
      });
    },
  });

  const handleCopySetupSql = async () => {
    try {
      await navigator.clipboard.writeText(COMMUNICATION_MESSAGES_TABLE_SQL);
      setFormStatus({
        type: "success",
        message: "SQL copiado. Cole no SQL Editor do Supabase e execute.",
      });
    } catch (error) {
      setFormStatus({
        type: "error",
        message: "Não foi possível copiar o SQL automaticamente.",
      });
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setFormStatus(null);

    const scope = formData.recipient_scope || "todos";
    const recipientLabel = String(formData.recipient_label || "").trim();
    const messageText = String(formData.message || "").trim();
    const subjectText = String(formData.subject || "").trim();
    if (!messageText) {
      setFormStatus({
        type: "error",
        message: "Digite a mensagem antes de enviar.",
      });
      return;
    }
    if (scope === "pessoa" && !recipientLabel) {
      setFormStatus({
        type: "error",
        message: "Selecione a pessoa destinatária.",
      });
      return;
    }

    createMessage.mutate({
      sender_name:
        currentUser?.full_name ||
        currentUser?.name ||
        currentUser?.email ||
        "Usuário",
      sender_email: currentUser?.email || null,
      recipient_scope: scope === "pessoa" ? "pessoa" : "todos",
      recipient_label: scope === "todos" ? "Todos" : recipientLabel,
      subject: subjectText || null,
      message: messageText,
    });
  };

  const columns = [
    {
      header: "Data/Hora",
      render: (row) => formatDateSafe(row.created_at, "dd/MM/yyyy HH:mm") || "-",
    },
    {
      header: "De",
      render: (row) => (
        <div>
          <p className="font-medium">{row.sender_name || "-"}</p>
          {row.sender_email && (
            <p className="text-xs text-slate-500">{row.sender_email}</p>
          )}
        </div>
      ),
    },
    {
      header: "Para",
      render: (row) => (
        <div className="flex flex-col gap-1">
          <Badge variant="outline">{resolveScopeLabel(row.recipient_scope)}</Badge>
          <span className="text-xs text-slate-600">
            {row.recipient_label || "Todos"}
          </span>
        </div>
      ),
    },
    {
      header: "Assunto",
      render: (row) => row.subject || "-",
    },
    {
      header: "Mensagem",
      render: (row) => (
        <p className="max-w-xl whitespace-pre-wrap break-words text-sm text-slate-700">
          {row.message || "-"}
        </p>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Canal de Comunicação"
        subtitle="Todos os perfis visualizam. Envie para todos ou para pessoa específica."
      />

      <Alert>
        <MessageSquare className="h-4 w-4" />
        <AlertDescription>
          O canal é público para todos os perfis. Você pode marcar uma pessoa
          específica para dar contexto.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova Mensagem</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Para</Label>
                <Select
                  value={formData.recipient_scope}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      recipient_scope: value,
                      recipient_label: "",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECIPIENT_SCOPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  {formData.recipient_scope === "todos"
                    ? "Público"
                    : "Detalhe do destinatário"}
                </Label>
                {formData.recipient_scope === "todos" ? (
                  <Input value="Todos" readOnly />
                ) : hasRecipientOptions ? (
                  <Select
                    value={formData.recipient_label}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, recipient_label: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a pessoa" />
                    </SelectTrigger>
                    <SelectContent>
                      {recipientAccounts.map((account) => (
                        <SelectItem key={account.email} value={account.email}>
                          {account.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={formData.recipient_label}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        recipient_label: event.target.value,
                      }))
                    }
                    placeholder="Digite o e-mail da pessoa"
                  />
                )}
              </div>
            </div>
            {formData.recipient_scope === "pessoa" &&
              managedUsersQuery.isError &&
              !messagesQuery.isError && (
                <p className="text-xs text-amber-700">
                  Não foi possível listar todas as contas no momento. Você pode
                  informar o e-mail manualmente.
                </p>
              )}

            <div className="space-y-2">
              <Label>Assunto (opcional)</Label>
              <Input
                value={formData.subject}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, subject: event.target.value }))
                }
                placeholder="Ex.: Entrega de materiais para GVE 12"
              />
            </div>

            <div className="space-y-2">
              <Label>Mensagem *</Label>
              <Textarea
                value={formData.message}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, message: event.target.value }))
                }
                rows={4}
                placeholder="Digite o recado que ficará visível para todos..."
                required
              />
            </div>

            {formStatus && (
              <Alert
                className={
                  formStatus.type === "error"
                    ? "border-red-200 bg-red-50"
                    : "border-green-200 bg-green-50"
                }
              >
                {formStatus.type === "error" && (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                )}
                <AlertDescription
                  className={
                    formStatus.type === "error" ? "text-red-800" : "text-green-800"
                  }
                >
                  {formStatus.message}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={createMessage.isPending || messagesQuery.isError}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {createMessage.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Publicar Mensagem
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mensagens Publicadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {messagesQuery.isError && (
            <Alert className="border-red-200 bg-red-50">
              <div className="space-y-2">
                <AlertDescription className="text-red-800">
                  {loadErrorMessage}
                </AlertDescription>
                {missingTable && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCopySetupSql}
                  >
                    Copiar SQL de criação
                  </Button>
                )}
              </div>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por remetente, destino, assunto ou mensagem..."
            />
            <Select value={scopeFilter} onValueChange={setScopeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por destino" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os destinos</SelectItem>
                {availableScopeFilters.map((scope) => (
                  <SelectItem key={scope} value={scope}>
                    {resolveScopeLabel(scope)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DataTable
            columns={columns}
            data={filteredMessages}
            isLoading={messagesQuery.isLoading}
            emptyMessage="Nenhuma mensagem publicada."
          />
        </CardContent>
      </Card>
    </div>
  );
}
