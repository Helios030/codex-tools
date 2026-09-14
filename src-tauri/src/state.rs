use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Child;
use std::sync::mpsc::Sender;
use std::sync::Arc;
use std::sync::RwLock;
use std::thread::JoinHandle as ThreadJoinHandle;
use std::time::Instant;

use tokio::sync::oneshot;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use futures_util::future::BoxFuture;
use futures_util::future::Shared;

use crate::auth::PendingOauthLogin;
use crate::models::AccountSummary;
use crate::models::ApiProxyKey;
use crate::models::CloudflaredTunnelMode;
use crate::proxy_service::ApiProxyUsageWriter;

pub(crate) type UsageRefreshResult = Result<Vec<AccountSummary>, String>;

pub(crate) struct UsageRefreshFlight {
    pub(crate) id: u64,
    pub(crate) force_auth_refresh: bool,
    pub(crate) future: Shared<BoxFuture<'static, UsageRefreshResult>>,
}

#[derive(Clone)]
pub(crate) struct UsageRefreshSuccess {
    pub(crate) completed_at: Instant,
    pub(crate) force_auth_refresh: bool,
    pub(crate) summaries: Vec<AccountSummary>,
}

#[derive(Default)]
pub(crate) struct UsageRefreshCoordinator {
    pub(crate) next_id: u64,
    pub(crate) current: Option<UsageRefreshFlight>,
    pub(crate) last_successful: Option<UsageRefreshSuccess>,
}

#[derive(Debug, Clone)]
pub(crate) struct ApiProxySessionAffinity {
    pub(crate) account_key: String,
    pub(crate) updated_at: i64,
}

#[derive(Debug, Default, Clone)]
pub(crate) struct ApiProxyRuntimeSnapshot {
    pub(crate) active_account_key: Option<String>,
    pub(crate) active_account_id: Option<String>,
    pub(crate) active_account_label: Option<String>,
    pub(crate) sequential_account_key: Option<String>,
    pub(crate) sequential_session_affinity: HashMap<String, ApiProxySessionAffinity>,
    pub(crate) last_error: Option<String>,
}

pub(crate) struct ApiProxyRuntimeHandle {
    pub(crate) port: u16,
    pub(crate) api_keys: Arc<RwLock<Vec<ApiProxyKey>>>,
    pub(crate) shutdown_tx: Option<oneshot::Sender<()>>,
    pub(crate) task: JoinHandle<()>,
    pub(crate) shared: Arc<Mutex<ApiProxyRuntimeSnapshot>>,
}

pub(crate) struct CloudflaredRuntimeHandle {
    pub(crate) mode: CloudflaredTunnelMode,
    pub(crate) use_http2: bool,
    pub(crate) public_url: Option<String>,
    pub(crate) custom_hostname: Option<String>,
    pub(crate) last_error: Option<String>,
    pub(crate) cleanup_api_token: Option<String>,
    pub(crate) cleanup_account_id: Option<String>,
    pub(crate) cleanup_tunnel_id: Option<String>,
    pub(crate) log_path: PathBuf,
    pub(crate) child: Child,
}

pub(crate) struct OauthCallbackListenerHandle {
    pub(crate) shutdown_tx: Option<Sender<()>>,
    pub(crate) task: Option<ThreadJoinHandle<()>>,
}

#[derive(Debug, Clone)]
pub(crate) struct SwitchInProgress {
    pub(crate) target_account_id: String,
    pub(crate) target_account_label: String,
}

#[derive(Debug)]
pub(crate) struct SwitchGuard {
    state: Arc<std::sync::Mutex<Option<SwitchInProgress>>>,
}

impl Drop for SwitchGuard {
    fn drop(&mut self) {
        if let Ok(mut slot) = self.state.lock() {
            *slot = None;
        }
    }
}

