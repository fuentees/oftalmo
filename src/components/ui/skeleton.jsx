import { cn } from "@/lib/utils"

/** @typedef {import("react").HTMLAttributes<HTMLDivElement>} SkeletonProps */

/** @param {SkeletonProps} props */
function Skeleton({ className, ...props }) {
  return (
    (<div
      className={cn("animate-pulse rounded-md bg-primary/10", className)}
      {...props} />)
  );
}

export { Skeleton }
