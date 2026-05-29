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
    blue:   { topBorder: "border-t-blue-500",    iconBg: "bg-blue-600" },
    green:  { topBorder: "border-t-emerald-500",  iconBg: "bg-emerald-600" },
    amber:  { topBorder: "border-t-amber-500",    iconBg: "bg-amber-500" },
    red:    { topBorder: "border-t-red-500",      iconBg: "bg-red-600" },
    purple: { topBorder: "border-t-violet-500",   iconBg: "bg-violet-600" },
  };

  const colors = colorMap[color] || colorMap.blue;

  const content = (
    <Card className={`border-t-4 ${colors.topBorder} hover:shadow-md transition-all duration-200`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
              {title}
            </p>
            <p className="mt-3 text-3xl font-bold text-slate-900 tabular-nums leading-none">
              {value}
            </p>
            {trend && (
              <div className="mt-2 flex items-center gap-1 text-xs">
                {trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
                {trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                {trend === "neutral" && <Minus className="h-3.5 w-3.5 text-slate-400" />}
                <span className={
                  trend === "up" ? "text-emerald-600 font-medium" :
                  trend === "down" ? "text-red-600 font-medium" :
                  "text-slate-500"
                }>
                  {trendValue}
                </span>
              </div>
            )}
          </div>
          <div className={`p-3 rounded-xl ${colors.iconBg} text-white shrink-0 shadow-sm`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </div>
    </Card>
  );

  if (href) {
    return (
      <a href={href} className="block cursor-pointer">
        {content}
      </a>
    );
  }
  return content;
}
