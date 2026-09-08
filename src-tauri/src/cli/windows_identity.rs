//! Pure Store desktop identity rules, also tested on non-Windows hosts.
use std::path::Path;

pub(super) fn is_store_desktop_path(path: &Path) -> bool {
    let normalized = path
        .to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase();
    let parts = normalized.split('\\').collect::<Vec<_>>();
    if parts.len() < 4 {
        return false;
    }
    let tail = &parts[parts.len() - 4..];
    tail[0] == "windowsapps"
        && tail[1].starts_with("openai.codex_")
        && tail[1].len() > "openai.codex_".len()
        && tail[2] == "app"
        && matches!(tail[3], "chatgpt.exe" | "codex.exe" | "codex desktop.exe")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_running_old_store_and_new_launch_version_have_desktop_identity() {
        for path in [
            r"C:\Program Files\WindowsApps\OpenAI.Codex_26.830_x64__publisher\app\Codex.exe",
            "c:/program files/windowsapps/OpenAI.Codex_26.901_x64__publisher/app/ChatGPT.exe",
        ] {
            assert!(is_store_desktop_path(Path::new(path)));
        }
    }

    #[test]
    fn ordinary_chatgpt_and_embedded_cli_are_not_store_desktops() {
        for path in [
            r"C:\Program Files\WindowsApps\OpenAI.ChatGPT_1_x64__publisher\app\ChatGPT.exe",
            r"C:\Program Files\WindowsApps\OpenAI.Codex_1_x64__publisher\app\resources\codex.exe",
            r"C:\Program Files\WindowsApps\OpenAI.Codex_1_x64__publisher\nested\app\ChatGPT.exe",
            r"C:\Tools\ChatGPT.exe",
            r"C:\Tools\codex.exe",
        ] {
            assert!(!is_store_desktop_path(Path::new(path)), "{path}");
        }
    }
}
