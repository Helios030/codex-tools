use std::env;
use std::sync::OnceLock;

use serde_json::Value;
use tauri::AppHandle;

use crate::models::AppLocale;
use crate::models::TrayUsageDisplayMode;
use crate::store::load_store;

static ZH_CN_MESSAGES: OnceLock<Value> = OnceLock::new();
static EN_US_MESSAGES: OnceLock<Value> = OnceLock::new();
static JA_JP_MESSAGES: OnceLock<Value> = OnceLock::new();
static KO_KR_MESSAGES: OnceLock<Value> = OnceLock::new();
static RU_RU_MESSAGES: OnceLock<Value> = OnceLock::new();

fn zh_cn_messages() -> &'static Value {
    ZH_CN_MESSAGES.get_or_init(|| {
        parse_locale(
            "zh-CN",
            include_str!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../src/i18n/locales/zh-CN.json"
            )),
        )
    })
}

fn en_us_messages() -> &'static Value {
    EN_US_MESSAGES.get_or_init(|| {
        parse_locale(
            "en-US",
            include_str!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../src/i18n/locales/en-US.json"
            )),
        )
    })
}

fn ja_jp_messages() -> &'static Value {
    JA_JP_MESSAGES.get_or_init(|| {
        parse_locale(
            "ja-JP",
            include_str!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../src/i18n/locales/ja-JP.json"
            )),
        )
    })
}

fn ko_kr_messages() -> &'static Value {
    KO_KR_MESSAGES.get_or_init(|| {
        parse_locale(
            "ko-KR",
            include_str!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../src/i18n/locales/ko-KR.json"
            )),
        )
    })
}

fn ru_ru_messages() -> &'static Value {
    RU_RU_MESSAGES.get_or_init(|| {
        parse_locale(
            "ru-RU",
            include_str!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../src/i18n/locales/ru-RU.json"
            )),
        )
    })
}

fn parse_locale(code: &str, raw: &str) -> Value {
    serde_json::from_str(raw).unwrap_or_else(|error| {
        panic!("failed to parse locale JSON {code}: {error}");
    })
}

fn locale_messages(locale: AppLocale) -> &'static Value {
    match locale {
        AppLocale::ZhCn => zh_cn_messages(),
        AppLocale::EnUs => en_us_messages(),
        AppLocale::JaJp => ja_jp_messages(),
        AppLocale::KoKr => ko_kr_messages(),
        AppLocale::RuRu => ru_ru_messages(),
    }
}

fn lookup_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut current = value;
    for segment in path {
        current = current.get(*segment)?;
    }
    current.as_str()
}

fn text(locale: AppLocale, path: &[&str]) -> &'static str {
    lookup_path(locale_messages(locale), path)
        .or_else(|| lookup_path(locale_messages(AppLocale::default()), path))
        .unwrap_or("")
}

fn fill_template(template: &str, replacements: &[(&str, String)]) -> String {
    let mut output = template.to_string();
    for (key, value) in replacements {
        output = output.replace(&format!("{{{{{key}}}}}"), value);
    }
    output
}

pub(crate) fn detect_system_locale() -> AppLocale {
    let candidates = [
        env::var("LC_ALL").ok(),
        env::var("LC_MESSAGES").ok(),
        env::var("LANG").ok(),
    ];

    for candidate in candidates.into_iter().flatten() {
        let normalized = candidate.to_lowercase();
        if normalized.starts_with("zh") {
            return AppLocale::ZhCn;
        }
        if normalized.starts_with("en") {
            return AppLocale::EnUs;
        }
        if normalized.starts_with("ja") {
            return AppLocale::JaJp;
        }
        if normalized.starts_with("ko") {
            return AppLocale::KoKr;
        }
        if normalized.starts_with("ru") {
            return AppLocale::RuRu;
        }
    }

    AppLocale::default()
}

pub(crate) fn app_locale(app: &AppHandle) -> AppLocale {
    load_store(app)
        .map(|store| store.settings.locale)
        .unwrap_or_else(|_| detect_system_locale())
}

pub(crate) fn tray_usage_mode_label(locale: AppLocale, mode: TrayUsageDisplayMode) -> &'static str {
    match mode {
        TrayUsageDisplayMode::Used => text(locale, &["settings", "trayUsageDisplay", "used"]),
        TrayUsageDisplayMode::Remaining => {
            text(locale, &["settings", "trayUsageDisplay", "remaining"])
        }
        TrayUsageDisplayMode::FiveHourRemaining => text(
            locale,
            &["settings", "trayUsageDisplay", "fiveHourRemaining"],
        ),
        TrayUsageDisplayMode::OneWeekRemaining => text(
            locale,
            &["settings", "trayUsageDisplay", "oneWeekRemaining"],
        ),
        TrayUsageDisplayMode::Hidden => text(locale, &["settings", "trayUsageDisplay", "hidden"]),
    }
}

pub(crate) fn tray_current_prefix(locale: AppLocale) -> String {
    format!("[{}] ", text(locale, &["accountCard", "currentStamp"]))
}

pub(crate) fn tray_usage_heading(locale: AppLocale) -> &'static str {
    text(locale, &["tray", "usageHeading"])
}

