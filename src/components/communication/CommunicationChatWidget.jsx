import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, Loader2, X, Bell, BellRing } from "lucide-react";
import { dataClient } from "@/api/dataClient";
import { formatDateSafe } from "@/lib/date";
import {
  getSupabaseErrorMessage,
  isMissingSupabaseTableError,
} from "@/lib/supabaseErrors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

const LAST_SEEN_STORAGE_KEY = "communication_chat_last_seen_at";
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
const toTimestamp = (value) => {
  if (!value) return 0;
  const time = Date.parse(String(value));
  return Number.isNaN(time) ? 0 : time;
};
const buildAccountLabel = (name, email) =>
  name && email ? `${name} (${email})` : name || email || "Usuário";

export default function CommunicationChatWidget({ currentUser }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [lastSeenAt, setLastSeenAt] = useState(0);
  const [formData, setFormData] = useState({
    recipient_scope: "todos",
    recipient_label: "",
    subject: "",
    message: "",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(LAST_SEEN_STORAGE_KEY);
    setLastSeenAt(toTimestamp(raw));
  }, []);

  const messagesQuery = useQuery({
    queryKey: ["communication-messages"],
    queryFn: () => dataClient.entities.CommunicationMessage.list("-created_at", 200),
    refetchInterval: 15000,
  });
  const messages = messagesQuery.data || [];
  const managedUsersQuery = useQuery({
    queryKey: ["managed-users-recipient-options"],
    queryFn: () => dataClient.integrations.Core.ListManagedUsers(),
    enabled: open,
    staleTime: 60_000,
    retry: false,
  });
  const managedUsers = Array.isArray(managedUsersQuery.data?.users)
    ? managedUsersQuery.data.users
    : [];

  const missingTable = isMissingSupabaseTableError(
    messagesQuery.error,
    "communication_messages"
  );
  const loadErrorMessage = messagesQuery.isError
    ? missingTable
      ? "A tabela communication_messages não foi encontrada. Execute o SQL de criação no Supabase (SQL Editor)."
      : getSupabaseErrorMessage(messagesQuery.error) || "Não foi possível carregar mensagens."
    : "";

  const unreadCount = useMemo(() => {
    const currentUserEmail = normalizeEmail(currentUser?.email);
    return messages.filter((message) => {
      const createdAt = toTimestamp(message.created_at);
      if (createdAt <= lastSeenAt) return false;
      const senderEmail = normalizeEmail(message.sender_email);
      return !currentUserEmail || senderEmail !== currentUserEmail;
    }).length;
  }, [messages, lastSeenAt, currentUser?.email]);

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

  useEffect(() => {
    if (!open || messages.length === 0) return;
    const newestTimestamp = toTimestamp(messages[0]?.created_at);
    if (!newestTimestamp || newestTimestamp <= lastSeenAt) return;
    setLastSeenAt(newestTimestamp);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        LAST_SEEN_STORAGE_KEY,
        new Date(newestTimestamp).toISOString()
      );
    }
  }, [open, messages, lastSeenAt]);

  const handleCopySetupSql = async () => {
    try {
      await navigator.clipboard.writeText(COMMUNICATION_MESSAGES_TABLE_SQL);
      setStatus({
        type: "success",
        message: "SQL copiado. Cole no SQL Editor do Supabase e execute.",
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: "Não foi possível copiar o SQL automaticamente.",
      });
    }
  };

  const createMessage = useMutation({
    mutationFn: (payload) => dataClient.entities.CommunicationMessage.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communication-messages"] });
      setStatus({ type: "success", message: "Mensagem enviada com sucesso." });
      setFormData((prev) => ({
        ...prev,
        recipient_scope: "todos",
        recipient_label: "",
        subject: "",
        message: "",
      }));
    },
    onError: (error) => {
      setStatus({
        type: "error",
        message:
          getSupabaseErrorMessage(error) || "Não foi possível enviar a mensagem.",
      });
    },
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    setStatus(null);
    const scope = formData.recipient_scope || "todos";
    const recipientLabel = String(formData.recipient_label || "").trim();
    const subject = String(formData.subject || "").trim();
    const message = String(formData.message || "").trim();
    if (!message) {
      setStatus({ type: "error", message: "Digite uma mensagem antes de enviar." });
      return;
    }
    if (scope === "pessoa" && !recipientLabel) {
      setStatus({
        type: "error",
        message: "Selecione a pessoa destinatária.",
      });
      return;
    }

    createMessage.mutate({
      sender_name:
        currentUser?.full_name || currentUser?.name || currentUser?.email || "Usuário",
      sender_email: currentUser?.email || null,
      recipient_scope: scope === "pessoa" ? "pessoa" : "todos",
      recipient_label: scope === "todos" ? "Todos" : recipientLabel,
      subject: subject || null,
      message,
    });
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40">
        <Button
          type="button"
          size="icon"
          className="h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-700 shadow-xl"
          onClick={() => setOpen((prev) => !prev)}
        >
          {unreadCount > 0 ? (
            <BellRing className="h-6 w-6" />
          ) : (
            <MessageSquare className="h-6 w-6" />
          )}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </div>

      {open && (
        <Card className="fixed bottom-24 right-4 left-4 sm:left-auto sm:right-6 z-40 w-auto sm:w-[420px] h-[70vh] max-h-[620px] shadow-2xl border-slate-200">
          <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-600" />
                Chat interno
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                Mensagens para todos ou para uma pessoa específica.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>

          <CardContent className="p-0 h-[calc(100%-72px)] flex flex-col">
            {messagesQuery.isError && (
              <div className="px-4 pt-3">
                <Alert className="border-red-200 bg-red-50">
                  <div className="space-y-2">
                    <AlertDescription className="text-red-800 text-xs">
                      {loadErrorMessage}
                    </AlertDescription>
                    {missingTable && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={handleCopySetupSql}
                      >
                        Copiar SQL de criação
                      </Button>
                    )}
                  </div>
                </Alert>
              </div>
            )}

            <ScrollArea className="flex-1 px-4 py-3">
              {messagesQuery.isLoading ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Carregando mensagens...
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                  Nenhuma mensagem no canal.
                </div>
              ) : (
                <div className="space-y-2">
                  {[...messages].reverse().map((message) => {
                    const currentUserEmail = String(currentUser?.email || "")
                      .trim()
                      .toLowerCase();
                    const senderEmail = String(message.sender_email || "")
                      .trim()
                      .toLowerCase();
                    const ownMessage =
                      Boolean(currentUserEmail) && currentUserEmail === senderEmail;
                    return (
                      <div
                        key={message.id}
                        className={`rounded-lg border p-2.5 text-sm ${
                          ownMessage
                            ? "bg-blue-50 border-blue-200"
                            : "bg-white border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="font-semibold text-slate-800 truncate">
                            {message.sender_name || message.sender_email || "Usuário"}
                          </p>
                          <span className="text-[11px] text-slate-500 whitespace-nowrap">
                            {formatDateSafe(message.created_at, "dd/MM HH:mm")}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">
                            {resolveScopeLabel(message.recipient_scope)}
                          </Badge>
                          <span className="text-[11px] text-slate-600">
                            {message.recipient_label || "Todos"}
                          </span>
                        </div>
                        {message.subject && (
                          <p className="text-xs font-medium text-slate-700 mb-1">
                            Assunto: {message.subject}
                          </p>
                        )}
                        <p className="text-slate-700 whitespace-pre-wrap break-words">
                          {message.message}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            <form onSubmit={handleSubmit} className="border-t px-3 py-2.5 space-y-2.5 bg-slate-50/70">
              <div className="flex items-center gap-2">
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
                  <SelectTrigger className="h-8 text-xs">
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

                {formData.recipient_scope === "todos" ? (
                  <Input className="h-8 text-xs" value="Todos" readOnly />
                ) : hasRecipientOptions ? (
                  <Select
                    value={formData.recipient_label}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, recipient_label: value }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
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
                    className="h-8 text-xs"
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
              {formData.recipient_scope === "pessoa" &&
                managedUsersQuery.isError &&
                !messagesQuery.isError && (
                  <p className="text-[11px] text-amber-700">
                    Não foi possível listar todas as contas agora. Você pode informar
                    o e-mail manualmente.
                  </p>
                )}

              <Input
                className="h-8 text-xs"
                value={formData.subject}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, subject: event.target.value }))
                }
                placeholder="Assunto (opcional)"
              />

              <div className="flex gap-2 items-end">
                <Textarea
                  className="min-h-[68px] text-sm"
                  value={formData.message}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, message: event.target.value }))
                  }
                  placeholder="Digite a mensagem..."
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-9 w-9 shrink-0 bg-blue-600 hover:bg-blue-700"
                  disabled={createMessage.isPending || messagesQuery.isError}
                >
                  {createMessage.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {status && (
                <Alert
                  className={
                    status.type === "error"
                      ? "border-red-200 bg-red-50 py-2"
                      : "border-green-200 bg-green-50 py-2"
                  }
                >
                  <div className="flex items-center gap-2">
                    <Bell className="h-3.5 w-3.5" />
                    <AlertDescription
                      className={
                        status.type === "error"
                          ? "text-red-800 text-xs"
                          : "text-green-800 text-xs"
                      }
                    >
                      {status.message}
                    </AlertDescription>
                  </div>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>
      )}
    </>
  );
}
