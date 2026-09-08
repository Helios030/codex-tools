//! Windows elevation and command argument encoding.
use super::*;
use windows::core::PCWSTR;
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

#[cfg(target_os = "windows")]
pub(crate) fn launch_elevated_process(program: &Path, args: &[String]) -> Result<(), String> {
    let operation = wide_null("runas");
    let file = wide_os_null(program.as_os_str());
    let parameters_text = args
        .iter()
        .map(|arg| quote_windows_arg(arg))
        .collect::<Vec<_>>()
        .join(" ");
    let parameters = wide_null(&parameters_text);
    let directory = program
        .parent()
        .map(|parent| wide_os_null(parent.as_os_str()));

    let parameters_ptr = if parameters_text.is_empty() {
        PCWSTR::null()
    } else {
        PCWSTR(parameters.as_ptr())
    };
    let directory_ptr = directory
        .as_ref()
        .map(|value| PCWSTR(value.as_ptr()))
        .unwrap_or_else(PCWSTR::null);

    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(operation.as_ptr()),
            PCWSTR(file.as_ptr()),
            parameters_ptr,
            directory_ptr,
            SW_SHOWNORMAL,
        )
    };
    let code = result.0 as isize;
    if code <= 32 {
        Err(format!(
            "以管理员身份启动 Codex 失败 {}，ShellExecuteW 返回码 {code}",
            program.display()
        ))
    } else {
        Ok(())
    }
}

#[cfg(target_os = "windows")]
pub(super) fn wide_null(value: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;

    std::ffi::OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(target_os = "windows")]
pub(super) fn wide_os_null(value: &std::ffi::OsStr) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;

    value.encode_wide().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
pub(super) fn quote_windows_arg(value: &str) -> String {
    if value.is_empty() {
        return "\"\"".to_string();
    }

    if !value
        .chars()
        .any(|item| item.is_whitespace() || item == '"')
    {
        return value.to_string();
    }

    let mut quoted = String::from("\"");
    let mut backslashes = 0usize;
    for item in value.chars() {
        match item {
            '\\' => backslashes += 1,
            '"' => {
                quoted.push_str(&"\\".repeat(backslashes * 2 + 1));
                quoted.push('"');
                backslashes = 0;
            }
            _ => {
                quoted.push_str(&"\\".repeat(backslashes));
                backslashes = 0;
                quoted.push(item);
            }
        }
    }
    quoted.push_str(&"\\".repeat(backslashes * 2));
    quoted.push('"');
    quoted
}
