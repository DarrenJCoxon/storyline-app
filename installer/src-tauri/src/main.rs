// Prevents extra console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Emitter, Manager};

fn home_dir() -> std::path::PathBuf {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        std::env::var("HOME").map(std::path::PathBuf::from).unwrap_or_default()
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE").map(std::path::PathBuf::from).unwrap_or_default()
    }
}

fn vscode_app_dir() -> std::path::PathBuf {
    #[cfg(target_os = "macos")]
    {
        home_dir().join("Applications").join("Visual Studio Code.app")
    }
    #[cfg(target_os = "windows")]
    {
        let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
        std::path::PathBuf::from(format!(r"{local}\Programs\Microsoft VS Code"))
    }
    #[cfg(target_os = "linux")]
    {
        home_dir().join(".local").join("share").join("vscode")
    }
}

fn vscode_present() -> bool {
    #[cfg(target_os = "macos")]
    {
        vscode_app_dir().exists() || std::path::Path::new("/Applications/Visual Studio Code.app").exists() || which_code()
    }
    #[cfg(target_os = "windows")]
    {
        let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string());
        std::path::Path::new(&format!(r"{local}\Programs\Microsoft VS Code\Code.exe")).exists()
            || std::path::Path::new(&format!(r"{program_files}\Microsoft VS Code\Code.exe")).exists()
            || which_code()
    }
    #[cfg(target_os = "linux")]
    {
        vscode_app_dir().join("bin").join("code").exists() || which_code()
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

fn tmp_path(name: impl AsRef<std::path::Path>) -> std::path::PathBuf {
    std::env::temp_dir().join(name)
}

/// Download and install VS Code to ~/Applications on macOS using curl + unzip.
/// Emits "vscode-download-progress" events (0–100) so the UI can show real progress.
#[cfg(target_os = "macos")]
fn download_vscode_macos(app: &tauri::AppHandle) -> Result<(), String> {
    // VS Code's canonical update channel — same URL the editor uses for
    // self-updates, always serves the latest stable build, follows redirects
    // to the actual zip on Microsoft's CDN.
    let arch = if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" };
    let url = format!(
        "https://update.code.visualstudio.com/latest/darwin-{}/stable",
        arch
    );
    let tmp_zip = tmp_path(format!("vscode-installer-{}.zip", arch));
    let tmp_dir = tmp_path("vscode-installer-extracted");
    let tmp_zip_str = tmp_zip.to_string_lossy().to_string();
    let tmp_dir_str = tmp_dir.to_string_lossy().to_string();

    // Clean up any previous partial download
    let _ = std::fs::remove_file(&tmp_zip);
    let _ = std::fs::remove_dir_all(&tmp_dir);

    let _ = app.emit("vscode-download-progress", 5u8);

    // Download (~100 MB). -f makes curl exit non-zero on HTTP errors so a
    // captive-portal or 5xx response doesn't write an HTML error page that
    // ditto would then fail to extract with a confusing message.
    let output = std::process::Command::new("curl")
        .args(["-L", "-f", "--silent", "--show-error", "-o", &tmp_zip_str, &url])
        .output()
        .map_err(|e| format!("curl not available: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "VS Code download failed — check your internet connection: {}",
            stderr.trim()
        ));
    }

    let _ = app.emit("vscode-download-progress", 70u8);

    // Extract using ditto — Apple's tool that handles signed .app bundles
    // correctly. /usr/bin/unzip is the legacy Info-ZIP build and fails on
    // VS Code's notarised zip (symlinks inside .app bundle break extraction).
    std::fs::create_dir_all(&tmp_dir)
        .map_err(|e| format!("Could not create temp dir: {e}"))?;
    let output = std::process::Command::new("/usr/bin/ditto")
        .args(["-x", "-k", &tmp_zip_str, &tmp_dir_str])
        .output()
        .map_err(|e| format!("ditto not available: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "VS Code archive extraction failed (exit {}): {}",
            output.status,
            stderr.trim()
        ));
    }

    let _ = app.emit("vscode-download-progress", 88u8);

    // Move .app to ~/Applications (overwrites any existing install)
    let src = tmp_dir.join("Visual Studio Code.app");
    let dst = vscode_app_dir();
    let dst_str = dst.to_string_lossy().to_string();
    if dst.exists() {
        std::fs::remove_dir_all(&dst)
            .map_err(|e| format!("Could not remove existing VS Code: {e}"))?;
    }
    std::fs::create_dir_all(dst.parent().unwrap())
        .map_err(|e| format!("Could not create ~/Applications: {e}"))?;
    std::process::Command::new("mv")
        .args([&src.to_string_lossy().to_string(), &dst_str])
        .status()
        .map_err(|e| format!("Could not move VS Code to Applications: {e}"))?;

    // Clean up
    let _ = std::fs::remove_file(&tmp_zip);
    let _ = std::fs::remove_dir_all(&tmp_dir);

    let _ = app.emit("vscode-download-progress", 100u8);
    Ok(())
}

