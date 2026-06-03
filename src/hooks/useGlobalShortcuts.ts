import { addDays, subDays } from "date-fns"
import { useRef } from "react"
import { useHotkeys } from "react-hotkeys-hook"

import { openSettingsWindow } from "@/components/toolbar/SettingsButton"
import { SEARCH_BUTTON_EL_ID } from "@/components/toolbar/search/SearchButton"
import { SEARCH_INPUT_EL_ID } from "@/components/toolbar/search/SearchInput"

import { useCalendarNavigation } from "@/contexts/CalendarStateContext"
import { useCreateEventGate } from "@/contexts/CreateEventGateContext"
import { useEventDraft } from "@/contexts/EventDraftContext"

import { useTheme } from "@/hooks/useTheme"
import { CalendarView } from "@/lib/calendar-view"

const NAV_THROTTLE_MS = 80

export function useGlobalShortcuts({
  onChangeCalendarView,
}: {
  onChangeCalendarView: (view: CalendarView) => void
}) {
  const { activeDate, navigateToDate } = useCalendarNavigation()
  const { setIsDrafting, setDefaultDraftEvent } = useEventDraft()
  const { canCreate, promptToConnect } = useCreateEventGate()
  const { toggleTheme } = useTheme()

  const lastNavRef = useRef(0)

  const throttledNavigate = (date: Date) => {
    const now = Date.now()
    if (now - lastNavRef.current < NAV_THROTTLE_MS) return
    lastNavRef.current = now
    void navigateToDate(date)
  }

  const handleSearch = (e: KeyboardEvent) => {
    e.preventDefault()
    const input = document.getElementById(SEARCH_INPUT_EL_ID) as HTMLInputElement | null

    if (input) {
      input.focus()
      return
    }

    const button = document.getElementById(SEARCH_BUTTON_EL_ID) as HTMLButtonElement | null

    button?.click()
  }

  // Focus search ("/" needs Shift on some layouts, e.g. AZERTY)
  useCharHotkey("/", handleSearch, { allowShift: true })
  useHotkeys("mod+f", handleSearch)
  useHotkeys("mod+p", handleSearch)

  // View switching
  useCharHotkey("m", () => onChangeCalendarView("month"))
  useCharHotkey("w", () => onChangeCalendarView("week"))

  // Navigate to today
  useCharHotkey("t", () => navigateToDate(new Date()))

  // Navigate previous/next day (arrow keys are layout-independent)
  useHotkeys("left", () => throttledNavigate(subDays(activeDate, 1)))
  useHotkeys("right", () => throttledNavigate(addDays(activeDate, 1)))
  useHotkeys("up", () => throttledNavigate(subDays(activeDate, 7)))
  useHotkeys("down", () => throttledNavigate(addDays(activeDate, 7)))

  // vim navigation:
  useCharHotkey("h", () => throttledNavigate(subDays(activeDate, 1)))
  useCharHotkey("l", () => throttledNavigate(addDays(activeDate, 1)))
  useCharHotkey("k", () => throttledNavigate(subDays(activeDate, 7)))
  useCharHotkey("j", () => throttledNavigate(addDays(activeDate, 7)))

  // New event
  useCharHotkey("c", (e) => {
    e.preventDefault()
    if (!canCreate) {
      promptToConnect()
      return
    }
    setDefaultDraftEvent()
    setIsDrafting(true)
  })

  // Open settings
  useHotkeys("mod+comma", (e) => {
    e.preventDefault()
    void openSettingsWindow()
  })

  // Toggle theme (classic ↔ ren)
  useHotkeys("mod+shift+t", (e) => {
    e.preventDefault()
    toggleTheme()
  })
}

// Single-character shortcuts must match the character the user *typed*, not the
// physical key position. By default react-hotkeys-hook matches on `event.code`
// (the US-QWERTY position), so on AZERTY the key labelled "z" fires the "w"
// shortcut. `useKey: true` makes it also match `event.key`, but it does so
// additively and modifier-blind: the physical key still matches, and `Ctrl+C`
// would fire a bare "c" shortcut. We re-check here so the shortcut fires only
// for the produced character with no command modifiers held — while still
// relying on react-hotkeys-hook to suppress firing inside form fields.
function useCharHotkey(
  char: string,
  handler: (e: KeyboardEvent) => void,
  { allowShift = false }: { allowShift?: boolean } = {},
) {
  useHotkeys(
    char,
    (e) => {
      if (e.key.toLowerCase() !== char) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (!allowShift && e.shiftKey) return
      handler(e)
    },
    { useKey: true },
  )
}
