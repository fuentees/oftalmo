import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

const AlertDialog = AlertDialogPrimitive.Root

const AlertDialogTrigger = AlertDialogPrimitive.Trigger

const AlertDialogPortal = AlertDialogPrimitive.Portal

/** @typedef {import("react").ElementRef<typeof AlertDialogPrimitive.Overlay>} AlertDialogOverlayElement */
/** @typedef {import("react").ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>} AlertDialogOverlayProps */
/** @typedef {import("react").ElementRef<typeof AlertDialogPrimitive.Content>} AlertDialogContentElement */
/** @typedef {import("react").ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>} AlertDialogContentProps */
/** @typedef {import("react").HTMLAttributes<HTMLDivElement>} AlertDialogHeaderFooterProps */
/** @typedef {import("react").ElementRef<typeof AlertDialogPrimitive.Title>} AlertDialogTitleElement */
/** @typedef {import("react").ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>} AlertDialogTitleProps */
/** @typedef {import("react").ElementRef<typeof AlertDialogPrimitive.Description>} AlertDialogDescriptionElement */
/** @typedef {import("react").ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>} AlertDialogDescriptionProps */
/** @typedef {import("react").ElementRef<typeof AlertDialogPrimitive.Action>} AlertDialogActionElement */
/** @typedef {import("react").ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>} AlertDialogActionProps */
/** @typedef {import("react").ElementRef<typeof AlertDialogPrimitive.Cancel>} AlertDialogCancelElement */
/** @typedef {import("react").ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>} AlertDialogCancelProps */

/** @type {import("react").ForwardRefExoticComponent<AlertDialogOverlayProps & import("react").RefAttributes<AlertDialogOverlayElement>>} */
const AlertDialogOverlay = React.forwardRef(
  /** @type {import("react").ForwardRefRenderFunction<AlertDialogOverlayElement, AlertDialogOverlayProps>} */
  ({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props}
      ref={ref} />
  )
)
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName

/** @type {import("react").ForwardRefExoticComponent<AlertDialogContentProps & import("react").RefAttributes<AlertDialogContentElement>>} */
const AlertDialogContent = React.forwardRef(
  /** @type {import("react").ForwardRefRenderFunction<AlertDialogContentElement, AlertDialogContentProps>} */
  ({ className, ...props }, ref) => (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          className
        )}
        {...props} />
    </AlertDialogPortal>
  )
)
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName

/** @type {import("react").FC<AlertDialogHeaderFooterProps>} */
const AlertDialogHeader = ({ className, ...props }) => (
  <div
    className={cn("flex flex-col space-y-2 text-center sm:text-left", className)}
    {...props} />
)
AlertDialogHeader.displayName = "AlertDialogHeader"

/** @type {import("react").FC<AlertDialogHeaderFooterProps>} */
const AlertDialogFooter = ({ className, ...props }) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props} />
)
AlertDialogFooter.displayName = "AlertDialogFooter"

/** @type {import("react").ForwardRefExoticComponent<AlertDialogTitleProps & import("react").RefAttributes<AlertDialogTitleElement>>} */
const AlertDialogTitle = React.forwardRef(
  /** @type {import("react").ForwardRefRenderFunction<AlertDialogTitleElement, AlertDialogTitleProps>} */
  ({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold", className)} {...props} />
  )
)
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName

/** @type {import("react").ForwardRefExoticComponent<AlertDialogDescriptionProps & import("react").RefAttributes<AlertDialogDescriptionElement>>} */
const AlertDialogDescription = React.forwardRef(
  /** @type {import("react").ForwardRefRenderFunction<AlertDialogDescriptionElement, AlertDialogDescriptionProps>} */
  ({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props} />
  )
)
AlertDialogDescription.displayName =
  AlertDialogPrimitive.Description.displayName

/** @type {import("react").ForwardRefExoticComponent<AlertDialogActionProps & import("react").RefAttributes<AlertDialogActionElement>>} */
const AlertDialogAction = React.forwardRef(
  /** @type {import("react").ForwardRefRenderFunction<AlertDialogActionElement, AlertDialogActionProps>} */
  ({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Action ref={ref} className={cn(buttonVariants(), className)} {...props} />
  )
)
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName

/** @type {import("react").ForwardRefExoticComponent<AlertDialogCancelProps & import("react").RefAttributes<AlertDialogCancelElement>>} */
const AlertDialogCancel = React.forwardRef(
  /** @type {import("react").ForwardRefRenderFunction<AlertDialogCancelElement, AlertDialogCancelProps>} */
  ({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Cancel
      ref={ref}
      className={cn(buttonVariants({ variant: "outline" }), "mt-2 sm:mt-0", className)}
      {...props} />
  )
)
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
