import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import { useAuth } from "@/lib/AuthContext";
import {
  LayoutDashboard,
  Package,
  GraduationCap,
  Users,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Settings,
  User,
  Calendar,
  FileText,
  MessageSquare,
  Search,
  Pencil,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import GlobalSearch from "@/components/common/GlobalSearch";

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [profileStatus, setProfileStatus] = useState(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const { user, isAdmin, logout, updateProfile } = useAuth();

  useEffect(() => {
    // Global search shortcut
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = () => {
    logout();
  };

  const openProfileDialog = () => {
    setProfileForm({
      fullName: String(user?.full_name || user?.name || "").trim(),
      email: String(user?.email || "").trim(),
      password: "",
      confirmPassword: "",
    });
    setProfileStatus(null);
    setProfileDialogOpen(true);
  };

  const closeProfileDialog = () => {
    setProfileDialogOpen(false);
    setProfileStatus(null);
    setProfileForm((prev) => ({ ...prev, password: "", confirmPassword: "" }));
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setProfileStatus(null);

    const fullName = String(profileForm.fullName || "").trim();
    const email = String(profileForm.email || "").trim().toLowerCase();
    const password = String(profileForm.password || "").trim();
    const confirmPassword = String(profileForm.confirmPassword || "").trim();

    if (!fullName) {
      setProfileStatus({ type: "error", message: "Informe seu nome completo." });
      return;
    }
    if (!email) {
      setProfileStatus({ type: "error", message: "Informe um e-mail válido." });
      return;
    }
    if (password && password.length < 6) {
      setProfileStatus({
        type: "error",
        message: "A nova senha deve ter pelo menos 6 caracteres.",
      });
      return;
    }
    if (password && password !== confirmPassword) {
      setProfileStatus({
        type: "error",
        message: "A confirmação da senha não confere.",
      });
      return;
    }

    setIsSavingProfile(true);
    try {
      const result = await updateProfile({ fullName, email, password });
      if (!result?.updated) {
        setProfileStatus({
          type: "info",
          message: "Nenhuma alteração foi detectada no perfil.",
        });
        return;
      }
      setProfileStatus({
        type: "success",
        message: result.emailChangeRequested
          ? "Perfil atualizado. Se a confirmação de e-mail estiver ativa no Supabase, confirme o novo e-mail na sua caixa de entrada."
          : "Perfil atualizado com sucesso.",
      });
      setProfileForm((prev) => ({ ...prev, password: "", confirmPassword: "" }));
    } catch (error) {
      setProfileStatus({
        type: "error",
        message: error?.message || "Não foi possível atualizar o perfil.",
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const navigation = [
    { name: "Dashboard", page: "Dashboard", icon: LayoutDashboard },
    { name: "Agenda", page: "Schedule", icon: Calendar },
    { name: "Estoque", page: "Stock", icon: Package },
    { name: "Treinamentos", page: "Trainings", icon: GraduationCap },
    { name: "Profissionais", page: "Professionals", icon: Users },
    { name: "Participantes", page: "Participants", icon: Users },
    { name: "Comunicação", page: "Communication", icon: MessageSquare },
    { name: "Relatórios", page: "Reports", icon: FileText },
    { name: "Logs", page: "AuditLogs", icon: FileText, adminOnly: true },
    { name: "Configurações", page: "Settings", icon: Settings, adminOnly: true },
  ].filter((item) => !item.adminOnly || isAdmin);

  const isActive = (page) => currentPageName === page;
  const isMacPlatform =
    typeof window !== "undefined" &&
    /(Mac|iPhone|iPad|iPod)/i.test(window.navigator.platform || "");
  const shortcutModifier = isMacPlatform ? "⌘" : "Ctrl";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 shadow-xl transform transition-all duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-between px-6 border-b border-slate-100 bg-gradient-to-r from-blue-600 to-indigo-700">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-2 ring-white/30 shadow-lg">
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight tracking-tight">
                Centro de Oftalmologia
              </h1>
              <p className="text-xs text-blue-100 font-medium">Sanitária</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-white/70 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <nav className="mt-8 px-4 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.page);
            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                onClick={() => setSidebarOpen(false)}
                className={`group flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  active
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30"
                    : "text-slate-700 hover:bg-slate-100 hover:text-blue-600"
                }`}
              >
                <Icon className={`h-5 w-5 transition-transform group-hover:scale-110 ${active ? "text-white" : "text-slate-500 group-hover:text-blue-600"}`} />
                <span className="font-semibold">{item.name}</span>
                {active && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white shadow-lg"></div>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-slate-100 bg-slate-50/50">
          <div className="text-xs text-slate-500 text-center font-medium">
            <div className="flex items-center justify-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-green-600 font-semibold">Sistema Ativo</span>
            </div>
            <div className="text-slate-400">v1.0 • Centro de Oftalmologia</div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-72">
        {/* Header */}
        <header className="sticky top-0 z-30 h-20 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
          <div className="flex h-full items-center justify-between px-6 lg:px-10">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2.5 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
            >
              <Menu className="h-6 w-6" />
            </button>

            <div className="flex-1 lg:flex items-center justify-center px-4">
              <button
                onClick={() => setSearchOpen(true)}
                className="hidden lg:flex items-center gap-3 px-5 py-3 text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl hover:bg-white hover:border-blue-300 hover:shadow-md transition-all max-w-lg w-full group"
              >
                <Search className="h-4 w-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                <span className="font-medium">Buscar em tudo...</span>
                <div className="ml-auto flex items-center gap-1.5 shrink-0 whitespace-nowrap text-[11px] text-slate-500">
                  <kbd className="px-2 py-1 bg-white rounded-lg border border-slate-200 shadow-sm font-semibold text-slate-600">
                    {shortcutModifier}
                  </kbd>
                  <span className="font-semibold text-slate-400">+</span>
                  <kbd className="px-2 py-1 bg-white rounded-lg border border-slate-200 shadow-sm font-semibold text-slate-600">
                    K
                  </kbd>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchOpen(true)}
                className="lg:hidden hover:bg-slate-100 rounded-xl"
              >
                <Search className="h-5 w-5" />
              </Button>
              {user && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-3 hover:bg-slate-100 rounded-xl px-3 py-2 h-auto">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg ring-2 ring-blue-100">
                        <User className="h-5 w-5 text-white" />
                      </div>
                      <div className="hidden sm:block text-left">
                        <p className="text-sm font-semibold text-slate-900">
                          {user.full_name || user.email}
                        </p>
                        <p className="text-xs text-slate-500 capitalize">{user.role}</p>
                      </div>
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 p-2">
                    <div className="px-3 py-3 bg-slate-50 rounded-lg mb-2">
                      <p className="text-sm font-semibold text-slate-900">{user.full_name || user.email}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-100 text-blue-700 text-xs font-semibold capitalize">
                          {user.role}
                        </span>
                      </div>
                    </div>
                    <DropdownMenuItem
                      onClick={openProfileDialog}
                      className="font-medium cursor-pointer rounded-lg"
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar perfil
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-red-600 font-medium cursor-pointer rounded-lg">
                      <LogOut className="h-4 w-4 mr-2" />
                      Sair do Sistema
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6 lg:p-10 min-h-screen">
          <div className="max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>

      <Dialog open={profileDialogOpen} onOpenChange={(open) => (open ? setProfileDialogOpen(true) : closeProfileDialog())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar perfil</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-full-name">Nome completo</Label>
              <Input
                id="profile-full-name"
                value={profileForm.fullName}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, fullName: e.target.value }))
                }
                placeholder="Seu nome completo"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-email">E-mail</Label>
              <Input
                id="profile-email"
                type="email"
                value={profileForm.email}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="voce@email.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-password">Nova senha (opcional)</Label>
              <Input
                id="profile-password"
                type="password"
                value={profileForm.password}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="Deixe em branco para manter"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-password-confirm">Confirmar nova senha</Label>
              <Input
                id="profile-password-confirm"
                type="password"
                value={profileForm.confirmPassword}
                onChange={(e) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    confirmPassword: e.target.value,
                  }))
                }
                placeholder="Repita a nova senha"
              />
            </div>

            {profileStatus && (
              <Alert
                className={
                  profileStatus.type === "error"
                    ? "border-red-200 bg-red-50"
                    : profileStatus.type === "success"
                      ? "border-green-200 bg-green-50"
                      : "border-blue-200 bg-blue-50"
                }
              >
                <AlertDescription
                  className={
                    profileStatus.type === "error"
                      ? "text-red-700"
                      : profileStatus.type === "success"
                        ? "text-green-700"
                        : "text-blue-700"
                  }
                >
                  {profileStatus.message}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeProfileDialog}
                disabled={isSavingProfile}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700"
                disabled={isSavingProfile}
              >
                {isSavingProfile && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}