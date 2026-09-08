//! Developer diagnostics only. Enable the `codex_tools::switch_timing` log
//! target at Debug in a diagnostic build. No files, UI, or account data.
use std::time::Instant;

const TARGET: &str = "codex_tools::switch_timing";

pub(crate) struct Phase {
    name: &'static str,
    started: Option<Instant>,
}

impl Phase {
    pub(crate) fn start(name: &'static str) -> Self {
        Self {
            name,
            started: log::log_enabled!(target: TARGET, log::Level::Debug).then(Instant::now),
        }
    }
}

impl Drop for Phase {
    fn drop(&mut self) {
        if let Some(started) = self.started {
            // An elapsed phase is not a success/readiness signal. This also
            // records early returns; callers retain their normal Result path.
            log::debug!(target: TARGET, "phase={} elapsed_us={}", self.name, started.elapsed().as_micros());
        }
    }
}
