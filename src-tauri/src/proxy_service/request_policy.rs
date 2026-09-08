use serde_json::{Map, Value};

use super::{
    normalize_api_proxy_reasoning_effort_for_upstream, request_reasoning_effort,
    DEFAULT_API_PROXY_REASONING_EFFORT, DEFAULT_UPSTREAM_SERVICE_TIER,
};

const PROXY_DEFAULT_SERVICE_TIER_ENV_VAR: &str = "CODEX_TOOLS_PROXY_SERVICE_TIER";

pub(super) fn anthropic_reasoning_effort(
    request_object: &Map<String, Value>,
) -> Result<String, String> {
    if let Some(effort) = request_reasoning_effort(request_object)? {
        return normalize_api_proxy_reasoning_effort_for_upstream(effort);
    }

    // Claude Code's effort picker is secondary to explicit Responses-style
    // reasoning. Unknown picker values retain the existing thinking fallback.
    if let Some(effort) = request_object
        .get("output_config")
        .and_then(|config| config.get("effort"))
        .and_then(Value::as_str)
        .and_then(|effort| normalize_api_proxy_reasoning_effort_for_upstream(effort).ok())
    {
        return Ok(effort);
    }

    if request_object
        .get("thinking")
        .and_then(Value::as_object)
        .and_then(|thinking| thinking.get("type"))
        .and_then(Value::as_str)
        == Some("enabled")
    {
        Ok("high".to_string())
    } else {
        Ok(DEFAULT_API_PROXY_REASONING_EFFORT.to_string())
    }
}

fn normalize_service_tier(value: &str) -> Option<String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "" => Some(DEFAULT_UPSTREAM_SERVICE_TIER.to_string()),
        "default" | "standard" => Some("default".to_string()),
        "auto" => Some("auto".to_string()),
        "fast" | "priority" => Some("priority".to_string()),
        "flex" => Some("flex".to_string()),
        _ => None,
    }
}

pub(super) fn api_proxy_service_tier_for_upstream(
    request_object: &Map<String, Value>,
) -> Result<String, String> {
    service_tier_with_env(
        request_object,
        std::env::var(PROXY_DEFAULT_SERVICE_TIER_ENV_VAR)
            .ok()
            .as_deref(),
    )
}

