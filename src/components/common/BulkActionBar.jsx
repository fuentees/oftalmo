import React from "react";
import { X, Trash2, Mail, Download, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Barra de ações em lote que aparece quando há itens selecionados.
 *
 * Props:
 *   selectedCount  — número de itens selecionados
 *   onClearSelection — callback para limpar seleção
 *   actions — array de { label, icon: LucideComponent, onClick, variant? }
 */
export default function BulkActionBar({ selectedCount, onClearSelection, actions = [] }) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-600 dark:bg-blue-700 rounded-xl shadow-lg text-white animate-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center gap-2 shrink-0">
        <CheckSquare className="h-4 w-4" />
        <span className="text-sm font-semibold">
          {selectedCount} selecionado{selectedCount !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="h-4 w-px bg-white/30 shrink-0" />

      <div className="flex items-center gap-2 flex-wrap">
        {actions.map((action, i) => {
          const Icon = action.icon;
          return (
            <Button
              key={i}
              size="sm"
              variant="ghost"
              className="h-7 text-xs font-medium text-white hover:bg-white/20 hover:text-white gap-1.5 px-3"
              onClick={action.onClick}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {action.label}
            </Button>
          );
        })}
      </div>

      <div className="ml-auto shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-white hover:bg-white/20 hover:text-white"
          onClick={onClearSelection}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
