import React, { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const normalizeDigits = (value) => String(value ?? "").replace(/\D/g, "");

/**
 * Combobox de busca/vinculo com o cadastro de Profissionais. Permite
 * selecionar um profissional existente (por nome, e-mail, RG ou CPF) ou
 * cadastrar um novo na hora, sem sair do formulario.
 */
export default function ProfessionalPicker({
  professionals = [],
  professionalId,
  displayName,
  onSelect,
  onCreateNew,
  placeholder = "Buscar profissional...",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const normalized = normalizeText(query);
    const digits = normalizeDigits(query);
    if (!normalized) return professionals.slice(0, 50);
    return professionals
      .filter((professional) => {
        if (normalizeText(professional.name).includes(normalized)) return true;
        if (normalizeText(professional.email).includes(normalized)) return true;
        if (digits.length >= 3) {
          if (normalizeDigits(professional.rg).includes(digits)) return true;
          if (normalizeDigits(professional.cpf).includes(digits)) return true;
        }
        return false;
      })
      .slice(0, 50);
  }, [professionals, query]);

  const hasExactNameMatch = filtered.some(
    (professional) => normalizeText(professional.name) === normalizeText(query)
  );

  const handleSelect = (professional) => {
    onSelect(professional);
    setOpen(false);
    setQuery("");
  };

  const handleCreateNew = async () => {
    const name = query.trim();
    if (!name || creating || !onCreateNew) return;
    setCreating(true);
    try {
      await onCreateNew(name);
      setOpen(false);
      setQuery("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !displayName && "text-muted-foreground")}>
            {displayName || placeholder}
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            {professionalId && <UserCheck className="h-3.5 w-3.5 text-green-600" />}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nome, e-mail, RG ou CPF..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty className="px-3 py-4 text-sm text-slate-500">
              Nenhum profissional encontrado.
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((professional) => (
                <CommandItem
                  key={professional.id}
                  value={professional.id}
                  onSelect={() => handleSelect(professional)}
                >
                  <Check
                    className={cn(
                      "h-4 w-4",
                      professional.id === professionalId ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{professional.name}</span>
                    {(professional.email || professional.sector) && (
                      <span className="text-xs text-slate-400 truncate">
                        {[professional.email, professional.sector].filter(Boolean).join(" • ")}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {query.trim() && !hasExactNameMatch && onCreateNew && (
              <CommandGroup>
                <CommandItem
                  value={`__create__${query}`}
                  onSelect={handleCreateNew}
                  disabled={creating}
                  className="text-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  {creating ? "Cadastrando..." : `Cadastrar novo profissional: "${query.trim()}"`}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
