"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useCurrency } from "../../hooks/useCurrency";

interface ChartDataPoint {
  time: number;
  value: number;
}

interface ForexChartProps {
  data: ChartDataPoint[];
  label?: string;
  color?: string;
}

export const ForexChart = ({
  data,
  label = "Value",
  color,
}: ForexChartProps) => {
  const { currencySymbol, formatCurrency } = useCurrency();

  const formattedData = useMemo(() => {
    return data.map((point) => ({
      ...point,
      formattedTime: new Date(point.time).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      formattedValue: point.value,
      isReal: (point as any).isReal,
    }));
  }, [data]);

  const isPositive =
    data.length > 1 ? data[data.length - 1].value >= data[0].value : true;
  const gradientColor = color || (isPositive ? "#10B981" : "#EF4444"); // Use prop color or calculate

  if (data.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-white/30 text-sm">
        Not enough data to display chart
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[250px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={formattedData}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={gradientColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={gradientColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="white"
            strokeOpacity={0.05}
            vertical={false}
          />
          <XAxis
            dataKey="formattedTime"
            stroke="white"
            strokeOpacity={0.3}
            tick={{ fill: "white", opacity: 0.3, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            minTickGap={30}
          />
          <YAxis hide={true} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "12px",
              backdropFilter: "blur(10px)",
              padding: "8px 12px",
            }}
            itemStyle={{ color: "#fff", fontSize: "12px", fontWeight: 500 }}
            labelStyle={{
              color: "rgba(255, 255, 255, 0.5)",
              fontSize: "10px",
              marginBottom: "4px",
            }}
            formatter={(value: number | undefined) => [
              value !== undefined
                ? label === "Balance"
                  ? formatCurrency(value)
                  : value.toFixed(4)
                : "0",
              label,
            ]}
          />
          <Area
            type="monotone"
            dataKey="formattedValue"
            stroke={gradientColor}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorValue)"
            activeDot={{ r: 6, strokeWidth: 0 }}
            dot={(props: any) => {
              // Only show dot if point is marked as 'isReal'
              // props.payload is the data point
              if (props.payload.isReal) {
                return (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={4}
                    stroke={gradientColor}
                    strokeWidth={2}
                    fill="#000"
                  />
                );
              }
              return <></>;
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
