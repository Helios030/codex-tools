//! Apply an current-user-only protected DACL without launching a shell.
use std::{os::windows::ffi::OsStrExt, path::Path};
use windows::{
    core::{PCWSTR, PWSTR},
    Win32::{
        Foundation::{CloseHandle, LocalFree, HANDLE, HLOCAL},
        Security::{
            Authorization::{
                ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
                SDDL_REVISION_1,
            },
            GetTokenInformation, SetFileSecurityW, TokenUser, DACL_SECURITY_INFORMATION,
            PROTECTED_DACL_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR, TOKEN_QUERY, TOKEN_USER,
        },
        System::Threading::{GetCurrentProcess, OpenProcessToken},
    },
};

struct Token(HANDLE);
impl Drop for Token {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}
struct LocalAllocation(HLOCAL);
impl Drop for LocalAllocation {
    fn drop(&mut self) {
        unsafe {
            let _ = LocalFree(Some(self.0));
        }
    }
}

pub(super) fn tighten(path: &Path) -> Result<(), String> {
    fn apply(path: &Path) -> windows::core::Result<()> {
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        if wide[..wide.len() - 1].contains(&0) {
            return Err(windows::core::Error::from_hresult(windows::core::HRESULT(
                0x80070057u32 as i32,
            )));
        }
        unsafe {
            let mut handle = HANDLE::default();
            OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut handle)?;
            let token = Token(handle);
            let mut length = 0;
            let _ = GetTokenInformation(token.0, TokenUser, None, 0, &mut length);
            if length == 0 {
                return Err(windows::core::Error::from_win32());
            }
            // usize storage provides TOKEN_USER alignment and space for its SID.
            let mut buffer = vec![
                0usize;
                (length as usize + std::mem::size_of::<usize>() - 1)
                    / std::mem::size_of::<usize>()
            ];
            GetTokenInformation(
                token.0,
                TokenUser,
                Some(buffer.as_mut_ptr().cast()),
                length,
                &mut length,
            )?;
            let user = &*buffer.as_ptr().cast::<TOKEN_USER>();
            let mut sid = PWSTR::null();
            ConvertSidToStringSidW(user.User.Sid, &mut sid)?;
            let _sid_allocation = LocalAllocation(HLOCAL(sid.0.cast()));
            let sddl = format!("D:P(A;;FA;;;{})", sid.to_string()?);
            let sddl: Vec<u16> = sddl.encode_utf16().chain(Some(0)).collect();
            let mut descriptor = PSECURITY_DESCRIPTOR::default();
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                PCWSTR(sddl.as_ptr()),
                SDDL_REVISION_1,
                &mut descriptor,
                None,
            )?;
            let _descriptor_allocation = LocalAllocation(HLOCAL(descriptor.0));
            // Change only the DACL, leaving owner, group and audit policy intact.
            SetFileSecurityW(
                PCWSTR(wide.as_ptr()),
                DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
                descriptor,
            )
            .ok()
        }
    }
    apply(path)
        .map_err(|error| format!("设置 Windows 私有文件 ACL 失败 {}: {error}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, process::Command};

    #[test]
    fn protected_acl_is_current_user_only_and_repeatable() {
        let root = std::env::temp_dir().join(format!("codex-acl-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("private-'文.txt");
        fs::write(&file, b"synthetic fixture").unwrap();
        for path in [&root, &file] {
            for _ in 0..3 {
                tighten(path).unwrap();
            }
            let escaped = path.to_string_lossy().replace('\'', "''");
            let script = format!(
                r#"
$ErrorActionPreference = 'Stop'
$acl = if ([System.IO.Directory]::Exists('{escaped}')) {{
    [System.IO.Directory]::GetAccessControl('{escaped}')
}} else {{
    [System.IO.File]::GetAccessControl('{escaped}')
}}
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
if (!$acl.AreAccessRulesProtected -or $rules.Count -ne 1) {{ throw 'Unexpected DACL shape' }}
$rule = $rules[0]
if ($rule.IdentityReference.Value -ne $sid -or $rule.IsInherited -or
    $rule.AccessControlType -ne 'Allow' -or $rule.FileSystemRights -ne 'FullControl') {{ throw 'Unexpected access rule' }}
"#
            );
            let output = Command::new("powershell.exe")
                .args(["-NoProfile", "-NonInteractive", "-Command", &script])
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "ACL verification failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
        assert_eq!(fs::read(&file).unwrap(), b"synthetic fixture");
        assert!(tighten(&root.join("missing")).is_err());
        fs::remove_file(&file).unwrap();
        fs::remove_dir(&root).unwrap();
    }
}
