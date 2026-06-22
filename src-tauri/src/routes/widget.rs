use std::sync::OnceLock;

use rencal_config::RencalConfig;

use crate::routes::TauResult;
use tauri::{AppHandle, Manager, Runtime};

#[taurpc::procedures(path = "widget")]
pub trait WidgetApi {
    async fn create_widget_window<R: Runtime>(
        app_handle: AppHandle<R>,
        width: f64,
        height: f64,
    ) -> TauResult<()>;
    async fn destroy_widget_window<R: Runtime>(app_handle: AppHandle<R>) -> TauResult<()>;
    async fn set_widget_margins<R: Runtime>(
        app_handle: AppHandle<R>,
        top: f64,
        left: f64,
    ) -> TauResult<()>;
}

#[derive(Clone)]
pub struct WidgetApiImpl;

#[taurpc::resolvers]
impl WidgetApi for WidgetApiImpl {
    async fn create_widget_window<R: Runtime>(
        self,
        app: AppHandle<R>,
        width: f64,
        height: f64,
    ) -> TauResult<()> {
        if app.get_webview_window("widget").is_some() {
            return Ok(());
        }

        // Determine monitor bounds for positioning
        let (mon_w, mon_h) = app
            .primary_monitor()
            .ok()
            .flatten()
            .map(|m| {
                let s = m.size();
                (s.width as f64, s.height as f64)
            })
            .unwrap_or((1920.0, 1080.0));
        let max_x = (mon_w - width).max(0.0);
        let max_y = (mon_h - height).max(0.0);

        // One-time migration for widget placement (version 0 → 1).
        // Resets corrupt saved positions from the old buggy drag code
        // (which saved mouse deltas instead of absolute coordinates).
        let mut config = RencalConfig::load();
        if config.widget_placement_version != Some(1) {
            let (dx, dy) = (max_x - 16.0, 48.0);
            config.widget_x = Some(dx);
            config.widget_y = Some(dy);
            config.widget_placement_version = Some(1);
            config.save().ok();
        }
        let x = config.widget_x.unwrap_or(max_x - 16.0).clamp(0.0, max_x);
        let y = config.widget_y.unwrap_or(48.0).clamp(0.0, max_y);

        let window = tauri::WebviewWindowBuilder::new(
            &app,
            "widget",
            tauri::WebviewUrl::App("?appWindow=widget".into()),
        )
        .inner_size(width, height)
        .position(x, y)
        .always_on_bottom(true)
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .title("renCal Widget")
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;

        #[cfg(target_os = "linux")]
        if !sys_apply_layer_shell(&app, x, y, width, height) {
            let _ = window.show();
        }
        #[cfg(not(target_os = "linux"))]
        window.show().map_err(|e| e.to_string())?;

        Ok(())
    }

