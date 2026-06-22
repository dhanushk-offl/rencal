import { useCallback, useEffect, useRef, useState } from "react"

import { rpc } from "@/rpc"

import { useTheme } from "@/hooks/useTheme"
import { rpcToCalendarEvent } from "@/lib/cal-events"

import { MiniCalendar } from "@/windows/widget/MiniCalendar"
import { TodayEvents } from "@/windows/widget/TodayEvents"

const s = {
  cellSize: 26,
  dateSize: "40px",
  headingSize: "11px",
  labelSize: "10px",
  gap: "6px",
  pad: 3,
} as const

export function WidgetWindow() {
  useTheme()

  const [now, setNow] = useState(new Date())
  const [dayCounts, setDayCounts] = useState<Record<number, number>>({})

  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date()
      if (d.getDate() !== now.getDate()) setNow(d)
    }, 60000)
    return () => clearInterval(timer)
  }, [now])

  const fetchDayCounts = useCallback(async (year: number, month: number) => {
    try {
      const cals = await rpc.caldir.list_calendars()
      if (cals.length === 0) return
      const firstDay = new Date(year, month, 1)
      const lastDay = new Date(year, month + 1, 0)
      const raw = await rpc.caldir.list_events(
        cals.map((c) => c.slug),
        firstDay.toISOString(),
        new Date(lastDay.getTime() + 86400000).toISOString(),
      )
      const counts: Record<number, number> = {}
      for (const e of raw) {
        try {
          const ev = rpcToCalendarEvent(e)
          const day = new Date(ev.dateInfo.startMs).getDate()
          counts[day] = (counts[day] ?? 0) + 1
        } catch {
          /* skip */
        }
      }
      setDayCounts(counts)
    } catch {
      /* non-critical */
    }
  }, [])

  useEffect(() => {
    void fetchDayCounts(now.getFullYear(), now.getMonth())
  }, [now, fetchDayCounts])

  // --- Drag to reposition via gtk-layer-shell margins ---
  const posRef = useRef({ x: 0, y: 0 })
  const dragState = useRef<{
    startScreenX: number
    startScreenY: number
  } | null>(null)
  const rafRef = useRef<number | null>(null)
  const pendingRef = useRef({ x: 0, y: 0 })

  // Load initial position from config on mount
  useEffect(() => {
    rpc.config.get_widget_position().then(([x, y]) => {
      posRef.current = { x: x ?? 0, y: y ?? 0 }
    })
  }, [])

  const savePosition = useCallback((x: number, y: number) => {
    rpc.config.set_widget_position(x, y).catch(() => {})
  }, [])

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const ds = dragState.current
      if (!ds) return
      const dx = e.screenX - ds.startScreenX
      const dy = e.screenY - ds.startScreenY
      pendingRef.current = { x: posRef.current.x + dx, y: posRef.current.y + dy }
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          const { x, y } = pendingRef.current
          rpc.widget.set_widget_margins(y, x).catch(() => {})
        })
      }
    }

    const handlePointerUp = (e: PointerEvent) => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      const ds = dragState.current
      if (!ds) return
      dragState.current = null
      const dx = e.screenX - ds.startScreenX
      const dy = e.screenY - ds.startScreenY
      const newX = posRef.current.x + dx
      const newY = posRef.current.y + dy
      posRef.current = { x: newX, y: newY }
      savePosition(newX, newY)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [savePosition])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    dragState.current = {
      startScreenX: e.screenX,
      startScreenY: e.screenY,
    }
  }, [])

  // --- Render ---
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase()
  const date = now.getDate()
  const month = now.toLocaleDateString("en-US", { month: "long" }).toUpperCase()
  const year = now.getFullYear()
  const monthIndex = now.getMonth()

  return (
    <div
      className="h-screen bg-background text-foreground select-none overflow-hidden flex flex-col cursor-grab active:cursor-grabbing"
      style={{ padding: `${s.pad * 4}px` }}
      onPointerDown={handlePointerDown}
    >
      <div className="flex items-start">
        <div className="flex flex-col">
          <div
            className="font-semibold text-muted-foreground tracking-wider"
            style={{ fontSize: s.labelSize }}
          >
            {dayName}
          </div>
          <div className="font-bold leading-none" style={{ fontSize: s.dateSize, marginTop: 0 }}>
            {date}
          </div>
        </div>
        <div className="flex flex-col items-end ml-auto">
          <div
            className="font-semibold text-muted-foreground tracking-wider"
            style={{ fontSize: s.labelSize }}
          >
            {month}
          </div>
          <div style={{ marginTop: s.gap }}>
            <MiniCalendar
              year={year}
              month={monthIndex}
              today={date}
              dayCounts={dayCounts}
              cellSize={s.cellSize}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0" style={{ marginTop: s.gap }}>
        <div
          className="font-semibold text-foreground"
          style={{ fontSize: s.headingSize, marginBottom: s.gap }}
        >
          Today&apos;s Tasks
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <TodayEvents compact={true} />
        </div>
      </div>
    </div>
  )
}
