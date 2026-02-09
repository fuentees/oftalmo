import * as React from "react"

import { cn } from "@/lib/utils"

/** @typedef {import("react").TableHTMLAttributes<HTMLTableElement>} TableProps */
/** @typedef {import("react").HTMLAttributes<HTMLTableSectionElement>} TableSectionProps */
/** @typedef {import("react").HTMLAttributes<HTMLTableRowElement>} TableRowProps */
/** @typedef {import("react").HTMLAttributes<HTMLTableCellElement>} TableCellProps */
/** @typedef {import("react").HTMLAttributes<HTMLTableCaptionElement>} TableCaptionProps */

const Table = React.forwardRef(
  /** @type {import("react").ForwardRefRenderFunction<HTMLTableElement, TableProps>} */
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table
        ref={ref}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props} />
    </div>
  )
)
Table.displayName = "Table"

const TableHeader = React.forwardRef(
  /** @type {import("react").ForwardRefRenderFunction<HTMLTableSectionElement, TableSectionProps>} */
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
  )
)
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef(
  /** @type {import("react").ForwardRefRenderFunction<HTMLTableSectionElement, TableSectionProps>} */
  ({ className, ...props }, ref) => (
    <tbody
      ref={ref}
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props} />
  )
)
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef(
  /** @type {import("react").ForwardRefRenderFunction<HTMLTableSectionElement, TableSectionProps>} */
  ({ className, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props} />
  )
)
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef(
  /** @type {import("react").ForwardRefRenderFunction<HTMLTableRowElement, TableRowProps>} */
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props} />
  )
)
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef(
  /** @type {import("react").ForwardRefRenderFunction<HTMLTableCellElement, TableCellProps>} */
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props} />
  )
)
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef(
  /** @type {import("react").ForwardRefRenderFunction<HTMLTableCellElement, TableCellProps>} */
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn(
        "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props} />
  )
)
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef(
  /** @type {import("react").ForwardRefRenderFunction<HTMLTableCaptionElement, TableCaptionProps>} */
  ({ className, ...props }, ref) => (
    <caption
      ref={ref}
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props} />
  )
)
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