pub(crate) fn tray_display_mode_label(locale: AppLocale) -> &'static str {
    text(locale, &["settings", "trayUsageDisplay", "label"])
}

pub(crate) fn tray_current_label(locale: AppLocale) -> &'static str {
    text(locale, &["tray", "currentLabel"])
}

pub(crate) fn tray_current_account_label(locale: AppLocale) -> &'static str {
    text(locale, &["tray", "currentAccountLabel"])
}

pub(crate) fn tray_no_current(locale: AppLocale) -> &'static str {
    text(locale, &["tray", "noCurrent"])
}

pub(crate) fn tray_no_accounts(locale: AppLocale) -> &'static str {
    text(locale, &["tray", "noAccounts"])
}

pub(crate) fn tray_all_accounts(locale: AppLocale, count: usize) -> String {
    fill_template(
        text(locale, &["tray", "allAccounts"]),
        &[("count", count.to_string())],
    )
}

pub(crate) fn tray_more_accounts(locale: AppLocale, count: usize) -> String {
    fill_template(
        text(locale, &["tray", "moreAccounts"]),
        &[("count", count.to_string())],
    )
}

pub(crate) fn tray_empty_accounts(locale: AppLocale) -> &'static str {
    text(locale, &["tray", "emptyAccounts"])
}

pub(crate) fn tray_refresh_now(locale: AppLocale) -> &'static str {
    text(locale, &["tray", "refreshNow"])
}

pub(crate) fn tray_open_app(locale: AppLocale) -> &'static str {
    text(locale, &["tray", "openApp"])
}

pub(crate) fn tray_quit(locale: AppLocale) -> &'static str {
    text(locale, &["tray", "quit"])
}

pub(crate) fn app_menu_about(locale: AppLocale, app_name: &str) -> String {
    match locale {
        AppLocale::ZhCn => format!("关于 {app_name}"),
        AppLocale::JaJp => format!("{app_name} について"),
        AppLocale::KoKr => format!("{app_name} 정보"),
        AppLocale::RuRu => format!("О приложении {app_name}"),
        AppLocale::EnUs => format!("About {app_name}"),
    }
}

pub(crate) fn app_menu_settings(locale: AppLocale) -> String {
    format!("{}...", text(locale, &["settings", "title"]))
}

pub(crate) fn tray_switching_to(locale: AppLocale, label: &str) -> String {
    let tpl = match locale {
        AppLocale::ZhCn => "正在切换到 {{label}}...",
        AppLocale::JaJp => "{{label}} に切り替え中...",
        AppLocale::KoKr => "{{label}}(으)로 전환 중...",
        AppLocale::RuRu => "Переключение на {{label}}...",
        AppLocale::EnUs => "Switching to {{label}}...",
    };
    fill_template(tpl, &[("label", label.to_string())])
}

pub(crate) fn tray_switch_failed(locale: AppLocale, error: &str) -> String {
    let tpl = match locale {
        AppLocale::ZhCn => "⚠️ 切换失败: {{error}}",
        AppLocale::JaJp => "⚠️ 切り替え失敗: {{error}}",
        AppLocale::KoKr => "⚠️ 전환 실패: {{error}}",
        AppLocale::RuRu => "⚠️ Ошибка переключения: {{error}}",
        AppLocale::EnUs => "⚠️ Switch failed: {{error}}",
    };
    fill_template(tpl, &[("error", error.to_string())])
}

pub(crate) fn tray_view_details(locale: AppLocale) -> &'static str {
    match locale {
        AppLocale::ZhCn => "打开主窗口查看详情",
        AppLocale::JaJp => "メインウィンドウを開いて詳細を確認",
        AppLocale::KoKr => "메인 창을 열어 세부정보 확인",
        AppLocale::RuRu => "Открыть главное окно для подробностей",
        AppLocale::EnUs => "Open main window for details",
    }
}

pub(crate) fn tray_switch_action_prefix(locale: AppLocale) -> &'static str {
    match locale {
        AppLocale::ZhCn => "切换联动",
        AppLocale::JaJp => "切り替えアクション",
        AppLocale::KoKr => "전환 시 실행",
        AppLocale::RuRu => "Действия при переключении",
        AppLocale::EnUs => "On switch",
    }
}

pub(crate) fn tray_action_launch_codex(locale: AppLocale) -> &'static str {
    match locale {
        AppLocale::ZhCn => "启动 Codex",
        AppLocale::JaJp => "Codex を起動",
        AppLocale::KoKr => "Codex 실행",
        AppLocale::RuRu => "Запуск Codex",
        AppLocale::EnUs => "Launch Codex",
    }
}

pub(crate) fn tray_action_restart_editors(locale: AppLocale, editors: &str) -> String {
    let tpl = match locale {
        AppLocale::ZhCn => "重启 {{editors}}",
        AppLocale::JaJp => "{{editors}} を再起動",
        AppLocale::KoKr => "{{editors}} 재시작",
        AppLocale::RuRu => "Перезапуск {{editors}}",
        AppLocale::EnUs => "Restart {{editors}}",
    };
    fill_template(tpl, &[("editors", editors.to_string())])
}