#[cfg(target_os = "windows")]
fn download_vscode_windows(app: &tauri::AppHandle) -> Result<(), String> {
    let url = "https://update.code.visualstudio.com/latest/win32-x64-archive/stable";
    let tmp_zip = tmp_path("vscode-installer.zip");
    let tmp_dir = tmp_path("vscode-installer-extracted");
    let tmp_zip_str = tmp_zip.to_string_lossy().to_string();
    let tmp_dir_str = tmp_dir.to_string_lossy().to_string();

    let _ = std::fs::remove_file(&tmp_zip);
    let _ = std::fs::remove_dir_all(&tmp_dir);

    let _ = app.emit("vscode-download-progress", 5u8);

    // Download with PowerShell
    let ps_cmd = format!(
        "Invoke-WebRequest -Uri '{}' -OutFile '{}' -UseBasicParsing",
        url,
        tmp_zip_str.replace('\\', "/")
    );
    let status = std::process::Command::new("powershell.exe")
        .args(["-Command", &ps_cmd])
        .status()
        .map_err(|e| format!("PowerShell not available: {e}"))?;
    if !status.success() {
        return Err("VS Code download failed — check your internet connection".to_string());
    }

    let _ = app.emit("vscode-download-progress", 70u8);

    // Extract with PowerShell
    std::fs::create_dir_all(&tmp_dir)
        .map_err(|e| format!("Could not create temp dir: {e}"))?;
    let ps_expand = format!(
        "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
        tmp_zip_str.replace('\\', "/"),
        tmp_dir_str.replace('\\', "/")
    );
    let status = std::process::Command::new("powershell.exe")
        .args(["-Command", &ps_expand])
        .status()
        .map_err(|e| format!("Archive extraction failed: {e}"))?;
    if !status.success() {
        return Err("VS Code archive extraction failed".to_string());
    }

    let _ = app.emit("vscode-download-progress", 88u8);

    let dst = vscode_app_dir();
    if dst.exists() {
        std::fs::remove_dir_all(&dst)
            .map_err(|e| format!("Could not remove existing VS Code: {e}"))?;
    }
    std::fs::create_dir_all(&dst)
        .map_err(|e| format!("Could not create install dir: {e}"))?;

    // The zip extracts to a single folder; find it
    let extracted: std::path::PathBuf = std::fs::read_dir(&tmp_dir)
        .map_err(|e| format!("Could not read extracted dir: {e}"))?
        .filter_map(|e| e.ok())
        .find(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.path())
        .ok_or_else(|| "Could not find extracted VS Code folder".to_string())?;

    // Move contents into dst
    for entry in std::fs::read_dir(extracted)
        .map_err(|e| format!("Could not read VS Code dir: {e}"))?
    {
        let entry = entry.map_err(|e| format!("Dir entry error: {e}"))?;
        let dst_path = dst.join(entry.file_name());
        if dst_path.exists() {
            let _ = std::fs::remove_dir_all(&dst_path);
            let _ = std::fs::remove_file(&dst_path);
        }
        std::fs::rename(entry.path(), dst_path)
            .map_err(|e| format!("Could not move extracted file: {e}"))?;
    }

    let _ = std::fs::remove_file(&tmp_zip);
    let _ = std::fs::remove_dir_all(&tmp_dir);

    let _ = app.emit("vscode-download-progress", 100u8);
    Ok(())
}

