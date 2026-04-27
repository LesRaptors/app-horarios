"use client";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({ values, width = 40, height = 16, className }: SparklineProps) {
  if (values.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  const max = Math.max(...values, 1);
  const barWidth = width / values.length;
  const gap = 1;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-label={`Cobertura últimas ${values.length} semanas`}
      role="img"
    >
      {values.map((v, i) => {
        const h = (v / max) * height;
        return (
          <rect
            key={i}
            x={i * barWidth + gap / 2}
            y={height - h}
            width={Math.max(0, barWidth - gap)}
            height={h}
            className="fill-primary/60"
          />
        );
      })}
    </svg>
  );
}
