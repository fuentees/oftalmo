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
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export default function DataTable({ columns, data, isLoading, onRowClick, emptyMessage = "Nenhum registro encontrado" }) {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });

  const handleSort = (column) => {
    if (!column.sortable && column.sortable !== undefined) return;
    
    const key = column.accessor || column.header;
    let direction = "asc";
    
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    
    setSortConfig({ key, direction });
  };

  const getSortedData = () => {
    if (!sortConfig.key) return data;
    
    const column = columns.find(col => (col.accessor || col.header) === sortConfig.key);
    
    return [...data].sort((a, b) => {
      let aValue = column.accessor ? a[column.accessor] : a;
      let bValue = column.accessor ? b[column.accessor] : b;
      
      // Handle null/undefined
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      
      // Handle dates
      if (column.sortType === "date" || (typeof aValue === "string" && aValue.match(/^\d{4}-\d{2}-\d{2}/))) {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }
      
      // Handle numbers
      if (column.sortType === "number" || typeof aValue === "number") {
        aValue = Number(aValue);
        bValue = Number(bValue);
      }
      
      // Handle strings
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
    if (sortConfig.key !== key) {
      return <ArrowUpDown className="h-3 w-3 text-slate-400" />;
    }
    return sortConfig.direction === "asc" ? 
      <ArrowUp className="h-3 w-3 text-blue-600" /> : 
      <ArrowDown className="h-3 w-3 text-blue-600" />;
  };
  if (isLoading) {
    return (
      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col, i) => (
                <TableHead key={i} className={col.className}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {columns.map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
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
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-slate-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              {columns.map((col, i) => {
                const isSortable = col.sortable !== false;
                return (
                  <TableHead 
                    key={i} 
                    className={`font-semibold text-slate-700 ${col.className || ""} ${isSortable ? 'cursor-pointer hover:bg-slate-100' : ''}`}
                    onClick={() => isSortable && handleSort(col)}
                  >
                    <div className="flex items-center gap-2">
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
                className={onRowClick ? "cursor-pointer hover:bg-slate-50" : ""}
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