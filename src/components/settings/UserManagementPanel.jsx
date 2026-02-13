import React from "react";
import { useAuth } from "@/lib/AuthContext";
import { dataClient } from "@/api/dataClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  RefreshCcw,
  ShieldCheck,
  ShieldOff,
  UserPlus,
  UserCheck,
  UserX,
} from "lucide-react";

const normalizeText = (value) => String(value ?? "").trim();
const normalizeEmail = (value) => normalizeText(value).toLowerCase();

const formatDateTime = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
};

const getReadableErrorMessage = (error, fallback) => {
  const message = String(error?.message || "").trim();
  return message || fallback;
};

export default function UserManagementPanel() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = React.useState([]);
  const [usersLoading, setUsersLoading] = React.useState(false);
  const [status, setStatus] = React.useState(null);
  const [actionLoadingKey, setActionLoadingKey] = React.useState("");
  const [createMode, setCreateMode] = React.useState("invite");
  const [formData, setFormData] = React.useState({
    full_name: "",
    email: "",
    password: "",
    role: "usuario",
    email_confirm: true,
  });

  const loadUsers = React.useCallback(async () => {
    setUsersLoading(true);
    try {
      const result = await dataClient.integrations.Core.ListManagedUsers();
      const list = Array.isArray(result?.users) ? result.users : [];
      setUsers(list);
    } catch (error) {
      setStatus({
        type: "error",
        message: getReadableErrorMessage(error, "Não foi possível carregar os usuários."),
      });
    } finally {
      setUsersLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const sortedUsers = React.useMemo(() => {
    return [...users].sort((a, b) => {
      const roleA = String(a?.role || "");
      const roleB = String(b?.role || "");
      if (roleA === "admin" && roleB !== "admin") return -1;
      if (roleB === "admin" && roleA !== "admin") return 1;
      return String(a?.email || "").localeCompare(String(b?.email || ""), "pt-BR");
    });
  }, [users]);

  const resetForm = () => {
    setFormData({
      full_name: "",
      email: "",
      password: "",
      role: "usuario",
      email_confirm: true,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus(null);

    const fullName = normalizeText(formData.full_name);
    const email = normalizeEmail(formData.email);
    const password = normalizeText(formData.password);
    const role = formData.role === "admin" ? "admin" : "usuario";

    if (!email) {
      setStatus({ type: "error", message: "Informe um e-mail válido." });
      return;
    }

    if (createMode === "create" && password.length < 6) {
      setStatus({
        type: "error",
        message: "A senha deve ter pelo menos 6 caracteres para criação direta.",
      });
      return;
    }

    setActionLoadingKey("create");
    try {
      if (createMode === "invite") {
        await dataClient.integrations.Core.InviteManagedUser({
          email,
          full_name: fullName,
          role,
        });
        setStatus({
          type: "success",
          message:
            "Convite enviado com sucesso. O usuário deve aceitar pelo e-mail.",
        });
      } else {
        await dataClient.integrations.Core.CreateManagedUser({
          email,
          password,
          full_name: fullName,
          role,
          email_confirm: Boolean(formData.email_confirm),
        });
        setStatus({
          type: "success",
          message: "Usuário criado com sucesso.",
        });
      }

      resetForm();
      await loadUsers();
    } catch (error) {
      setStatus({
        type: "error",
        message: getReadableErrorMessage(error, "Não foi possível salvar o usuário."),
      });
    } finally {
      setActionLoadingKey("");
    }
  };

  const handleToggleRole = async (managedUser) => {
    if (!managedUser?.id) return;
    const isSelf =
      normalizeEmail(managedUser.email) === normalizeEmail(currentUser?.email);
    const nextRole = managedUser.role === "admin" ? "usuario" : "admin";
    if (isSelf && nextRole !== "admin") {
      setStatus({
        type: "error",
        message: "Você não pode remover seu próprio perfil de admin.",
      });
      return;
    }

    setStatus(null);
    const loadingKey = `role:${managedUser.id}`;
    setActionLoadingKey(loadingKey);
    try {
      await dataClient.integrations.Core.SetManagedUserRole({
        user_id: managedUser.id,
        role: nextRole,
      });
      setStatus({
        type: "success",
        message:
          nextRole === "admin"
            ? "Usuário promovido para admin."
            : "Usuário rebaixado para usuário comum.",
      });
      await loadUsers();
    } catch (error) {
      setStatus({
        type: "error",
        message: getReadableErrorMessage(error, "Não foi possível alterar o perfil."),
      });
    } finally {
      setActionLoadingKey("");
    }
  };

  const handleToggleActive = async (managedUser) => {
    if (!managedUser?.id) return;
    const isSelf =
      normalizeEmail(managedUser.email) === normalizeEmail(currentUser?.email);
    const nextActive = !Boolean(managedUser.is_active);
    if (isSelf && !nextActive) {
      setStatus({
        type: "error",
        message: "Você não pode desativar sua própria conta.",
      });
      return;
    }

    setStatus(null);
    const loadingKey = `active:${managedUser.id}`;
    setActionLoadingKey(loadingKey);
    try {
      await dataClient.integrations.Core.SetManagedUserActive({
        user_id: managedUser.id,
        active: nextActive,
      });
      setStatus({
        type: "success",
        message: nextActive
          ? "Conta ativada com sucesso."
          : "Conta desativada com sucesso.",
      });
      await loadUsers();
    } catch (error) {
      setStatus({
        type: "error",
        message: getReadableErrorMessage(error, "Não foi possível atualizar o status."),
      });
    } finally {
      setActionLoadingKey("");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Convidar ou criar usuário</CardTitle>
          <CardDescription>
            Você pode enviar convite por e-mail ou criar conta diretamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Modo</Label>
                <Select value={createMode} onValueChange={setCreateMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invite">Convidar por e-mail</SelectItem>
                    <SelectItem value="create">Criar conta direta</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Perfil</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      role: value === "admin" ? "admin" : "usuario",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usuario">Usuário</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="managed-user-full-name">Nome completo</Label>
                <Input
                  id="managed-user-full-name"
                  placeholder="Nome do usuário"
                  value={formData.full_name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, full_name: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="managed-user-email">E-mail</Label>
                <Input
                  id="managed-user-email"
                  type="email"
                  placeholder="usuario@dominio.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                  required
                />
              </div>
            </div>

            {createMode === "create" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="managed-user-password">Senha inicial</Label>
                  <Input
                    id="managed-user-password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, password: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="managed-user-email-confirm"
                    checked={Boolean(formData.email_confirm)}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        email_confirm: Boolean(checked),
                      }))
                    }
                  />
                  <Label htmlFor="managed-user-email-confirm">
                    Confirmar e-mail automaticamente
                  </Label>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={actionLoadingKey === "create"}>
                {actionLoadingKey === "create" ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    {createMode === "invite" ? "Enviar convite" : "Criar usuário"}
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                Limpar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Usuários cadastrados</CardTitle>
            <CardDescription>
              Gerencie perfil e status de acesso dos usuários do sistema.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={loadUsers}
            disabled={usersLoading}
          >
            {usersLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {status && (
            <Alert
              className={
                status.type === "error"
                  ? "border-red-200 bg-red-50"
                  : "border-green-200 bg-green-50"
              }
            >
              <AlertDescription
                className={status.type === "error" ? "text-red-700" : "text-green-700"}
              >
                {status.message}
              </AlertDescription>
            </Alert>
          )}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b">
                  <th className="text-left px-4 py-3 font-semibold">Usuário</th>
                  <th className="text-left px-4 py-3 font-semibold">Perfil</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-left px-4 py-3 font-semibold">Último acesso</th>
                  <th className="text-right px-4 py-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {usersLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      Carregando usuários...
                    </td>
                  </tr>
                ) : sortedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                ) : (
                  sortedUsers.map((managedUser) => {
                    const isSelf =
                      normalizeEmail(managedUser.email) ===
                      normalizeEmail(currentUser?.email);
                    const roleLoadingKey = `role:${managedUser.id}`;
                    const activeLoadingKey = `active:${managedUser.id}`;
                    return (
                      <tr key={managedUser.id} className="border-b last:border-b-0">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">
                            {managedUser.full_name || managedUser.email}
                          </div>
                          <div className="text-xs text-slate-500">{managedUser.email}</div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            Criado em: {formatDateTime(managedUser.created_at)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            className={
                              managedUser.role === "admin"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-slate-100 text-slate-700"
                            }
                          >
                            {managedUser.role === "admin" ? "Admin" : "Usuário"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            className={
                              managedUser.is_active
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }
                          >
                            {managedUser.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDateTime(managedUser.last_sign_in_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleToggleRole(managedUser)}
                              disabled={
                                actionLoadingKey === roleLoadingKey ||
                                (isSelf && managedUser.role === "admin")
                              }
                            >
                              {actionLoadingKey === roleLoadingKey ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : managedUser.role === "admin" ? (
                                <>
                                  <ShieldOff className="h-4 w-4 mr-1" />
                                  Rebaixar
                                </>
                              ) : (
                                <>
                                  <ShieldCheck className="h-4 w-4 mr-1" />
                                  Promover
                                </>
                              )}
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              variant={managedUser.is_active ? "outline" : "default"}
                              onClick={() => handleToggleActive(managedUser)}
                              disabled={
                                actionLoadingKey === activeLoadingKey ||
                                (isSelf && managedUser.is_active)
                              }
                              className={
                                managedUser.is_active
                                  ? "text-red-600 border-red-200 hover:bg-red-50"
                                  : "bg-green-600 hover:bg-green-700"
                              }
                            >
                              {actionLoadingKey === activeLoadingKey ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : managedUser.is_active ? (
                                <>
                                  <UserX className="h-4 w-4 mr-1" />
                                  Desativar
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-4 w-4 mr-1" />
                                  Ativar
                                </>
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
