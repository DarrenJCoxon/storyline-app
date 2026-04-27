// Prevents extra console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

#[tauri::command]
fn check_vscode() -> bool {
    #[cfg(target_os = "macos")]
    {
        std::path::Path::new("/Applications/Visual Studio Code.app").exists() || which_code()
    }
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var("LOCALAPPDATA").unwrap_or_default();
        std::path::Path::new(&format!(r"{base}\Programs\Microsoft VS Code\Code.exe")).exists()
    }
    #[cfg(target_os = "linux")]
    {
        which_code()
    }
}

fn which_code() -> bool {
    std::process::Command::new("which")
        .arg("code")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Scaffold the Storyline workspace if missing and return the project folder path.
/// Creates `~/Documents/Storyline/My First Project/.storyline/state.json` so the
/// extension's `workspaceContains:.storyline/state.json` activation event fires
/// when VS Code opens that folder.
fn ensure_workspace() -> Result<std::path::PathBuf, String> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    #[cfg(target_os = "windows")]
    let home = std::env::var("USERPROFILE").map_err(|_| "USERPROFILE not set".to_string())?;

    let project = std::path::PathBuf::from(home)
        .join("Documents")
        .join("Storyline")
        .join("My First Project");

    let state_dir = project.join(".storyline");
    std::fs::create_dir_all(&state_dir)
        .map_err(|e| format!("Could not create workspace folder: {e}"))?;

    let state_file = state_dir.join("state.json");
    if !state_file.exists() {
        std::fs::write(&state_file, "{}\n")
            .map_err(|e| format!("Could not write state.json: {e}"))?;
    }
    Ok(project)
}

/// Path to the bundled `code` CLI shipped inside the VS Code .app on macOS.
/// On Windows it's `bin\code.cmd` next to `Code.exe`. On Linux `code` is on PATH.
fn vscode_cli() -> std::path::PathBuf {
    #[cfg(target_os = "macos")]
    { std::path::PathBuf::from("/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code") }
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var("LOCALAPPDATA").unwrap_or_default();
        std::path::PathBuf::from(format!(r"{base}\Programs\Microsoft VS Code\bin\code.cmd"))
    }
    #[cfg(target_os = "linux")]
    { std::path::PathBuf::from("code") }
}

#[tauri::command]
fn launch_vscode(app: tauri::AppHandle) -> Result<(), String> {
    let project = ensure_workspace()?;
    let project_str = project.to_string_lossy().to_string();

    // Install the bundled VSIX (idempotent — --force reinstalls if already present).
    let vsix_path = app
        .path()
        .resolve("storyline.vsix", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("Could not resolve bundled VSIX: {e}"))?;

    let cli = vscode_cli();
    let install_status = std::process::Command::new(&cli)
        .args([
            "--install-extension",
            &vsix_path.to_string_lossy(),
            "--force",
        ])
        .status()
        .map_err(|e| format!("Could not run code CLI ({}): {e}", cli.display()))?;
    if !install_status.success() {
        return Err(format!("Extension install failed: code exited with {install_status}"));
    }

    // Open the project folder in a NEW VS Code window via the `code` CLI.
    // `-n` forces a new window so the freshly installed extension loads —
    // existing VS Code windows keep stale extension state in memory and
    // won't pick up --install-extension changes until they're reloaded.
    std::process::Command::new(&cli)
        .args(["-n", &project_str])
        .spawn()
        .map_err(|e| format!("Could not open VS Code: {e}"))?;

    // Close the installer window from the Rust side — more reliable than
    // relying on JS permissions. Spawn a thread so we don't block the
    // command return (the JS side briefly shows success before closing).
    let app_handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(800));
        if let Some(win) = app_handle.get_webview_window("main") {
            let _ = win.close();
        }
    });

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![check_vscode, launch_vscode])
        .run(tauri::generate_context!())
        .expect("error while running Storyline installer");
}
