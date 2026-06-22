import { listen } from "@tauri-apps/api/event"
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { useCallback, useEffect, useState } from "react"

import { rpc } from "@/rpc"
import type { CalendarEvent as RpcCalendarEvent } from "@/rpc/bindings"
import { CALDIR_CHANGED } from "@/rpc/events"

import { rpcToCalendarEvent, type CalendarEvent } from "@/lib/cal-events"

const MAX_VISIBLE = 3

export function TodayEvents({ compact }: { compact?: boolean }) {
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchTodayEvents = useCallback(async () => {
    try {
      const cals = await rpc.caldir.list_calendars()

      if (cals.length === 0) {
        setAllEvents([])
        setError(null)
        setLoading(false)
        return
      }

      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const endOfDay = new Date(startOfDay.getTime() + 86400000)
      const startIso = startOfDay.toISOString()
      const endIso = endOfDay.toISOString()

      const raw: RpcCalendarEvent[] = await rpc.caldir.list_events(
        cals.map((c) => c.slug),
        startIso,
        endIso,
      )
      const converted = raw
        .map((e) => {
          try {
            return rpcToCalendarEvent(e)
          } catch {
            return null
          }
        })
        .filter((e): e is CalendarEvent => e !== null)
        .filter((e) => {
          const startMs = e.dateInfo.startMs
          return startMs >= startOfDay.getTime() && startMs < endOfDay.getTime()
        })
        .sort((a, b) => a.dateInfo.startMs - b.dateInfo.startMs)

      setAllEvents(converted)
      setError(null)
    } catch (e) {
      setError("Could not load events")
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchTodayEvents()
    const interval = setInterval(() => void fetchTodayEvents(), 60000)
    const unlisten = listen(CALDIR_CHANGED, () => {
      setLoading(true)
      void fetchTodayEvents()
    })
    return () => {
      clearInterval(interval)
      unlisten.then((fn) => fn())
    }
  }, [fetchTodayEvents])

  const openMainWindow = () => {
    WebviewWindow.getByLabel("main")
      .then((win) => {
        if (win) {
          win.show().catch(() => {})
          win.setFocus().catch(() => {})
        }
      })
      .catch(() => {})
  }

  const nowMs = Date.now()
  const upcomingEvents = allEvents.filter((e) => {
    // All-day events have no time — always show them
    if (e.start.kind === "date") return true
    // Timed events: only upcoming (including currently happening)
    return e.dateInfo.startMs >= nowMs
  })

  const visible = upcomingEvents.slice(0, MAX_VISIBLE)
  const hasMore = upcomingEvents.length > MAX_VISIBLE || allEvents.length > MAX_VISIBLE

  const baseSize = compact ? "11px" : "12px"
  const smallSize = compact ? "10px" : "11px"

  if (loading) {
    return (
      <div style={{ fontSize: smallSize }} className="text-muted-foreground">
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ fontSize: smallSize }} className="text-muted-foreground">
        {error}
        <button
          onClick={() => {
            setLoading(true)
            void fetchTodayEvents()
          }}
          className="ml-2 underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    )
  }

  if (visible.length === 0) {
    return (
      <div style={{ fontSize: smallSize }} className="text-muted-foreground">
        No tasks for today 🎉
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[3px]">
      {visible.map((event) => (
        <div
          key={`${event.calendar_slug}::${event.id}`}
          className="flex items-center gap-2"
          style={{ fontSize: baseSize }}
        >
          <span
            className="text-muted-foreground/60 shrink-0"
            style={{ color: event.color ?? "var(--primary)" }}
          >
            •
          </span>
          <span className="text-foreground truncate">{event.summary}</span>
          <span
            className="text-muted-foreground/60 shrink-0 ml-auto"
            style={{ fontSize: smallSize }}
          >
            {formatEventTime(event)}
          </span>
        </div>
      ))}
      {hasMore && (
        <button
          onClick={openMainWindow}
          className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors mt-0.5 self-start"
          style={{ fontSize: smallSize }}
        >
          See all tasks
        </button>
      )}
    </div>
  )
}

function formatEventTime(event: CalendarEvent): string {
  const { kind } = event.start
  if (kind === "date") {
    return ""
  }
  const ms = event.dateInfo.startMs
  const d = new Date(ms)
  const hh = d.getHours().toString().padStart(2, "0")
  const mm = d.getMinutes().toString().padStart(2, "0")
  return `${hh}:${mm}`
}
