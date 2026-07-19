import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface MarketStatsCardProps {
  title: string;
  value: string | number;
  trend?: {
    value: string;
    isPositive: boolean;
    label?: string;
  };
  icon?: LucideIcon;
  subContent?: ReactNode;
  gradient?: string;
}

export const MarketStatsCard = ({
  title,
  value,
  trend,
  icon: Icon,
  subContent,
  gradient = "from-emerald-900/20 to-emerald-600/10",
}: MarketStatsCardProps) => {
  return (
    <Card
      className={cn(
        "relative overflow-hidden group hover:border-white/20 transition-all shadow-lg bg-gradient-to-br border border-white/10",
        gradient,
      )}
    >
      <CardContent className="p-6">
        {Icon && (
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Icon size={80} />
          </div>
        )}
        <h3 className="text-white/60 font-medium text-sm mb-1">{title}</h3>
        <div className="text-3xl font-bold text-white mb-2">{value}</div>

        {trend && (
          <div
            className={`flex items-center gap-1 text-xs font-medium w-fit px-2 py-1 rounded-lg ${trend.isPositive ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"}`}
          >
            <span>{trend.value}</span>
            {trend.label && <span>{trend.label}</span>}
          </div>
        )}

        {subContent && <div className="mt-2">{subContent}</div>}
      </CardContent>
    </Card>
  );
};
