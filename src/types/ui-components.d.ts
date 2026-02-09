import * as React from "react";

type WithChildren<P = {}> = React.PropsWithChildren<P>;
type AnyProps = Record<string, any>;

declare module "@/components/ui/button" {
  export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: string;
    size?: string;
    asChild?: boolean;
  }

  export const Button: React.ForwardRefExoticComponent<
    ButtonProps & React.RefAttributes<HTMLButtonElement>
  >;
  export const buttonVariants: (...args: any[]) => string;
}

declare module "@/components/ui/input" {
  export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
  export const Input: React.ForwardRefExoticComponent<
    InputProps & React.RefAttributes<HTMLInputElement>
  >;
}

declare module "@/components/ui/label" {
  export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;
  export const Label: React.ForwardRefExoticComponent<
    LabelProps & React.RefAttributes<HTMLLabelElement>
  >;
}

declare module "@/components/ui/textarea" {
  export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
  export const Textarea: React.ForwardRefExoticComponent<
    TextareaProps & React.RefAttributes<HTMLTextAreaElement>
  >;
}

declare module "@/components/ui/badge" {
  export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: string;
  }
  export const Badge: React.ComponentType<BadgeProps>;
  export const badgeVariants: (...args: any[]) => string;
}

declare module "@/components/ui/card" {
  export type CardProps = React.HTMLAttributes<HTMLDivElement>;
  export const Card: React.ComponentType<CardProps>;
  export const CardHeader: React.ComponentType<CardProps>;
  export const CardTitle: React.ComponentType<CardProps>;
  export const CardDescription: React.ComponentType<CardProps>;
  export const CardContent: React.ComponentType<CardProps>;
  export const CardFooter: React.ComponentType<CardProps>;
}

declare module "@/components/ui/tabs" {
  export const Tabs: React.ComponentType<WithChildren<AnyProps>>;
  export const TabsList: React.ComponentType<WithChildren<AnyProps>>;
  export const TabsTrigger: React.ComponentType<WithChildren<AnyProps>>;
  export const TabsContent: React.ComponentType<WithChildren<AnyProps>>;
}

declare module "@/components/ui/table" {
  export type TableProps = React.TableHTMLAttributes<HTMLTableElement>;
  export type TableSectionProps = React.HTMLAttributes<HTMLTableSectionElement>;
  export type TableRowProps = React.HTMLAttributes<HTMLTableRowElement>;
  export type TableCellProps = React.HTMLAttributes<HTMLTableCellElement>;
  export type TableCaptionProps = React.HTMLAttributes<HTMLTableCaptionElement>;

  export const Table: React.ComponentType<TableProps>;
  export const TableHeader: React.ComponentType<TableSectionProps>;
  export const TableBody: React.ComponentType<TableSectionProps>;
  export const TableFooter: React.ComponentType<TableSectionProps>;
  export const TableRow: React.ComponentType<TableRowProps>;
  export const TableHead: React.ComponentType<TableCellProps>;
  export const TableCell: React.ComponentType<TableCellProps>;
  export const TableCaption: React.ComponentType<TableCaptionProps>;
}

declare module "@/components/ui/alert" {
  export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: string;
  }
  export const Alert: React.ComponentType<AlertProps>;
  export const AlertTitle: React.ComponentType<WithChildren<React.HTMLAttributes<HTMLHeadingElement>>>;
  export const AlertDescription: React.ComponentType<WithChildren<React.HTMLAttributes<HTMLDivElement>>>;
}

declare module "@/components/ui/checkbox" {
  export interface CheckboxProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }
  export const Checkbox: React.ComponentType<CheckboxProps>;
}

declare module "@/components/ui/dialog" {
  export const Dialog: React.ComponentType<WithChildren<AnyProps>>;
  export const DialogTrigger: React.ComponentType<WithChildren<AnyProps>>;
  export const DialogPortal: React.ComponentType<WithChildren<AnyProps>>;
  export const DialogOverlay: React.ComponentType<WithChildren<AnyProps>>;
  export const DialogClose: React.ComponentType<WithChildren<AnyProps>>;
  export const DialogContent: React.ComponentType<WithChildren<AnyProps>>;
  export const DialogHeader: React.ComponentType<WithChildren<AnyProps>>;
  export const DialogFooter: React.ComponentType<WithChildren<AnyProps>>;
  export const DialogTitle: React.ComponentType<WithChildren<AnyProps>>;
  export const DialogDescription: React.ComponentType<WithChildren<AnyProps>>;
}