// Resolve the effective tier while normalizing every protocol, before the
// resulting payload reaches platform-Key permission checks and usage logging.
fn service_tier_with_env(
    request_object: &Map<String, Value>,
    env_value: Option<&str>,
) -> Result<String, String> {
    match request_object.get("service_tier") {
        None => Ok(env_value
            .and_then(normalize_service_tier)
            .unwrap_or_else(|| DEFAULT_UPSTREAM_SERVICE_TIER.to_string())),
        Some(value) => {
            let value = value
                .as_str()
                .ok_or_else(|| "service_tier 必须是字符串".to_string())?;
            normalize_service_tier(value).ok_or_else(|| format!("不支持的推理速度: {value}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{anthropic_reasoning_effort, service_tier_with_env};
    use crate::models::ApiProxyKey;
    use crate::proxy_service::{
        convert_anthropic_messages_request_to_codex, ensure_api_proxy_key_allows_payload,
        DEFAULT_API_PROXY_REASONING_EFFORT, DEFAULT_UPSTREAM_SERVICE_TIER,
    };
    use serde_json::{json, Value};

    #[test]
    fn anthropic_picker_effort_reaches_the_upstream_payload() {
        for (requested, expected) in [
            ("low", "low"),
            ("medium", "medium"),
            ("high", "high"),
            ("xhigh", "xhigh"),
            ("max", "max"),
            ("ultra", "max"),
        ] {
            let request = json!({
                "model": "gpt-5.6-terra",
                "output_config": { "effort": requested },
                "thinking": { "type": "adaptive" },
                "messages": [{ "role": "user", "content": "hello" }]
            });
            let (payload, _) = convert_anthropic_messages_request_to_codex(&request)
                .expect("Anthropic request should convert");
            assert_eq!(payload["reasoning"]["effort"], expected, "{requested}");
        }
    }

    #[test]
    fn explicit_reasoning_takes_precedence_over_the_anthropic_picker() {
        for explicit in [
            json!({"reasoning": {"effort": "high"}}),
            json!({"reasoning_effort": "high"}),
        ] {
            let mut request = json!({"output_config": {"effort": "low"}});
            request
                .as_object_mut()
                .unwrap()
                .extend(explicit.as_object().unwrap().clone());
            assert_eq!(
                anthropic_reasoning_effort(request.as_object().unwrap()).unwrap(),
                "high"
            );
        }

        let invalid_explicit = json!({
            "reasoning": {"effort": "turbo"},
            "output_config": {"effort": "low"}
        });
        assert!(anthropic_reasoning_effort(invalid_explicit.as_object().unwrap()).is_err());
    }

    #[test]
    fn unknown_anthropic_picker_keeps_the_existing_thinking_fallback() {
        for picker in [json!("turbo"), json!(42), Value::Null] {
            for (thinking, expected) in [
                ("enabled", "high"),
                ("adaptive", DEFAULT_API_PROXY_REASONING_EFFORT),
            ] {
                let request = json!({
                    "output_config": {"effort": picker},
                    "thinking": {"type": thinking}
                });
                assert_eq!(
                    anthropic_reasoning_effort(request.as_object().unwrap()).unwrap(),
                    expected
                );
            }
        }
    }

    #[test]
    fn omitted_tier_uses_the_environment_or_compiled_default() {
        for (env_value, expected) in [
            (Some("fast"), "priority"),
            (Some(" PRIORITY "), "priority"),
            (Some("flex"), "flex"),
            (Some("auto"), "auto"),
            (Some("standard"), "default"),
            (Some("bogus"), DEFAULT_UPSTREAM_SERVICE_TIER),
            (None, DEFAULT_UPSTREAM_SERVICE_TIER),
        ] {
            assert_eq!(
                service_tier_with_env(json!({}).as_object().unwrap(), env_value).unwrap(),
                expected,
                "env={env_value:?}"
            );
        }
    }

    #[test]
    fn explicit_tier_wins_and_invalid_requests_do_not_fall_back_to_the_environment() {
        for (requested, expected) in [
            ("", "default"),
            ("default", "default"),
            ("standard", "default"),
            ("auto", "auto"),
            ("fast", "priority"),
            ("priority", "priority"),
            ("flex", "flex"),
        ] {
            let request = json!({"service_tier": requested});
            assert_eq!(
                service_tier_with_env(request.as_object().unwrap(), Some("fast")).unwrap(),
                expected
            );
        }
        for invalid in [json!(null), json!(42), json!("turbo")] {
            let request = json!({"service_tier": invalid});
            assert!(service_tier_with_env(request.as_object().unwrap(), Some("fast")).is_err());
        }
    }

    #[test]
    fn configured_tier_and_picker_effort_remain_subject_to_key_permissions() {
        let request = json!({
            "model": "gpt-5.4",
            "output_config": {"effort": "high"},
            "messages": [{"role": "user", "content": "hello"}]
        });
        let (mut payload, _) = convert_anthropic_messages_request_to_codex(&request).unwrap();
        payload["service_tier"] = Value::String(
            service_tier_with_env(request.as_object().unwrap(), Some("fast")).unwrap(),
        );
        let mut key = ApiProxyKey {
            allowed_reasoning_efforts: vec!["low".to_string()],
            allowed_service_tiers: vec!["fast".to_string()],
            ..ApiProxyKey::default()
        };
        assert!(ensure_api_proxy_key_allows_payload(&key, &payload).is_err());

        key.allowed_reasoning_efforts = vec!["high".to_string()];
        key.allowed_service_tiers = vec!["default".to_string()];
        assert!(ensure_api_proxy_key_allows_payload(&key, &payload).is_err());

        key.allowed_service_tiers = vec!["fast".to_string()];
        assert!(ensure_api_proxy_key_allows_payload(&key, &payload).is_ok());
    }
}
