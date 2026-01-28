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

interface ChartDataPoint {
  time: number;
  value: number;
}

interface CryptoChartProps {
  data: ChartDataPoint[];
  label?: string;
  color?: string;
  timeFrame?: string;
}

export const CryptoChart = ({
  data,
  label = "Price",
  color = "#F7931A", // Default Bitcoin orange
  timeFrame = "Live",
}: CryptoChartProps) => {
  const formattedData = useMemo(() => {
    return data.map((point) => {
      let formattedTime = "";
      const date = new Date(point.time);

      if (timeFrame === "Live" || timeFrame === "5M") {
        formattedTime = date.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });
      } else if (timeFrame === "1D" || timeFrame === "1W") {
        formattedTime = date.toLocaleTimeString(undefined, {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
      } else if (
        timeFrame === "1M" ||
        timeFrame === "1Y" ||
        timeFrame === "5Y" ||
        timeFrame === "MAX"
      ) {
        formattedTime = date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: timeFrame !== "1M" ? "2-digit" : undefined,
        });
      }

      return {
        ...point,
        formattedTime,
        formattedValue: point.value,
      };
    });
  }, [data, timeFrame]);

  const gradientColor = color;

  if (data.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-white/30 text-sm">
        Waiting for data...
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[250px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={formattedData}>
          <defs>
            <linearGradient id="colorValueCrypto" x1="0" y1="0" x2="0" y2="1">
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
          <YAxis
            hide={false}
            orientation="right"
            domain={["auto", "auto"]}
            stroke="white"
            strokeOpacity={0.1}
            tick={{ fill: "white", opacity: 0.3, fontSize: 10 }}
            tickFormatter={(val) => val.toFixed(2)}
            width={60}
          />
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
              value?.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }) ?? "N/A",
              label,
            ]}
          />
          <Area
            type="monotone"
            dataKey="formattedValue"
            stroke={gradientColor}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorValueCrypto)"
            isAnimationActive={false} // Disable animation for smoother live updates
            activeDot={{ r: 4, strokeWidth: 0, fill: "white" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
