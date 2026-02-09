import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

/** @typedef {import("react").ElementRef<typeof TabsPrimitive.List>} TabsListElement */
/** @typedef {import("react").ComponentPropsWithoutRef<typeof TabsPrimitive.List>} TabsListProps */
/** @typedef {import("react").ElementRef<typeof TabsPrimitive.Trigger>} TabsTriggerElement */
/** @typedef {import("react").ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>} TabsTriggerProps */
/** @typedef {import("react").ElementRef<typeof TabsPrimitive.Content>} TabsContentElement */
/** @typedef {import("react").ComponentPropsWithoutRef<typeof TabsPrimitive.Content>} TabsContentProps */

const TabsList = React.forwardRef(
  /** @type {import("react").ForwardRefRenderFunction<TabsListElement, TabsListProps>} */
  ({ className, ...props }, ref) => (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props} />
  )
)
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef(
  /** @type {import("react").ForwardRefRenderFunction<TabsTriggerElement, TabsTriggerProps>} */
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
        className
      )}
      {...props} />
  )
)
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef(
  /** @type {import("react").ForwardRefRenderFunction<TabsContentElement, TabsContentProps>} */
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props} />
  )
)
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