declare module "@/components/ui/alert-dialog" {
  export const AlertDialog: React.ComponentType<WithChildren<AnyProps>>;
  export const AlertDialogTrigger: React.ComponentType<WithChildren<AnyProps>>;
  export const AlertDialogContent: React.ComponentType<WithChildren<AnyProps>>;
  export const AlertDialogHeader: React.ComponentType<WithChildren<AnyProps>>;
  export const AlertDialogFooter: React.ComponentType<WithChildren<AnyProps>>;
  export const AlertDialogTitle: React.ComponentType<WithChildren<AnyProps>>;
  export const AlertDialogDescription: React.ComponentType<WithChildren<AnyProps>>;
  export const AlertDialogAction: React.ComponentType<WithChildren<AnyProps>>;
  export const AlertDialogCancel: React.ComponentType<WithChildren<AnyProps>>;
}

declare module "@/components/ui/dropdown-menu" {
  export interface DropdownMenuTriggerProps extends React.HTMLAttributes<HTMLElement> {
    asChild?: boolean;
  }
  export interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
    align?: string;
  }

  export const DropdownMenu: React.ComponentType<WithChildren<AnyProps>>;
  export const DropdownMenuTrigger: React.ComponentType<WithChildren<DropdownMenuTriggerProps>>;
  export const DropdownMenuContent: React.ComponentType<WithChildren<DropdownMenuContentProps>>;
  export const DropdownMenuItem: React.ComponentType<WithChildren<AnyProps>>;
  export const DropdownMenuCheckboxItem: React.ComponentType<WithChildren<AnyProps>>;
  export const DropdownMenuRadioItem: React.ComponentType<WithChildren<AnyProps>>;
  export const DropdownMenuLabel: React.ComponentType<WithChildren<AnyProps>>;
  export const DropdownMenuSeparator: React.ComponentType<WithChildren<AnyProps>>;
  export const DropdownMenuShortcut: React.ComponentType<WithChildren<AnyProps>>;
  export const DropdownMenuGroup: React.ComponentType<WithChildren<AnyProps>>;
  export const DropdownMenuPortal: React.ComponentType<WithChildren<AnyProps>>;
  export const DropdownMenuSub: React.ComponentType<WithChildren<AnyProps>>;
  export const DropdownMenuSubContent: React.ComponentType<WithChildren<AnyProps>>;
  export const DropdownMenuSubTrigger: React.ComponentType<WithChildren<AnyProps>>;
  export const DropdownMenuRadioGroup: React.ComponentType<WithChildren<AnyProps>>;
}

declare module "@/components/ui/select" {
  export interface SelectProps extends React.HTMLAttributes<HTMLDivElement> {
    value?: string;
    onValueChange?: (value: string) => void;
  }
  export const Select: React.ComponentType<WithChildren<SelectProps>>;
  export const SelectContent: React.ComponentType<WithChildren<AnyProps>>;
  export const SelectItem: React.ComponentType<WithChildren<{ value: string }>>;
  export const SelectTrigger: React.ComponentType<WithChildren<AnyProps>>;
  export const SelectValue: React.ComponentType<WithChildren<{ placeholder?: string }>>;
  export const SelectGroup: React.ComponentType<WithChildren<AnyProps>>;
  export const SelectLabel: React.ComponentType<WithChildren<AnyProps>>;
  export const SelectSeparator: React.ComponentType<WithChildren<AnyProps>>;
  export const SelectScrollUpButton: React.ComponentType<WithChildren<AnyProps>>;
  export const SelectScrollDownButton: React.ComponentType<WithChildren<AnyProps>>;
}

declare module "@/components/ui/skeleton" {
  export const Skeleton: React.ComponentType<React.HTMLAttributes<HTMLDivElement>>;
}

declare module "@/components/ui/toast" {
  export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: string;
  }
  export const ToastProvider: React.ComponentType<WithChildren<AnyProps>>;
  export const ToastViewport: React.ComponentType<WithChildren<AnyProps>>;
  export const Toast: React.ComponentType<WithChildren<ToastProps>>;
  export const ToastTitle: React.ComponentType<WithChildren<AnyProps>>;
  export const ToastDescription: React.ComponentType<WithChildren<AnyProps>>;
  export const ToastClose: React.ComponentType<WithChildren<AnyProps>>;
  export const ToastAction: React.ComponentType<WithChildren<AnyProps>>;
}

declare module "@/components/ui/toaster" {
  export const Toaster: React.ComponentType;
}

declare module "@/components/ui/tooltip" {
  export const TooltipProvider: React.ComponentType<WithChildren<AnyProps>>;
  export const Tooltip: React.ComponentType<WithChildren<AnyProps>>;
  export const TooltipTrigger: React.ComponentType<WithChildren<AnyProps>>;
  export const TooltipContent: React.ComponentType<WithChildren<AnyProps>>;
}
