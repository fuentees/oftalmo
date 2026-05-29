import React, { useState } from "react";
import { Bookmark, BookmarkCheck, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Componente de filtros salvos baseado em localStorage.
 *
 * Props:
 *   storageKey   — chave única para o localStorage (ex: "participants-filters")
 *   currentFilters — objeto com os filtros ativos agora
 *   onApply      — callback (filters) chamado ao aplicar um filtro salvo
 */
export default function SavedFilters({ storageKey, currentFilters, onApply }) {
  const [saved, setSaved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`saved-filters-${storageKey}`) || "[]");
    } catch {
      return [];
    }
  });
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  const persist = (next) => {
    setSaved(next);
    try {
      localStorage.setItem(`saved-filters-${storageKey}`, JSON.stringify(next));
    } catch {}
  };

  const save = () => {
    const label = name.trim() || `Filtro ${saved.length + 1}`;
    const next = [...saved, { label, filters: currentFilters, savedAt: Date.now() }];
    persist(next);
    setName("");
    setOpen(false);
  };

  const remove = (idx, e) => {
    e.stopPropagation();
    const next = saved.filter((_, i) => i !== idx);
    persist(next);
  };

  const apply = (entry) => {
    onApply(entry.filters);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-9 text-sm"
          title="Filtros salvos"
        >
          <Bookmark className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filtros salvos</span>
          {saved.length > 0 && (
            <span className="ml-0.5 bg-primary text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {saved.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3 space-y-3">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Filtros salvos</p>

        {/* Salvar filtro atual */}
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="Nome do filtro..."
            className="h-8 text-sm"
          />
          <Button size="sm" className="h-8 gap-1 shrink-0" onClick={save}>
            <Plus className="h-3.5 w-3.5" />
            Salvar
          </Button>
        </div>

        {/* Lista de filtros salvos */}
        {saved.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-2">Nenhum filtro salvo ainda.</p>
        ) : (
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {saved.map((entry, idx) => (
              <div
                key={idx}
                className="group flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                onClick={() => apply(entry)}
              >
                <BookmarkCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="flex-1 text-sm text-slate-700 truncate">{entry.label}</span>
                <button
                  onClick={(e) => remove(idx, e)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
