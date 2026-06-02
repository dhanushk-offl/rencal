use crate::event_cache::EVENT_CACHE;
use crate::routes::TauResult;
use caldir_core::{Caldir, EventInstanceId};
use chrono::Utc;

pub(super) async fn handler(calendar_slug: String, event_id: String) -> TauResult<()> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;
    let calendar = caldir.calendar(&calendar_slug).map_err(|e| e.to_string())?;

    let id = EventInstanceId::from(event_id.as_str());

    // Delete instance of recurring event
    // (e.g. add "EXDATE" to master event)
    if let Some(recurrence_id) = id.recurrence_id() {
        let exdate = recurrence_id.as_event_time().clone();
        let uid = id.uid().as_str();

        let mut master = None;
        let mut override_event = None;
        for ce in calendar.events().map_err(|e| e.to_string())? {
            if ce.event().uid.as_str() != uid {
                continue;
            }
            if ce.event().recurrence.is_some() {
                master = Some(ce);
            } else if ce.event().event_instance_id() == id {
                override_event = Some(ce);
            }
        }

        if master.is_none() && override_event.is_none() {
            return Err(format!("Event not found: {}", event_id));
        }

        if let Some(ce) = override_event {
            ce.delete().map_err(|e| e.to_string())?;
        }

        if let Some(mut ce) = master {
            let mut event = ce.event().clone();
            if let Some(recurrence) = event.recurrence.as_mut() {
                let exdate_utc = exdate.to_utc();
                let already_excluded = recurrence
                    .exdates
                    .iter()
                    .any(|ex| ex.to_utc() == exdate_utc);
                if !already_excluded {
                    recurrence.exdates.push(exdate);
                    event.last_modified = Some(Utc::now());
                    event.sequence += 1;
                    ce.update(event).map_err(|e| e.to_string())?;
                }
            }
        }

        EVENT_CACHE.invalidate(&calendar_slug);
        return Ok(());
    }

    // Non-recurring event: delete its file directly.
    let cal_event = calendar
        .event_by_instance_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Event not found: {}", event_id))?;
    cal_event.delete().map_err(|e| e.to_string())?;
    EVENT_CACHE.invalidate(&calendar_slug);
    Ok(())
}
