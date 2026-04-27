// Prevents extra console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Emitter, Manager};

fn vscode_present() -> bool {
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

#[tauri::command]
fn check_vscode() -> bool {
    // Set STORYLINE_SIMULATE_NO_VSCODE=1 to test the download path without
    // uninstalling VS Code (e.g. open the .app from Terminal with that env var).
    if std::env::var("STORYLINE_SIMULATE_NO_VSCODE").is_ok() {
        return false;
    }
    vscode_present()
}

fn which_code() -> bool {
    std::process::Command::new("which")
        .arg("code")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Download and install VS Code to /Applications on macOS using curl + unzip.
/// Emits "vscode-download-progress" events (0–100) so the UI can show real progress.
#[cfg(target_os = "macos")]
fn download_vscode_macos(app: &tauri::AppHandle) -> Result<(), String> {
    let arch = if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" };
    let url = format!(
        "https://code.visualstudio.com/sha/download?build=stable&os=darwin-{}",
        arch
    );
    let tmp_zip = format!("/tmp/vscode-installer-{}.zip", arch);
    let tmp_dir = "/tmp/vscode-installer-extracted";

    // Clean up any previous partial download
    let _ = std::fs::remove_file(&tmp_zip);
    let _ = std::fs::remove_dir_all(tmp_dir);

    let _ = app.emit("vscode-download-progress", 5u8);

    // Download (~100 MB) — curl follows redirects and shows no output
    let status = std::process::Command::new("curl")
        .args(["-L", "--silent", "--show-error", "-o", &tmp_zip, &url])
        .status()
        .map_err(|e| format!("curl not available: {e}"))?;
    if !status.success() {
        return Err("VS Code download failed — check your internet connection".to_string());
    }

    let _ = app.emit("vscode-download-progress", 70u8);

    // Extract the zip
    std::fs::create_dir_all(tmp_dir)
        .map_err(|e| format!("Could not create temp dir: {e}"))?;
    let status = std::process::Command::new("unzip")
        .args(["-q", "-o", &tmp_zip, "-d", tmp_dir])
        .status()
        .map_err(|e| format!("unzip failed: {e}"))?;
    if !status.success() {
        return Err("VS Code archive extraction failed".to_string());
    }

    let _ = app.emit("vscode-download-progress", 88u8);

    // Move .app to /Applications (overwrites any existing install)
    let src = format!("{}/Visual Studio Code.app", tmp_dir);
    let dst = "/Applications/Visual Studio Code.app";
    if std::path::Path::new(dst).exists() {
        std::fs::remove_dir_all(dst)
            .map_err(|e| format!("Could not remove existing VS Code: {e}"))?;
    }
    std::process::Command::new("mv")
        .args([&src, dst])
        .status()
        .map_err(|e| format!("Could not move VS Code to Applications: {e}"))?;

    // Clean up
    let _ = std::fs::remove_file(&tmp_zip);
    let _ = std::fs::remove_dir_all(tmp_dir);

    let _ = app.emit("vscode-download-progress", 100u8);
    Ok(())
}

/// Scaffold the Storyline workspace if missing and return the project folder path.
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
    // Download VS Code if not present (handles the fresh-install path)
    #[cfg(target_os = "macos")]
    if !vscode_present() {
        download_vscode_macos(&app)?;
    }

    let project = ensure_workspace()?;
    let project_str = project.to_string_lossy().to_string();

    let vsix_path = app
        .path()
        .resolve("storyline.vsix", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("Could not resolve bundled VSIX: {e}"))?;

    let cli = vscode_cli();
    let install_status = std::process::Command::new(&cli)
        .args(["--install-extension", &vsix_path.to_string_lossy(), "--force"])
        .status()
        .map_err(|e| format!("Could not run code CLI ({}): {e}", cli.display()))?;
    if !install_status.success() {
        return Err(format!("Extension install failed: code exited with {install_status}"));
    }

    std::process::Command::new(&cli)
        .args(["-n", &project_str])
        .spawn()
        .map_err(|e| format!("Could not open VS Code: {e}"))?;

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
