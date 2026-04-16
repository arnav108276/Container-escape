import * as React from "react"
import { Card, CardHeader, CardContent } from "@/components/ui/card"

interface Props {
  title: string
  value: number | string
  color: string
}

export default function MetricCard({ title, value, color }: Props) {
  return (
    <Card className="bg-gray-800 border-gray-700 shadow hover:shadow-lg transition">
      <CardHeader>
        <p className="text-gray-400 text-sm uppercase">{title}</p>
      </CardHeader>
      <CardContent>
        <h2 className="text-4xl font-bold mt-3" style={{ color }}>
          {value}
        </h2>
      </CardContent>
    </Card>
  )
}
