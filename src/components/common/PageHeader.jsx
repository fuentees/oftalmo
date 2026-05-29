import React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function PageHeader({
  title,
  subtitle,
  action = null,
  actionLabel = "Adicionar",
  actionIcon: ActionIcon = Plus,
  onActionClick = null,
  actions = null,
}) {
  const actionHandler = action || onActionClick;

  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>

      {(actions || actionHandler) && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actions
            ? actions.map((a, i) =>
                a.secondary ? (
                  <Button key={i} variant="outline" onClick={a.onClick} disabled={a.disabled} className="gap-2">
                    {a.icon && <a.icon className="h-4 w-4" />}
                    {a.label}
                  </Button>
                ) : (
                  <Button
                    key={i}
                    onClick={a.onClick}
                    disabled={a.disabled}
                    className="gap-2 text-white"
                    style={{ background: "hsl(var(--primary))" }}
                  >
                    {a.icon && <a.icon className="h-4 w-4" />}
                    {a.label}
                  </Button>
                )
              )
            : actionHandler && (
                <Button
                  onClick={actionHandler}
                  className="gap-2 text-white"
                  style={{ background: "hsl(var(--primary))" }}
                >
                  <ActionIcon className="h-4 w-4" />
                  {actionLabel}
                </Button>
              )}
        </div>
      )}
    </div>
  );
}
