use super::*;

#[test]
fn lean_process_snapshot_retains_switch_identity_fields() {
    let full = sysinfo::System::new_all();
    let mut lean = sysinfo::System::new();
    refresh_windows_switch_processes(&mut lean);
    let pid = sysinfo::get_current_pid().unwrap();
    let expected = full.process(pid).unwrap();
    let actual = lean.process(pid).unwrap();
    assert!(actual.user_id().is_some());
    assert!(actual.exe().is_some());
    assert!(actual.session_id().is_some());
    assert!(actual.start_time() > 0);
    assert_eq!(actual.user_id(), expected.user_id());
    assert_eq!(actual.exe(), expected.exe());
    assert_eq!(actual.parent(), expected.parent());
    assert_eq!(actual.session_id(), expected.session_id());
    assert_eq!(actual.start_time(), expected.start_time());
    refresh_windows_switch_processes(&mut lean);
    let verified =
        verified_windows_desktop_process_ids(&lean, &[std::env::current_exe().unwrap()]).unwrap();
    assert!(verified.contains(&pid));
}

#[test]
fn registered_chatgpt_desktop_is_not_a_cli_or_regular_chatgpt() {
    let package = Path::new(
        r"C:\Program Files\WindowsApps\OpenAI.Codex_26.901.5280.0_x64__2p2nqsd0c76g0\app",
    );
    assert!(is_windows_codex_app_file(&package.join("ChatGPT.exe")));
    assert!(is_windows_codex_app_file(&package.join("Codex.exe")));
    assert!(!is_codex_cli_file(&package.join("Codex.exe")));
    assert!(is_codex_cli_file(
        &package.join("resources").join("codex.exe")
    ));
    assert!(!is_windows_codex_app_file(
        &package.join("resources").join("codex.exe")
    ));
    assert!(!is_windows_codex_app_file(Path::new(
        r"C:\Users\tester\AppData\Local\OpenAI\Codex\bin\version\codex.exe"
    )));
    assert!(!is_windows_codex_app_file(Path::new(
        r"C:\Program Files\WindowsApps\OpenAI.ChatGPT_1_x64__publisher\app\ChatGPT.exe"
    )));
    assert!(!is_windows_codex_app_file(Path::new(
        r"C:\Tools\ChatGPT.exe"
    )));
    assert!(!is_windows_codex_app_file(Path::new(r"C:\Tools\codex.exe")));
}

#[test]
fn windows_paths_are_case_and_separator_insensitive() {
    assert!(windows_paths_equal(
        Path::new(r"C:\Apps\ChatGPT.exe"),
        Path::new("c:/apps/chatgpt.exe")
    ));
    assert!(!windows_paths_equal(
        Path::new(r"C:\Apps\ChatGPT.exe"),
        Path::new(r"C:\Other\ChatGPT.exe")
    ));
}

#[test]
fn desktop_descendants_leave_unrelated_cli_and_chat_clients_alone() {
    let pid = sysinfo::Pid::from_u32;
    let targets = windows_desktop_descendants(
        HashSet::from([pid(10)]),
        &[
            (pid(10), Some(pid(1))),
            (pid(11), Some(pid(10))),
            (pid(12), Some(pid(11))), // desktop-owned CLI
            (pid(20), Some(pid(1))),  // independent CLI
            (pid(21), Some(pid(20))),
            (pid(30), Some(pid(1))), // ordinary ChatGPT
        ],
    );
    assert_eq!(targets, HashSet::from([pid(10), pid(11), pid(12)]));
}

#[test]
fn switching_tool_survives_when_launched_from_codex_terminal() {
    let pid = sysinfo::Pid::from_u32;
    let targets = windows_switch_stop_targets(
        HashSet::from([pid(10)]),
        &[
            (pid(10), Some(pid(1))),
            (pid(11), Some(pid(10))),
            (pid(12), Some(pid(11))), // Codex Tools
            (pid(13), Some(pid(12))), // its WebView/helper
            (pid(20), Some(pid(1))),  // unrelated CLI
        ],
        pid(12),
    );
    assert_eq!(targets, HashSet::from([pid(10), pid(11)]));
}

#[test]
fn missing_launch_targets_fail_before_switch_with_both_causes() {
    let plan = WindowsCodexLaunchPlan {
        desktop: None,
        selected_desktop_path: None,
        fallback_cli: Err("CLI not found".to_string()),
        discovery_error: Some("Store query failed".to_string()),
        as_admin: false,
    };
    let error = plan.validate().unwrap_err();
    assert!(error.contains("未停止应用或更改当前账号"));
    assert!(error.contains("Store query failed"));
    assert!(error.contains("CLI not found"));
}

#[test]
fn desktop_does_not_require_a_separate_cli_installation() {
    let plan = WindowsCodexLaunchPlan {
        desktop: Some(WindowsDesktopTarget::Store(WindowsStoreCodexTarget {
            aumid: "OpenAI.Codex_publisher!App".to_string(),
            executable: PathBuf::from(r"C:\package\app\ChatGPT.exe"),
        })),
        selected_desktop_path: None,
        fallback_cli: Err("CLI not found".to_string()),
        discovery_error: None,
        as_admin: false,
    };
    assert!(plan.validate().is_ok());
    let error = windows_launch_failure(Some("AUMID activation failed HRESULT"), "CLI not found");
    assert!(error.contains("AUMID activation failed HRESULT"));
    assert!(error.contains("CLI not found"));
}

#[test]
#[ignore = "read-only installed Windows desktop diagnostic; run explicitly on a real host"]
fn installed_windows_desktop_diagnostic() {
    let plan = prepare_windows_codex_launch(None, false).expect("resolve installed desktop");
    let target = plan.desktop.as_ref().expect("installed desktop target");
    let system = sysinfo::System::new_all();
    let pids = verified_windows_desktop_process_ids(&system, &[target.executable().to_path_buf()])
        .expect("read current-user desktop process identity");
    println!(
        "desktop={target:?}; verified_pids={pids:?}; standalone_cli_available={}",
        plan.fallback_cli.is_ok()
    );
    assert!(target.executable().is_file());
    // Intentionally do not activate, stop, or switch anything in this diagnostic.
}

#[test]
fn switching_launch_installation_still_selects_running_store_desktop() {
    let old = PathBuf::from(
        r"C:\Program Files\WindowsApps\OpenAI.Codex_26.830_x64__publisher\app\Codex.exe",
    );
    let new = PathBuf::from(
        r"C:\Program Files\WindowsApps\OpenAI.Codex_26.901_x64__publisher\app\ChatGPT.exe",
    );
    // The old algorithm matched only the newly selected launch path.
    assert!(!windows_paths_equal(&old, &new));
    assert!(desktop_path_requires_stop(&old, &[new.clone()]));
    assert!(desktop_path_requires_stop(&new, &[new.clone()]));
    // CLI fallback must also stop a running desktop when discovery found no target.
    assert!(desktop_path_requires_stop(&old, &[]));
    for unrelated in [
        r"C:\Program Files\WindowsApps\OpenAI.ChatGPT_1_x64__publisher\app\ChatGPT.exe",
        r"C:\Program Files\WindowsApps\OpenAI.Codex_26.830_x64__publisher\app\resources\codex.exe",
        r"C:\Tools\codex.exe",
    ] {
        assert!(!desktop_path_requires_stop(
            Path::new(unrelated),
            &[new.clone()]
        ));
    }
}
