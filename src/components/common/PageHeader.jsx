import React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function PageHeader({
  title,
  subtitle,
  action,
  actionLabel = "Adicionar",
  actionIcon: ActionIcon = Plus,
  onActionClick,
}) {
  const actionHandler = action || onActionClick;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actionHandler && (
        <Button onClick={actionHandler} className="bg-blue-600 hover:bg-blue-700">
          <ActionIcon className="h-4 w-4 mr-2" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}