/// 全局运行态：
/// - `store_lock` 保证账号存储读写的串行化。
/// - `auth_operation_lock` 串行化 login/import/switch/token-refresh 等会改写 auth 的操作。
/// - `account_warmup_lock` 防止手动和自动预热对同一批账号重复发起真实请求。
/// - `switch_in_flight` 覆盖主窗口与状态栏全流程的账号切换防重入状态。
/// - `recent_switch_error` 记录最近一次状态栏切换失败信息，供托盘菜单展示。
/// - `pending_oauth_login` 维护当前 OAuth 授权会话。
/// - `oauth_listener` 维护本地 OAuth 回调监听线程。
/// - `api_proxy` 维护本地 API 反代服务的生命周期与状态。
/// - `cloudflared` 维护公网隧道进程与当前状态。
pub(crate) struct AppState {
    pub(crate) store_lock: Arc<Mutex<()>>,
    pub(crate) auth_operation_lock: Arc<Mutex<()>>,
    pub(crate) account_warmup_lock: Mutex<()>,
    pub(crate) switch_in_flight: Arc<std::sync::Mutex<Option<SwitchInProgress>>>,
    pub(crate) recent_switch_error: std::sync::Mutex<Option<String>>,
    pub(crate) usage_refresh: Mutex<UsageRefreshCoordinator>,
    pub(crate) usage_surface_error: std::sync::Mutex<Option<String>>,
    pub(crate) pending_oauth_login: Mutex<Option<PendingOauthLogin>>,
    pub(crate) oauth_listener: Mutex<Option<OauthCallbackListenerHandle>>,
    pub(crate) api_proxy: Mutex<Option<ApiProxyRuntimeHandle>>,
    pub(crate) api_proxy_usage_writer: Arc<Mutex<Option<ApiProxyUsageWriter>>>,
    pub(crate) cloudflared: Mutex<Option<CloudflaredRuntimeHandle>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            store_lock: Arc::new(Mutex::new(())),
            auth_operation_lock: Arc::new(Mutex::new(())),
            account_warmup_lock: Mutex::new(()),
            switch_in_flight: Arc::new(std::sync::Mutex::new(None)),
            recent_switch_error: std::sync::Mutex::new(None),
            usage_refresh: Mutex::new(UsageRefreshCoordinator::default()),
            usage_surface_error: std::sync::Mutex::new(None),
            pending_oauth_login: Mutex::new(None),
            oauth_listener: Mutex::new(None),
            api_proxy: Mutex::new(None),
            api_proxy_usage_writer: Arc::new(Mutex::new(None)),
            cloudflared: Mutex::new(None),
        }
    }
}

impl AppState {
    pub(crate) fn try_begin_switch(
        &self,
        target_account_id: &str,
        target_account_label: &str,
    ) -> Result<SwitchGuard, String> {
        let mut slot = self
            .switch_in_flight
            .lock()
            .map_err(|_| "获取切换状态锁失败".to_string())?;
        if let Some(in_progress) = slot.as_ref() {
            return Err(format!(
                "已有账号切换正在进行（目标：{}），请稍候。",
                in_progress.target_account_label
            ));
        }
        *slot = Some(SwitchInProgress {
            target_account_id: target_account_id.to_string(),
            target_account_label: target_account_label.to_string(),
        });
        Ok(SwitchGuard {
            state: self.switch_in_flight.clone(),
        })
    }

    pub(crate) fn current_switching_target(&self) -> Option<SwitchInProgress> {
        self.switch_in_flight
            .lock()
            .ok()
            .and_then(|guard| guard.clone())
    }

    pub(crate) fn set_recent_switch_error(&self, error: Option<String>) {
        if let Ok(mut slot) = self.recent_switch_error.lock() {
            *slot = error;
        }
    }

    pub(crate) fn get_recent_switch_error(&self) -> Option<String> {
        self.recent_switch_error
            .lock()
            .ok()
            .and_then(|guard| guard.clone())
    }
}
