import React from "react";

interface StatCardProps {
  title: string;
  value: number | string;
  color?: string;
}

export default function StatCard({ title, value, color = "text-green-400" }: StatCardProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md hover:shadow-lg transition">

      <h3 className="text-sm text-gray-400 mb-2">
        {title}
      </h3>

      <p className={`text-3xl font-bold ${color}`}>
        {value}
      </p>

    </div>
  );
}