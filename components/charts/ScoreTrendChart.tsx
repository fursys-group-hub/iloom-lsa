'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DataPoint {
  date: string;
  avg: number;
  [key: string]: string | number;
}

interface Props {
  data: DataPoint[];
  lines?: { key: string; color: string; name: string }[];
  height?: number;
}

export default function ScoreTrendChart({ data, lines, height = 300 }: Props) {
  const formatDate = (date: string) => {
    const d = new Date(date);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 13, fill: '#8E8E93' }}
          axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
          tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 13, fill: '#8E8E93' }}
          axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
          tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: '1px solid #3A3A3C',
            background: '#1C1C1E',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            fontSize: 13,
            color: '#EBEBF5CC',
          }}
          labelFormatter={(label) => formatDate(String(label))}
        />
        {lines ? (
          lines.map((line) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              stroke={line.color}
              name={line.name}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          ))
        ) : (
          <Line
            type="monotone"
            dataKey="avg"
            stroke="#3b82f6"
            strokeWidth={2.5}
            dot={{ r: 4, fill: '#3b82f6' }}
            activeDot={{ r: 6 }}
            name="평균"
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
