/** Compact bar visualization of recent fantasy scores — the one sparkline pattern in the app. */
export function FormSparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);

  return (
    <div className="flex items-end gap-3">
      {values.map((points, index) => (
        <div key={index} className="flex flex-col items-center gap-1.5">
          <div className="flex h-12 w-4 items-end bg-muted">
            <div
              className="w-full bg-foreground/50"
              style={{ height: `${Math.max((points / max) * 100, 8)}%` }}
            />
          </div>
          <span className="font-mono text-[11px] tabular-nums text-foreground-tertiary">
            {points}
          </span>
        </div>
      ))}
    </div>
  );
}
