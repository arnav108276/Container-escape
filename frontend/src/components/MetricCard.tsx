import React from "react";
interface Props {
  title: string;
  value: number | string;
  color: string;
}

export default function MetricCard({ title, value, color }: Props) {
  return (
    <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow hover:shadow-lg transition">

      <p className="text-gray-400 text-sm uppercase">
        {title}
      </p>

      <h2
        className="text-4xl font-bold mt-3"
        style={{ color }}
      >
        {value}
      </h2>

    </div>
  );
}