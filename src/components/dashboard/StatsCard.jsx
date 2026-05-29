import React from "react";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function StatsCard({
  title,
  value,
  icon: Icon,
  trend = null,
  trendValue = "",
  color = "blue",
  href = null,
}) {
  const colorMap = {
    blue: { bg: "bg-blue-50", text: "text-blue-600", ring: "ring-blue-100" },
    green: { bg: "bg-green-50", text: "text-green-600", ring: "ring-green-100" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-100" },
    red: { bg: "bg-red-50", text: "text-red-600", ring: "ring-red-100" },
    purple: { bg: "bg-purple-50", text: "text-purple-600", ring: "ring-purple-100" },
  };

  const { bg, text, ring } = colorMap[color] || colorMap.blue;

  const content = (
    <Card className="p-5 hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate">{title}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 tabular-nums">{value}</p>
          {trend && (
            <div className="mt-2 flex items-center gap-1 text-xs">
              {trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-green-500" />}
              {trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
              {trend === "neutral" && <Minus className="h-3.5 w-3.5 text-slate-400" />}
              <span className={trend === "up" ? "text-green-600 font-medium" : trend === "down" ? "text-red-600 font-medium" : "text-slate-500"}>
                {trendValue}
              </span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl ${bg} ${text} ring-1 ${ring} shrink-0`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );

  if (href) {
    return <a href={href} className="block">{content}</a>;
  }
  return content;
}
