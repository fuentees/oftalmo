import React, { useState } from "react";
import { Columns3, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Botão para mostrar/ocultar colunas de uma DataTable.
 *
 * Props:
 *   columns        — array de { key: string, label: string }
 *   visibleKeys    — Set ou array com as keys visíveis
 *   onChange       — callback (newVisibleKeysSet) => void
 *   storageKey     — opcional: chave do localStorage para persistir
 */
export default function ColumnToggle({ columns, visibleKeys, onChange, storageKey }) {
  const visible = new Set(visibleKeys);

  const toggle = (key) => {
    const next = new Set(visible);
    if (next.has(key)) {
      if (next.size <= 1) return; // mantém ao menos 1 coluna visível
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
    if (storageKey) {
      try {
        localStorage.setItem(`col-visibility-${storageKey}`, JSON.stringify([...next]));
      } catch {}
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-9 text-sm">
          <Columns3 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Colunas</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 mb-2">
          Colunas visíveis
        </p>
        {columns.map((col) => {
          const isVisible = visible.has(col.key);
          return (
            <button
              key={col.key}
              className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg hover:bg-slate-50 text-sm text-slate-700 transition-colors"
              onClick={() => toggle(col.key)}
            >
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  isVisible
                    ? "bg-primary border-primary"
                    : "border-slate-300 bg-white"
                }`}
              >
                {isVisible && <Check className="h-2.5 w-2.5 text-white" />}
              </div>
              {col.label}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Hook para inicializar e persistir visibilidade de colunas.
 * Retorna [visibleKeys Set, setVisibleKeys fn].
 */
export function useColumnVisibility(columns, storageKey) {
  const [visibleKeys, setVisibleKeys] = useState(() => {
    if (storageKey) {
      try {
        const stored = JSON.parse(localStorage.getItem(`col-visibility-${storageKey}`) || "null");
        if (Array.isArray(stored)) return new Set(stored);
      } catch {}
    }
    return new Set(columns.map((c) => c.key));
  });
  return [visibleKeys, setVisibleKeys];
}
