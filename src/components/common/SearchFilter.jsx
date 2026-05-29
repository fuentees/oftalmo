import React from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

export default function SearchFilter({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar...",
  filters = [],
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-5">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 bg-white"
        />
      </div>
      {filters.map((filter, index) => (
        <Select key={index} value={filter.value} onValueChange={filter.onChange}>
          <SelectTrigger className="w-full sm:w-48 bg-white">
            <SelectValue placeholder={filter.placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{filter.allLabel || "Todos"}</SelectItem>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
    </div>
  );
}
