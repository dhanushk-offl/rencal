import { useId } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

import { useSettings } from "@/contexts/SettingsContext"

export function WidgetsPage() {
  const { widgetEnabled, setWidgetEnabled, settingsLoaded } = useSettings()
  const id = useId()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 w-[400px]">
        <div className="flex items-center gap-3">
          <Checkbox
            id={id}
            checked={widgetEnabled}
            onCheckedChange={(checked) => void setWidgetEnabled(checked === true)}
            className="cursor-pointer"
            disabled={!settingsLoaded}
          />
          <Label htmlFor={id} className="cursor-pointer text-sm">
            Show desktop widget
          </Label>
        </div>
        <p className="text-xs text-muted-foreground pl-7">
          Displays a compact calendar widget on your desktop showing the current date, a mini
          calendar, and today&apos;s events. The widget persists across restarts.
        </p>
      </div>

      <PreviewSection />
    </div>
  )
}

function PreviewSection() {
  const now = new Date()
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase()
  const date = now.getDate()
  const month = now.toLocaleDateString("en-US", { month: "long" }).toUpperCase()

  const year = now.getFullYear()
  const monthIndex = now.getMonth()
  const firstDay = new Date(year, monthIndex, 1).getDay()
  const firstDayMonday = firstDay === 0 ? 6 : firstDay - 1
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const today = now.getDate()

  return (
    <div className="border border-divider rounded-lg p-4 w-[360px] bg-background">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-[11px] font-semibold text-muted-foreground tracking-wider">
            {dayName}
          </div>
          <div className="text-[56px] font-bold leading-none mt-0">{date}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold text-muted-foreground tracking-wider">
            {month}
          </div>
          <div className="mt-2">
            <div className="grid grid-cols-7 text-[11px]">
              {["M", "T", "W", "T", "F", "S", "S"].map((d) => (
                <div
                  key={d}
                  className="w-[34px] h-[22px] flex items-center justify-center text-muted-foreground font-medium"
                >
                  {d}
                </div>
              ))}
              {Array.from({ length: firstDayMonday }).map((_, i) => (
                <div key={`e-${i}`} className="w-[34px] h-[26px]" />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <div
                  key={d}
                  className={`w-[34px] h-[26px] flex items-center justify-center border ${
                    d === today
                      ? "border-foreground text-foreground font-bold"
                      : "border-transparent text-foreground"
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="text-[13px] font-semibold text-foreground mt-3 mb-1.5">
        Today&apos;s Tasks
      </div>
      <div className="text-[11px] text-muted-foreground">No tasks for today 🎉</div>
    </div>
  )
}
