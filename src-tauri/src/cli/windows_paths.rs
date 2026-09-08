//! Distinguish Codex desktop installations from CLI and ordinary ChatGPT.
use super::*;

#[cfg(target_os = "windows")]
pub(crate) fn is_windows_store_codex_path(path: &Path) -> bool {
    let normalized = path
        .to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase();
    normalized.contains("\\windowsapps\\openai.codex_")
}

#[cfg(target_os = "windows")]
pub(super) fn find_windows_codex_app_path() -> Option<PathBuf> {
    // Resolve the registered package before scanning directories: Store updates
    // can leave old package directories behind, and the desktop was renamed.
    if let Ok(Some(target)) = find_windows_codex_store_target() {
        return Some(target.executable);
    }
    let mut candidates = Vec::new();

    if let Some(local_app_data) = env::var_os("LOCALAPPDATA").map(PathBuf::from) {
        append_windows_codex_app_candidates_from_dir(
            &mut candidates,
            &local_app_data.join("Microsoft").join("WindowsApps"),
        );
        append_windows_codex_app_candidates_from_dir(
            &mut candidates,
            &local_app_data.join("Programs").join("Codex"),
        );
        append_windows_codex_app_candidates_from_dir(
            &mut candidates,
            &local_app_data.join("Programs").join("OpenAI Codex"),
        );
    }

    if let Some(home) = dirs::home_dir() {
        append_windows_codex_app_candidates_from_dir(
            &mut candidates,
            &home
                .join("AppData")
                .join("Local")
                .join("Microsoft")
                .join("WindowsApps"),
        );
    }

    append_windows_store_package_candidates(&mut candidates);
    append_where_matches(&mut candidates, &["Codex.exe", "Codex Desktop.exe"]);

    first_executable_candidate(candidates)
}

#[cfg(target_os = "windows")]
pub(super) fn append_windows_store_package_candidates(candidates: &mut Vec<PathBuf>) {
    for root in [
        env::var_os("ProgramFiles").map(PathBuf::from),
        env::var_os("ProgramW6432").map(PathBuf::from),
        env::var_os("ProgramFiles(x86)").map(PathBuf::from),
    ]
    .into_iter()
    .flatten()
    {
        let windows_apps = root.join("WindowsApps");
        let Ok(entries) = fs::read_dir(&windows_apps) else {
            continue;
        };

        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let package_name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            if !package_name.contains("codex") {
                continue;
            }

            append_windows_codex_app_candidates_from_dir(candidates, &path);
            append_windows_codex_app_candidates_from_dir(candidates, &path.join("app"));
            append_windows_codex_app_candidates_from_dir(candidates, &path.join("Application"));
        }
    }
}

#[cfg(target_os = "windows")]
pub(super) fn append_where_matches(candidates: &mut Vec<PathBuf>, commands: &[&str]) {
    for command in commands {
        let Ok(output) = Command::new("where.exe").arg(command).output() else {
            continue;
        };
        if !output.status.success() {
            continue;
        }

        for line in String::from_utf8_lossy(&output.stdout).lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                candidates.push(PathBuf::from(trimmed));
            }
        }
    }
}

#[cfg(target_os = "windows")]
pub(super) fn append_windows_codex_app_candidates_from_dir(
    candidates: &mut Vec<PathBuf>,
    dir: &Path,
) {
    for name in ["ChatGPT.exe", "Codex.exe", "Codex Desktop.exe"] {
        candidates.push(dir.join(name));
    }
}

#[cfg(target_os = "windows")]
pub(super) fn first_executable_candidate(candidates: Vec<PathBuf>) -> Option<PathBuf> {
    let mut seen = HashSet::new();
    for candidate in candidates {
        if !seen.insert(candidate.clone()) {
            continue;
        }
        if is_executable_file(&candidate) && is_windows_codex_app_file(&candidate) {
            return Some(candidate);
        }
    }
    None
}

#[cfg(target_os = "windows")]
pub(super) fn is_windows_codex_app_file(path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };

    if !matches_ignore_ascii_case(
        file_name,
        &["chatgpt.exe", "codex.exe", "codex desktop.exe"],
    ) {
        return false;
    }

    let normalized_path = path
        .to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase();
    if normalized_path.contains("\\winget\\links\\")
        || normalized_path.contains("\\shims\\")
        || normalized_path.contains("\\resources\\")
        || normalized_path.contains("\\resources\\bin\\")
    {
        return false;
    }

    let parent_name = path
        .parent()
        .and_then(|parent| parent.file_name())
        .and_then(|value| value.to_str())
        .unwrap_or_default();

    if matches_ignore_ascii_case(parent_name, &["bin"]) {
        return false;
    }
    if is_windows_store_codex_path(path) {
        return super::windows_identity::is_store_desktop_path(path);
    }
    // An unrelated ChatGPT client is not a Codex launcher. Unpackaged legacy
    // Codex needs its Electron resources to distinguish it from a bare CLI.
    !file_name.eq_ignore_ascii_case("chatgpt.exe")
        && path
            .parent()
            .is_some_and(|dir| dir.join("resources").join("app.asar").is_file())
}
