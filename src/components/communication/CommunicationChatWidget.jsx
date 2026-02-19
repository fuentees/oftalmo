import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  CheckCircle2,
  Loader2,
  MessageSquare,
  MoreVertical,
  Pencil,
  Send,
  Trash2,
  X,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const RECIPIENT_SCOPE_OPTIONS = [
  { value: "todos", label: "Todos" },
  { value: "pessoa", label: "Pessoa específica" },
];

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const buildAccountLabel = (name, email) =>
  name && email ? `${name} (${email})` : name || email || "Usuário";

const parseSeenBy = (value) => {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(normalizeEmail).filter(Boolean)));
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return Array.from(new Set(parsed.map(normalizeEmail).filter(Boolean)));
      }
    } catch (error) {
      // mantém fallback vazio quando não for JSON válido
    }
  }
  return [];
};

const dedupeEmails = (values) =>
  Array.from(new Set((values || []).map(normalizeEmail).filter(Boolean)));

const isArchivedMessage = (message) => Boolean(message?.is_archived);

const getChatActionErrorMessage = (error) => {
  const message =
    getSupabaseErrorMessage(error) || "Não foi possível concluir esta ação.";
  const lowered = message.toLowerCase();
  if (
    lowered.includes("column") &&
    lowered.includes("communication_messages") &&
    lowered.includes("does not exist")
  ) {
    return "Alguns recursos do chat ainda não estão disponíveis neste banco.";
  }
  return message;
};