    async fn destroy_widget_window<R: Runtime>(self, app: AppHandle<R>) -> TauResult<()> {
        if let Some(window) = app.get_webview_window("widget") {
            window.close().map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    async fn set_widget_margins<R: Runtime>(
        self,
        app: AppHandle<R>,
        top: f64,
        left: f64,
    ) -> TauResult<()> {
        #[cfg(target_os = "linux")]
        {
            use gtk::glib::object::ObjectType;
            let Some(window) = app.get_webview_window("widget") else {
                return Ok(());
            };

            // Use cached window dimensions from LayerShellState instead of
            // outer_size(), which can return monitor size on Wayland
            // layer-shell windows, breaking horizontal clamping.
            let (mon_w, mon_h) = app
                .primary_monitor()
                .ok()
                .flatten()
                .map(|m| {
                    let s = m.size();
                    (s.width as f64, s.height as f64)
                })
                .unwrap_or((1920.0, 1080.0));
            let (max_top, max_left) = LAYER_SHELL
                .get()
                .map(|s| {
                    let mt = (mon_h - s.win_h).max(0.0);
                    let ml = (mon_w - s.win_w).max(0.0);
                    (mt, ml)
                })
                .unwrap_or((mon_h, mon_w));
            let clamped_top = top.clamp(0.0, max_top);
            let clamped_left = left.clamp(0.0, max_left);

            let gtk_window = window.gtk_window().map_err(|e| e.to_string())?;
            let ptr = gtk_window.as_ptr() as *mut std::ffi::c_void;
            let _guard = gtk_window.clone();
            std::mem::forget(_guard);
            let send_ptr = SendPtr(ptr);
            app.run_on_main_thread(move || {
                layer_shell_set_margins(send_ptr, clamped_top as i32, clamped_left as i32);
            })
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// gtk-layer-shell integration (Linux only)
// ---------------------------------------------------------------------------

/// Wrapper to mark a raw pointer as Send for use in closures.
#[cfg(target_os = "linux")]
struct SendPtr(*mut std::ffi::c_void);
#[cfg(target_os = "linux")]
unsafe impl Send for SendPtr {}

#[cfg(target_os = "linux")]
type SetMarginFn = unsafe extern "C" fn(*mut std::ffi::c_void, u32, i32);

#[cfg(target_os = "linux")]
static LAYER_SHELL: OnceLock<LayerShellState> = OnceLock::new();

#[cfg(target_os = "linux")]
struct LayerShellState {
    #[allow(dead_code)]
    lib: libloading::Library,
    set_margin: SetMarginFn,
    win_w: f64,
    win_h: f64,
}

/// Returns `true` if the layer-shell dispatch was queued (window will be shown
/// by the closure). Returns `false` if the dispatch failed — the caller should
/// show the window directly as a fallback.
#[cfg(target_os = "linux")]
fn sys_apply_layer_shell<R: Runtime>(
    app: &AppHandle<R>,
    x: f64,
    y: f64,
    win_w: f64,
    win_h: f64,
) -> bool {
    use gtk::glib::object::ObjectType;

    let Some(window) = app.get_webview_window("widget") else {
        return false;
    };

    let gtk_window = match window.gtk_window() {
        Ok(w) => w,
        Err(e) => {
            log::warn!("Could not get GTK window for layer shell: {e}");
            return false;
        }
    };

    let ptr = gtk_window.as_ptr() as *mut std::ffi::c_void;
    let _guard = gtk_window.clone();
    std::mem::forget(_guard);

    let send_app = app.clone();
    let send_ptr = SendPtr(ptr);
    app.run_on_main_thread(move || {
        init_layer_shell_and_position(send_ptr, x, y, win_w, win_h);
        if let Some(win) = send_app.get_webview_window("widget") {
            let _ = win.show();
        }
    })
    .is_ok()
}

#[cfg(target_os = "linux")]
fn init_layer_shell_and_position(send_ptr: SendPtr, x: f64, y: f64, win_w: f64, win_h: f64) {
    let window_ptr = send_ptr.0;
    use libloading::{Library, Symbol};

    type InitFn = unsafe extern "C" fn(*mut std::ffi::c_void) -> i32;
    type SetLayerFn = unsafe extern "C" fn(*mut std::ffi::c_void, u32);
    type SetAnchorFn = unsafe extern "C" fn(*mut std::ffi::c_void, u32, i32);

    let lib = match unsafe { Library::new("libgtk-layer-shell.so") } {
        Ok(lib) => lib,
        Err(e) => {
            log::warn!("libgtk-layer-shell.so not found, widget stays in always_on_bottom: {e}");
            return;
        }
    };

    let init: Symbol<InitFn> = match unsafe { lib.get(b"gtk_layer_init_for_window") } {
        Ok(s) => s,
        Err(e) => {
            log::warn!("gtk_layer_init_for_window not found: {e}");
            return;
        }
    };
    let set_layer: Symbol<SetLayerFn> = match unsafe { lib.get(b"gtk_layer_set_layer") } {
        Ok(s) => s,
        Err(e) => {
            log::warn!("gtk_layer_set_layer not found: {e}");
            return;
        }
    };
    let set_anchor: Symbol<SetAnchorFn> = match unsafe { lib.get(b"gtk_layer_set_anchor") } {
        Ok(s) => s,
        Err(e) => {
            log::warn!("gtk_layer_set_anchor not found: {e}");
            return;
        }
    };
    let set_margin: Symbol<SetMarginFn> = match unsafe { lib.get(b"gtk_layer_set_margin") } {
        Ok(s) => s,
        Err(e) => {
            log::warn!("gtk_layer_set_margin not found: {e}");
            return;
        }
    };

    unsafe {
        init(window_ptr);
        set_layer(window_ptr, 1); // GTK_LAYER_SHELL_LAYER_BOTTOM (above wallpaper, behind windows)
        set_anchor(window_ptr, 2, 1); // GTK_LAYER_SHELL_EDGE_TOP
        set_anchor(window_ptr, 0, 1); // GTK_LAYER_SHELL_EDGE_LEFT
        set_margin(window_ptr, 0, x as i32); // left margin = saved x
        set_margin(window_ptr, 2, y as i32); // top margin = saved y
    }

    let set_margin_ptr: SetMarginFn = *set_margin;
    drop(set_margin);
    drop(set_anchor);
    drop(set_layer);
    drop(init);

    let _ = LAYER_SHELL.set(LayerShellState {
        lib,
        set_margin: set_margin_ptr,
        win_w,
        win_h,
    });
}

#[cfg(target_os = "linux")]
fn layer_shell_set_margins(send_ptr: SendPtr, top: i32, left: i32) {
    let window_ptr = send_ptr.0;
    if let Some(state) = LAYER_SHELL.get() {
        unsafe {
            (state.set_margin)(window_ptr, 0, left); // EDGE_LEFT
            (state.set_margin)(window_ptr, 2, top); // EDGE_TOP
        }
    }
}
