import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, ArrowUp, ArrowDown, Inbox } from "lucide-react";

export default function DataTable({
  columns,
  data = [],
  isLoading = false,
  onRowClick = null,
  emptyMessage = "Nenhum registro encontrado",
  rowClassName,
}) {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });

  const handleSort = (column) => {
    if (!column.sortable && column.sortable !== undefined) return;
    const key = column.accessor || column.header;
    const direction =
      sortConfig.key === key && sortConfig.direction === "asc" ? "desc" : "asc";
    setSortConfig({ key, direction });
  };

  const getSortedData = () => {
    if (!sortConfig.key) return data;
    const column = columns.find(
      (col) => (col.accessor || col.header) === sortConfig.key
    );
    return [...data].sort((a, b) => {
      let aValue = column.accessor ? a[column.accessor] : a;
      let bValue = column.accessor ? b[column.accessor] : b;
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      if (
        column.sortType === "date" ||
        (typeof aValue === "string" && aValue.match(/^\d{4}-\d{2}-\d{2}/))
      ) {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }
      if (column.sortType === "number" || typeof aValue === "number") {
        aValue = Number(aValue);
        bValue = Number(bValue);
      }
      if (typeof aValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  };

  const sortedData = getSortedData();

  const getSortIcon = (column) => {
    const key = column.accessor || column.header;
    if (sortConfig.key !== key)
      return <ArrowUpDown className="h-3 w-3 text-slate-400 shrink-0" />;
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="h-3 w-3 text-primary shrink-0" />
    ) : (
      <ArrowDown className="h-3 w-3 text-primary shrink-0" />
    );
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              {columns.map((col, i) => (
                <TableHead key={i} className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i} className="border-slate-100">
                {columns.map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full rounded-md" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-16 flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
          <Inbox className="h-6 w-6 text-slate-400" />
        </div>
        <p className="text-sm text-slate-500 font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50 border-slate-200">
              {columns.map((col, i) => {
                const isSortable = col.sortable !== false;
                return (
                  <TableHead
                    key={i}
                    className={`text-xs font-semibold text-slate-500 uppercase tracking-wide ${col.className || ""} ${isSortable ? "cursor-pointer hover:text-slate-700 select-none" : ""}`}
                    onClick={() => isSortable && handleSort(col)}
                  >
                    <div className="flex items-center gap-1.5">
                      {col.header}
                      {isSortable && getSortIcon(col)}
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((row, rowIndex) => (
              <TableRow
                key={row.id || rowIndex}
                className={[
                  "border-slate-100 transition-colors",
                  onRowClick ? "cursor-pointer hover:bg-slate-50" : "hover:bg-slate-50/50",
                  typeof rowClassName === "function"
                    ? rowClassName(row)
                    : rowClassName || "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onRowClick && onRowClick(row)}
              >
                {columns.map((col, colIndex) => (
                  <TableCell key={colIndex} className={col.cellClassName}>
                    {col.render ? col.render(row) : row[col.accessor]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
