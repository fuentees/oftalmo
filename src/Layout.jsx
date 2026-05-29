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
  ChevronLeft,
  ChevronRight,
  Settings,
  User,
  Calendar,
  FileText,
  Search,
  Pencil,
  Loader2,
  ClipboardList,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import GlobalSearch from "@/components/common/GlobalSearch";
import CommunicationChatWidget from "@/components/communication/CommunicationChatWidget";

export default function Layout({ children, currentPageName }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    try {
      return localStorage.getItem("sidebar-expanded") !== "false";
    } catch {
      return true;
    }
  });
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

  const toggleDesktopSidebar = () => {
    setSidebarExpanded((v) => {
      const next = !v;
      try { localStorage.setItem("sidebar-expanded", String(next)); } catch {}
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleLogout = () => logout();

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
      setProfileStatus({ type: "error", message: "A nova senha deve ter pelo menos 6 caracteres." });
      return;
    }
    if (password && password !== confirmPassword) {
      setProfileStatus({ type: "error", message: "A confirmação da senha não confere." });
      return;
    }

    setIsSavingProfile(true);
    try {
      const result = await updateProfile({ fullName, email, password });
      if (!result?.updated) {
        setProfileStatus({ type: "info", message: "Nenhuma alteração foi detectada no perfil." });
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
      setProfileStatus({ type: "error", message: error?.message || "Não foi possível atualizar o perfil." });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const navigation = [
    { name: "Dashboard", page: "Dashboard", icon: LayoutDashboard },
    { name: "Agenda", page: "Schedule", icon: Calendar },
    { name: "Estoque", page: "Stock", icon: Package },
    { name: "Solicitações", page: "MaterialRequests", icon: ClipboardList },
    { name: "Treinamentos", page: "Trainings", icon: GraduationCap },
    { name: "Profissionais", page: "Professionals", icon: Users },
    { name: "Participantes", page: "Participants", icon: Users },
    { name: "Relatórios", page: "Reports", icon: FileText },
    { name: "Logs", page: "AuditLogs", icon: FileText, adminOnly: true },
    { name: "Configurações", page: "Settings", icon: Settings, adminOnly: true },
  ].filter((item) => !item.adminOnly || isAdmin);

  const isActive = (page) => currentPageName === page;
  const pageTitle = navigation.find((n) => n.page === currentPageName)?.name || currentPageName;

  const isMacPlatform =
    typeof window !== "undefined" &&
    /(Mac|iPhone|iPad|iPod)/i.test(window.navigator.platform || "");
  const shortcutModifier = isMacPlatform ? "⌘" : "Ctrl";

  const sidebarWidth = sidebarExpanded ? "w-56" : "w-16";
  const contentPadding = sidebarExpanded ? "lg:pl-56" : "lg:pl-16";

  const LogoIcon = () => (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-white shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
    </svg>
  );

  return (
    <TooltipProvider delayDuration={250}>
      <div className="min-h-screen bg-slate-50">
        {/* Mobile overlay */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* Mobile Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out lg:hidden ${
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-16 items-center justify-between px-5 shrink-0" style={{ background: "hsl(var(--primary))" }}>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                <LogoIcon />
              </div>
              <span className="text-sm font-bold text-white leading-tight">Centro de Oftalmologia</span>
            </div>
            <button onClick={() => setMobileSidebarOpen(false)} className="text-white/70 hover:text-white transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 mt-3 px-3 space-y-0.5 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.page);
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  onClick={() => setMobileSidebarOpen(false)}
                  style={active ? { background: "hsl(var(--primary))" } : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    active ? "text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-slate-400"}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="shrink-0 p-4 border-t border-slate-100">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
              <span>Sistema ativo · v2.0</span>
            </div>
          </div>
        </aside>

        {/* Botão toggle — fora do aside para não ser clipado pelo overflow-hidden */}
        <button
          onClick={toggleDesktopSidebar}
          title={sidebarExpanded ? "Recolher menu" : "Expandir menu"}
          className="hidden lg:flex fixed top-1/2 -translate-y-1/2 z-[60] w-6 h-6 rounded-full bg-white border border-slate-200 shadow-md items-center justify-center text-slate-400 hover:text-slate-700 hover:shadow-lg transition-all duration-300 ease-in-out"
          style={{ left: sidebarExpanded ? "calc(14rem - 12px)" : "calc(4rem - 12px)" }}
        >
          {sidebarExpanded ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>

        {/* Desktop Sidebar */}
        <aside
          className={`hidden lg:flex fixed inset-y-0 left-0 z-50 flex-col bg-white border-r border-slate-200/80 transition-all duration-300 ease-in-out overflow-hidden ${sidebarWidth}`}
        >
          {/* Logo */}
          <div
            className="flex h-16 items-center shrink-0 px-3"
            style={{ background: "hsl(var(--primary))" }}
          >
            <div className={`flex items-center gap-3 min-w-0 ${sidebarExpanded ? "w-full" : "justify-center w-full"}`}>
              <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0 ring-1 ring-white/20">
                <LogoIcon />
              </div>
              {sidebarExpanded && (
                <div className="min-w-0 overflow-hidden">
                  <p className="text-sm font-bold text-white leading-tight truncate">Centro de Oftalmologia</p>
                  <p className="text-[11px] text-blue-100/80 leading-tight">Sanitária</p>
                </div>
              )}
            </div>
          </div>

          {/* Nav items */}
          <nav className="flex-1 flex flex-col gap-0.5 py-4 px-2 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.page);

              if (!sidebarExpanded) {
                return (
                  <Tooltip key={item.page}>
                    <TooltipTrigger asChild>
                      <Link
                        to={createPageUrl(item.page)}
                        style={active ? { background: "hsl(var(--primary))" } : undefined}
                        className={`flex items-center justify-center w-10 h-10 mx-auto rounded-xl transition-all duration-150 ${
                          active ? "text-white shadow-md" : "text-slate-400 hover:bg-slate-100 hover:text-slate-800"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={12} className="font-medium">
                      {item.name}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  style={active ? { background: "hsl(var(--primary))" } : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                    active ? "text-white shadow-md" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-slate-400"}`} />
                  <span className="truncate">{item.name}</span>
                  {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60 shrink-0" />}
                </Link>
              );
            })}
          </nav>

          {/* Bottom: status */}
          <div className={`shrink-0 pb-4 border-t border-slate-100 pt-3 px-3 ${sidebarExpanded ? "" : "flex justify-center"}`}>
            {sidebarExpanded ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                <span>Sistema ativo · v2.0</span>
              </div>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-8 h-5 flex items-center justify-center cursor-default">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={12}>
                  <span className="font-medium">Sistema ativo</span>
                  <span className="text-white/60 ml-1.5">v2.0</span>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </aside>

        {/* Main */}
        <div className={`transition-all duration-300 ease-in-out ${contentPadding}`}>
          {/* Header */}
          <header className="sticky top-0 z-30 h-16 bg-white/90 backdrop-blur-xl border-b border-slate-200/80">
            <div className="flex h-full items-center gap-4 px-5 lg:px-8">
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="lg:hidden p-2 -ml-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
              >
                <Menu className="h-5 w-5" />
              </button>

              <h1 className="text-base font-semibold text-slate-900 hidden sm:block shrink-0">
                {pageTitle}
              </h1>

              <div className="flex-1 flex justify-center">
                <button
                  onClick={() => setSearchOpen(true)}
                  className="hidden md:flex items-center gap-3 px-4 py-2 text-sm text-slate-400 bg-slate-100 border border-transparent rounded-xl hover:bg-slate-200/80 transition-all max-w-sm w-full"
                >
                  <Search className="h-4 w-4 shrink-0" />
                  <span>Buscar em tudo...</span>
                  <div className="ml-auto flex items-center gap-1 text-[11px] text-slate-400 whitespace-nowrap shrink-0">
                    <kbd className="px-1.5 py-0.5 bg-white rounded border border-slate-300 font-semibold text-slate-500 text-[10px]">
                      {shortcutModifier}
                    </kbd>
                    <kbd className="px-1.5 py-0.5 bg-white rounded border border-slate-300 font-semibold text-slate-500 text-[10px]">K</kbd>
                  </div>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchOpen(true)}
                  className="md:hidden hover:bg-slate-100 rounded-xl h-9 w-9"
                >
                  <Search className="h-4 w-4" />
                </Button>

                {user && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="flex items-center gap-2.5 hover:bg-slate-100 rounded-xl px-2.5 py-2 h-auto"
                      >
                        <div
                          className="h-8 w-8 rounded-lg flex items-center justify-center shadow-sm shrink-0"
                          style={{ background: "hsl(var(--primary))" }}
                        >
                          <User className="h-4 w-4 text-white" />
                        </div>
                        <div className="hidden sm:block text-left">
                          <p className="text-sm font-semibold text-slate-900 leading-tight">
                            {user.full_name || user.email}
                          </p>
                          <p className="text-xs text-slate-400 capitalize leading-tight">{user.role}</p>
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52 p-2">
                      <div className="px-2 py-2.5 bg-slate-50 rounded-lg mb-2">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {user.full_name || user.email}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{user.email}</p>
                        <span className="inline-flex items-center mt-1.5 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-xs font-semibold capitalize">
                          {user.role}
                        </span>
                      </div>
                      <DropdownMenuItem
                        onClick={openProfileDialog}
                        className="font-medium cursor-pointer rounded-lg"
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar perfil
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={handleLogout}
                        className="text-red-600 font-medium cursor-pointer rounded-lg"
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Sair do sistema
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="p-5 lg:p-8 min-h-screen">
            <div className="max-w-[1600px] mx-auto">{children}</div>
          </main>
        </div>

        {/* Profile Dialog */}
        <Dialog
          open={profileDialogOpen}
          onOpenChange={(open) => (open ? setProfileDialogOpen(true) : closeProfileDialog())}
        >
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
                    setProfileForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
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
                <Button type="submit" disabled={isSavingProfile}>
                  {isSavingProfile && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <CommunicationChatWidget currentUser={user} />
        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </TooltipProvider>
  );
}
