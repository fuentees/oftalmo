import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useNotifications } from "@/hooks/useNotifications";
import { Bell, Package, GraduationCap, Clock, AlertTriangle, ClipboardList, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const ICON_MAP = {
  stock: Package,
  training: GraduationCap,
  enrollment: ClipboardList,
  validity: Clock,
};

const PRIORITY_COLORS = {
  high: "text-red-600 bg-red-50 border-red-100",
  medium: "text-amber-600 bg-amber-50 border-amber-100",
  low: "text-slate-600 bg-slate-50 border-slate-100",
};

const PRIORITY_BADGE = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-700",
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("dismissed-notifications") || "[]");
    } catch {
      return [];
    }
  });
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const navigate = useNavigate();
  const { notifications } = useNotifications();

  const visible = notifications.filter((n) => !dismissed.includes(n.id));
  const count = visible.length;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        open &&
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const dismiss = (id, e) => {
    e.stopPropagation();
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      localStorage.setItem("dismissed-notifications", JSON.stringify(next));
    } catch {}
  };

  const dismissAll = () => {
    const next = notifications.map((n) => n.id);
    setDismissed(next);
    try {
      localStorage.setItem("dismissed-notifications", JSON.stringify(next));
    } catch {}
    setOpen(false);
  };

  const handleNotificationClick = (notification) => {
    if (notification.link) {
      const url = notification.trainingId
        ? createPageUrl(`TrainingWorkspace?id=${notification.trainingId}`)
        : createPageUrl(notification.link);
      navigate(url);
    }
    setOpen(false);
  };

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        className="h-9 w-9 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 relative"
        title="Notificações"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-sm">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-11 z-50 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-slate-600 dark:text-slate-300" />
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notificações</span>
              {count > 0 && (
                <Badge className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0 h-4">{count}</Badge>
              )}
            </div>
            {count > 0 && (
              <button
                onClick={dismissAll}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                Limpar tudo
              </button>
            )}
          </div>

          {/* Body */}
          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-2">
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Bell className="h-5 w-5 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Tudo em ordem</p>
              <p className="text-xs text-slate-400">Nenhuma notificação pendente.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-96">
              <div className="divide-y divide-slate-50 dark:divide-slate-800">
                {visible.map((n) => {
                  const Icon = ICON_MAP[n.type] || AlertTriangle;
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`group flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors`}
                    >
                      <div className={`shrink-0 mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center border ${PRIORITY_COLORS[n.priority]}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{n.title}</p>
                          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0 rounded-full ${PRIORITY_BADGE[n.priority]}`}>
                            {n.priority === "high" ? "Urgente" : n.priority === "medium" ? "Atenção" : "Info"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{n.message}</p>
                      </div>
                      <button
                        onClick={(e) => dismiss(n.id, e)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-600 mt-0.5"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
