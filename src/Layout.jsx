import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "./utils";
import { base44 } from "@/api/base44Client";
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
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import GlobalSearch from "@/components/common/GlobalSearch";

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [themeColor, setThemeColor] = useState("blue");
  const navigate = useNavigate();

  useEffect(() => {
    loadUser();
    const savedColor = localStorage.getItem("theme-color") || "blue";
    setThemeColor(savedColor);

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

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (error) {
      console.log("User not logged in");
    }
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  const navigation = [
    { name: "Dashboard", page: "Dashboard", icon: LayoutDashboard },
    { name: "Agenda", page: "Schedule", icon: Calendar },
    { name: "Estoque", page: "Stock", icon: Package },
    { name: "Treinamentos", page: "Trainings", icon: GraduationCap },
    { name: "Profissionais", page: "Professionals", icon: Users },
    { name: "Participantes", page: "Participants", icon: Users },
    { name: "Relatórios", page: "Reports", icon: FileText },
    { name: "Logs", page: "AuditLogs", icon: FileText },
    { name: "Campos de Inscrição", page: "EnrollmentFieldsManager", icon: Settings },
    { name: "Configurações", page: "Settings", icon: Settings },
  ];

  const isActive = (page) => currentPageName === page;

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
                <kbd className="ml-auto px-2.5 py-1 text-xs bg-white rounded-lg border border-slate-200 shadow-sm font-semibold text-slate-600">⌘K</kbd>
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
                      <p className="text-sm font-semibold text-slate-900">{user.full_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-100 text-blue-700 text-xs font-semibold capitalize">
                          {user.role}
                        </span>
                      </div>
                    </div>
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

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}