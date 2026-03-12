import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";

interface RiskData {
  time: string;
  risk: number;
}

export default function RiskChart({ data }: { data: RiskData[] }) {

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">

      <h2 className="text-lg font-semibold mb-4">
        Risk Score Trend
      </h2>

      <ResponsiveContainer width="100%" height={300}>

        <LineChart data={data}>

          <XAxis dataKey="time" stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" />

          <Tooltip />

          <Line
            type="monotone"
            dataKey="risk"
            stroke="#22c55e"
            strokeWidth={3}
          />

        </LineChart>

      </ResponsiveContainer>

    </div>
  );
}