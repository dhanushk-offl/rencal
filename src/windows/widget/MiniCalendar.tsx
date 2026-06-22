import { useMemo } from "react"

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"]

interface MiniCalendarProps {
  year: number
  month: number
  today: number
  dayCounts?: Record<number, number>
  cellSize: number
}

export function MiniCalendar({ year, month, today, dayCounts, cellSize }: MiniCalendarProps) {
  const grid = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay()
    const firstDayMonday = firstDay === 0 ? 6 : firstDay - 1
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: (number | null)[] = []
    for (let i = 0; i < firstDayMonday; i++) {
      cells.push(null)
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(d)
    }
    return cells
  }, [year, month])

  const cellStyle = { width: cellSize, height: Math.round(cellSize * 0.76) }
  const headerStyle = { width: cellSize, height: Math.round(cellSize * 0.65) }
  const fontSize = cellSize >= 34 ? "11px" : "10px"

  return (
    <div className="grid grid-cols-7">
      {DAY_LABELS.map((d) => (
        <div
          key={d}
          className="flex items-center justify-center text-muted-foreground font-medium"
          style={{ ...headerStyle, fontSize }}
        >
          {d}
        </div>
      ))}
      {grid.map((d, i) =>
        d === null ? (
          <div key={`e-${i}`} style={cellStyle} />
        ) : (
          <div
            key={d}
            className={`flex items-center justify-center border text-foreground ${
              d === today ? "border-foreground font-bold" : "border-transparent"
            }`}
            style={{ ...cellStyle, fontSize }}
            title={
              dayCounts && dayCounts[d]
                ? `${dayCounts[d]} task${dayCounts[d] > 1 ? "s" : ""}`
                : undefined
            }
          >
            {d}
          </div>
        ),
      )}
    </div>
  )
}