export default function CommunicationChatWidget({ currentUser }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [actionLoadingKey, setActionLoadingKey] = useState("");
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingSubject, setEditingSubject] = useState("");
  const [editingBody, setEditingBody] = useState("");
  const [formData, setFormData] = useState({
    recipient_scope: "todos",
    recipient_label: "",
    subject: "",
    message: "",
  });

  const messagesQuery = useQuery({
    queryKey: ["communication-messages"],
    queryFn: () => dataClient.entities.CommunicationMessage.list("-created_at", 300),
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
      ? "Canal de comunicação indisponível no momento."
      : getSupabaseErrorMessage(messagesQuery.error) ||
        "Não foi possível carregar mensagens."
    : "";

  const currentUserEmail = normalizeEmail(currentUser?.email);
  const isAdmin = currentUser?.role === "admin";

  const orderedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const archivedCount = useMemo(
    () => messages.filter((message) => isArchivedMessage(message)).length,
    [messages]
  );
  const visibleMessages = useMemo(() => {
    if (showArchived) return orderedMessages;
    return orderedMessages.filter((message) => !isArchivedMessage(message));
  }, [orderedMessages, showArchived]);

  const unreadCount = useMemo(() => {
    if (!currentUserEmail) return 0;
    return messages.filter((message) => {
      if (isArchivedMessage(message)) return false;
      const senderEmail = normalizeEmail(message.sender_email);
      if (!senderEmail || senderEmail === currentUserEmail) return false;
      const seenBy = parseSeenBy(message.seen_by);
      return !seenBy.includes(currentUserEmail);
    }).length;
  }, [messages, currentUserEmail]);

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
  }, [
    managedUsers,
    messages,
    currentUser?.email,
    currentUser?.full_name,
    currentUser?.name,
  ]);
  const hasRecipientOptions = recipientAccounts.length > 0;

  useEffect(() => {
    if (!open || !currentUserEmail || messages.length === 0) return;
    if (messagesQuery.isLoading || messagesQuery.isError) return;

    const pendingSeen = messages.filter((message) => {
      if (isArchivedMessage(message)) return false;
      const senderEmail = normalizeEmail(message.sender_email);
      if (!senderEmail || senderEmail === currentUserEmail) return false;
      const seenBy = parseSeenBy(message.seen_by);
      return !seenBy.includes(currentUserEmail);
    });
    if (pendingSeen.length === 0) return;

    let cancelled = false;
    const markAsSeen = async () => {
      try {
        await Promise.all(
          pendingSeen.slice(0, 40).map(async (message) => {
            const seenBy = dedupeEmails([
              ...parseSeenBy(message.seen_by),
              currentUserEmail,
            ]);
            await dataClient.entities.CommunicationMessage.update(message.id, {
              seen_by: seenBy,
              seen_at: new Date().toISOString(),
            });
          })
        );
        if (!cancelled) {
          queryClient.invalidateQueries({ queryKey: ["communication-messages"] });
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({
            type: "error",
            message: getChatActionErrorMessage(error),
          });
        }
      }
    };

    markAsSeen();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    messages,
    messagesQuery.isLoading,
    messagesQuery.isError,
    currentUserEmail,
    queryClient,
  ]);

  const runMessageAction = async (loadingKey, action) => {
    setStatus(null);
    setActionLoadingKey(loadingKey);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["communication-messages"] });
    } catch (error) {
      setStatus({
        type: "error",
        message: getChatActionErrorMessage(error),
      });
    } finally {
      setActionLoadingKey("");
    }
  };

  const canManageMessage = (message) =>
    isAdmin || normalizeEmail(message?.sender_email) === currentUserEmail;

  const startEditMessage = (message) => {
    setEditingMessageId(String(message?.id || ""));
    setEditingSubject(String(message?.subject || ""));
    setEditingBody(String(message?.message || ""));
  };

  const cancelEditMessage = () => {
    setEditingMessageId("");
    setEditingSubject("");
    setEditingBody("");
  };

  const saveEditMessage = async (message) => {
    const nextMessage = String(editingBody || "").trim();
    if (!nextMessage) {
      setStatus({ type: "error", message: "A mensagem não pode ficar vazia." });
      return;
    }

    await runMessageAction(`edit:${message.id}`, async () => {
      await dataClient.entities.CommunicationMessage.update(message.id, {
        subject: String(editingSubject || "").trim() || null,
        message: nextMessage,
        edited_at: new Date().toISOString(),
      });
      cancelEditMessage();
      setStatus({ type: "success", message: "Mensagem atualizada." });
    });
  };

  const deleteMessage = async (message) => {
    if (!window.confirm("Deseja excluir esta mensagem?")) return;
    await runMessageAction(`delete:${message.id}`, async () => {
      await dataClient.entities.CommunicationMessage.delete(message.id);
      if (editingMessageId === message.id) {
        cancelEditMessage();
      }
      setStatus({ type: "success", message: "Mensagem excluída." });
    });
  };

  const toggleArchiveMessage = async (message) => {
    const nextArchived = !isArchivedMessage(message);
    await runMessageAction(`archive:${message.id}`, async () => {
      await dataClient.entities.CommunicationMessage.update(message.id, {
        is_archived: nextArchived,
        archived_at: nextArchived ? new Date().toISOString() : null,
        archived_by: nextArchived ? currentUserEmail || null : null,
      });
      setStatus({
        type: "success",
        message: nextArchived ? "Mensagem arquivada." : "Mensagem desarquivada.",
      });
    });
  };

  const toggleConfirmedMessage = async (message) => {
    const nextConfirmed = !Boolean(message?.confirmed);
    await runMessageAction(`confirm:${message.id}`, async () => {
      await dataClient.entities.CommunicationMessage.update(message.id, {
        confirmed: nextConfirmed,
        confirmed_at: nextConfirmed ? new Date().toISOString() : null,
        confirmed_by: nextConfirmed ? currentUserEmail || null : null,
      });
      setStatus({
        type: "success",
        message: nextConfirmed
          ? "Mensagem marcada como confirmada."
          : "Confirmação removida.",
      });
    });
  };

  const createMessage = useMutation({
    mutationFn: (payload) => dataClient.entities.CommunicationMessage.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communication-messages"] });
      setStatus({ type: "success", message: "Mensagem enviada com sucesso." });
      setFormData({
        recipient_scope: "todos",
        recipient_label: "",
        subject: "",
        message: "",
      });
    },
    onError: (error) => {
      setStatus({
        type: "error",
        message: getChatActionErrorMessage(error),
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
        <Card className="fixed bottom-24 right-4 left-4 sm:left-auto sm:right-6 z-40 w-auto sm:w-[390px] h-[66vh] max-h-[620px] shadow-2xl border-slate-200">
          <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-600" />
                Chat interno
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                Nome, data, assunto e mensagem.
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
                  <AlertDescription className="text-red-800 text-xs">
                    {loadErrorMessage}
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <ScrollArea className="flex-1 px-4 py-3">
              {messagesQuery.isLoading ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Carregando mensagens...
                </div>
              ) : visibleMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                  Nenhuma mensagem no canal.
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleMessages.map((message) => {
                    const senderEmail = normalizeEmail(message.sender_email);
                    const senderName =
                      String(message.sender_name || "").trim() ||
                      String(message.sender_email || "").trim() ||
                      "Usuário";
                    const ownMessage =
                      Boolean(currentUserEmail) && currentUserEmail === senderEmail;
                    const seenBy = parseSeenBy(message.seen_by);
                    const seenByOthers = seenBy.some((email) => email !== senderEmail);
                    const seenByCurrent = seenBy.includes(currentUserEmail);
                    const confirmed = Boolean(message.confirmed);
                    const archived = isArchivedMessage(message);
                    const isEditing = editingMessageId === message.id;
                    const canManage = canManageMessage(message);
                    const isLoadingThisMessage = actionLoadingKey.endsWith(
                      `:${message.id}`
                    );
                    const deliveryIndicator = ownMessage ? (
                      seenByOthers ? (
                        <CheckCheck className="h-3.5 w-3.5 text-blue-600" />
                      ) : (
                        <Check className="h-3.5 w-3.5 text-slate-500" />
                      )
                    ) : seenByCurrent ? (
                      <CheckCheck className="h-3.5 w-3.5 text-slate-500" />
                    ) : (
                      <span className="text-[10px] text-slate-500">não visto</span>
                    );

                    return (
                      <div
                        key={message.id}
                        className={`rounded-lg border p-2 text-sm ${
                          ownMessage
                            ? "bg-blue-50 border-blue-200"
                            : "bg-white border-slate-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="font-semibold text-slate-800 text-xs truncate text-right flex-1">
                            {senderName}
                          </p>
                          {!isEditing && canManage && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 shrink-0"
                                  disabled={isLoadingThisMessage}
                                >
                                  {isLoadingThisMessage ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => startEditMessage(message)}>
                                  <Pencil className="h-3.5 w-3.5 mr-2" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => toggleConfirmedMessage(message)}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                                  {confirmed ? "Remover confirmação" : "Confirmar"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => toggleArchiveMessage(message)}
                                >
                                  {archived ? (
                                    <ArchiveRestore className="h-3.5 w-3.5 mr-2" />
                                  ) : (
                                    <Archive className="h-3.5 w-3.5 mr-2" />
                                  )}
                                  {archived ? "Desarquivar" : "Arquivar"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => deleteMessage(message)}
                                  className="text-red-600 focus:text-red-700"
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                                  Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="space-y-2">
                            <Input
                              value={editingSubject}
                              onChange={(event) => setEditingSubject(event.target.value)}
                              placeholder="Assunto (opcional)"
                              className="h-8 text-xs"
                            />
                            <Textarea
                              value={editingBody}
                              onChange={(event) => setEditingBody(event.target.value)}
                              className="min-h-[72px] text-sm"
                            />
                            <div className="flex justify-end gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={cancelEditMessage}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => saveEditMessage(message)}
                                disabled={actionLoadingKey === `edit:${message.id}`}
                              >
                                {actionLoadingKey === `edit:${message.id}` ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  "Salvar"
                                )}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs font-medium text-slate-700 mb-1">
                              Assunto: {String(message.subject || "").trim() || "-"}
                            </p>
                            <p className="text-slate-700 whitespace-pre-wrap break-words">
                              {message.message}
                            </p>
                            {message.edited_at && (
                              <p className="text-[11px] text-slate-500 mt-1">
                                mensagem editada
                              </p>
                            )}
                            <div className="flex items-center justify-end gap-1.5 mt-1 text-[11px] text-slate-500">
                              {deliveryIndicator}
                              {confirmed && (
                                <CheckCircle2
                                  className="h-3.5 w-3.5 text-emerald-600"
                                  title="Confirmado"
                                />
                              )}
                              <span>
                                {formatDateSafe(message.created_at, "dd/MM HH:mm") || "-"}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            <form
              onSubmit={handleSubmit}
              className="border-t px-3 py-2.5 space-y-2.5 bg-slate-50/70"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-600">
                  {showArchived
                    ? "Exibindo mensagens arquivadas"
                    : "Exibindo mensagens ativas"}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => setShowArchived((prev) => !prev)}
                >
                  {showArchived
                    ? "Ocultar arquivadas"
                    : `Arquivadas (${archivedCount})`}
                </Button>
              </div>

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
