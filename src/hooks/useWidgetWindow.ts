import { useCallback, useEffect, useState } from "react"

import { rpc } from "@/rpc"

import { useSettings } from "@/contexts/SettingsContext"

export function useWidgetWindow() {
  const { widgetEnabled, settingsLoaded } = useSettings()
  const [error, setError] = useState<string | null>(null)

  const ensureWindow = useCallback(async () => {
    try {
      await rpc.widget.create_widget_window(300, 260)
      setError(null)
    } catch (e) {
      console.error("Failed to create widget window:", e)
      setError(String(e))
    }
  }, [])

  const destroyWindow = useCallback(async () => {
    try {
      await rpc.widget.destroy_widget_window()
    } catch (e) {
      console.error("Failed to destroy widget window:", e)
    }
  }, [])

  useEffect(() => {
    if (!settingsLoaded) return

    if (widgetEnabled) {
      void ensureWindow()
    } else {
      void destroyWindow()
    }
  }, [widgetEnabled, settingsLoaded, ensureWindow, destroyWindow])

  return { error }
}