#[cfg(target_os = "linux")]
fn download_vscode_linux(app: &tauri::AppHandle) -> Result<(), String> {
    let arch = if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" };
    let url = format!(
        "https://update.code.visualstudio.com/latest/linux-{}/stable",
        arch
    );
    let tmp_tar = tmp_path(format!("vscode-installer-{}.tar.gz", arch));
    let tmp_dir = tmp_path("vscode-installer-extracted");
    let tmp_tar_str = tmp_tar.to_string_lossy().to_string();
    let tmp_dir_str = tmp_dir.to_string_lossy().to_string();

    let _ = std::fs::remove_file(&tmp_tar);
    let _ = std::fs::remove_dir_all(&tmp_dir);

    let _ = app.emit("vscode-download-progress", 5u8);

    let status = std::process::Command::new("curl")
        .args(["-L", "--silent", "--show-error", "-o", &tmp_tar_str, &url])
        .status()
        .map_err(|e| format!("curl not available: {e}"))?;
    if !status.success() {
        return Err("VS Code download failed — check your internet connection".to_string());
    }

    let _ = app.emit("vscode-download-progress", 70u8);

    std::fs::create_dir_all(&tmp_dir)
        .map_err(|e| format!("Could not create temp dir: {e}"))?;
    let status = std::process::Command::new("tar")
        .args(["-xzf", &tmp_tar_str, "-C", &tmp_dir_str, "--strip-components=1"])
        .status()
        .map_err(|e| format!("tar not available: {e}"))?;
    if !status.success() {
        return Err("VS Code archive extraction failed".to_string());
    }

    let _ = app.emit("vscode-download-progress", 88u8);

    let dst = vscode_app_dir();
    if dst.exists() {
        std::fs::remove_dir_all(&dst)
            .map_err(|e| format!("Could not remove existing VS Code: {e}"))?;
    }
    std::fs::create_dir_all(&dst)
        .map_err(|e| format!("Could not create install dir: {e}"))?;

    for entry in std::fs::read_dir(&tmp_dir)
        .map_err(|e| format!("Could not read extracted dir: {e}"))?
    {
        let entry = entry.map_err(|e| format!("Dir entry error: {e}"))?;
        let dst_path = dst.join(entry.file_name());
        if dst_path.exists() {
            let _ = std::fs::remove_dir_all(&dst_path);
            let _ = std::fs::remove_file(&dst_path);
        }
        std::fs::rename(entry.path(), dst_path)
            .map_err(|e| format!("Could not move extracted file: {e}"))?;
    }

    let _ = std::fs::remove_file(&tmp_tar);
    let _ = std::fs::remove_dir_all(&tmp_dir);

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

/// Path to the `code` CLI — prefers user-local install, falls back to system.
fn vscode_cli() -> std::path::PathBuf {
    #[cfg(target_os = "macos")]
    {
        let user = vscode_app_dir().join("Contents").join("Resources").join("app").join("bin").join("code");
        let system = std::path::PathBuf::from("/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code");
        if user.exists() { user } else { system }
    }
    #[cfg(target_os = "windows")]
    {
        let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string());
        let user_cli = format!(r"{local}\Programs\Microsoft VS Code\bin\code.cmd");
        let system_cli = format!(r"{program_files}\Microsoft VS Code\bin\code.cmd");
        let downloaded = vscode_app_dir().join("bin").join("code.cmd");
        if downloaded.exists() { downloaded }
        else if std::path::Path::new(&user_cli).exists() { std::path::PathBuf::from(user_cli) }
        else { std::path::PathBuf::from(system_cli) }
    }
    #[cfg(target_os = "linux")]
    {
        let downloaded = vscode_app_dir().join("bin").join("code");
        if downloaded.exists() { downloaded } else { std::path::PathBuf::from("code") }
    }
}

/// Download VS Code (if missing) and install the bundled Storyline extension.
/// Emits "vscode-download-progress" (0–100) during download and
/// "install-phase" with one of: "download", "extension", "done".
#[tauri::command]
fn install_storyline(app: tauri::AppHandle) -> Result<(), String> {
    if !vscode_present() {
        let _ = app.emit("install-phase", "download");
        #[cfg(target_os = "macos")]
        { download_vscode_macos(&app)?; }
        #[cfg(target_os = "windows")]
        { download_vscode_windows(&app)?; }
        #[cfg(target_os = "linux")]
        { download_vscode_linux(&app)?; }
    } else {
        let _ = app.emit("vscode-download-progress", 100u8);
    }

    // Workspace folder
    ensure_workspace()?;

    // Install bundled extension
    let _ = app.emit("install-phase", "extension");
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

    let _ = app.emit("install-phase", "done");
    Ok(())
}

#[tauri::command]
fn launch_vscode(app: tauri::AppHandle) -> Result<(), String> {
    // Defensive: if the user somehow reached Done without VS Code present
    // (e.g. install_storyline was skipped), run the full install now.
    if !vscode_present() {
        install_storyline(app.clone())?;
    }

    let project = ensure_workspace()?;
    let project_str = project.to_string_lossy().to_string();

    let cli = vscode_cli();
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
        .invoke_handler(tauri::generate_handler![check_vscode, install_storyline, launch_vscode])
        .run(tauri::generate_context!())
        .expect("error while running Storyline installer");
}
