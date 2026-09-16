import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useI18n } from "../i18n/I18nProvider";
import type {
  ApiProxyStatus,
  ApiProxyKey,
  ApiProxyKeyUsageLogEntry,
  ApiProxyUsageMetric,
  ApiProxyUsageRange,
  ApiProxyUsageStats,
  ApiProxyUsageSeries,
  ApiProxyUsageKeySeries,
  ApiProxyUsagePoint,
  CloudflaredStatus,
  CloudflaredTunnelMode,
  ApiProxyLoadBalanceMode,
  RemoteAuthMode,
  RemoteProxyStatus,
  RemoteServerConfig,
  CreateApiProxyKeyInput,
  UpdateApiProxyKeyInput,
  StartCloudflaredTunnelInput,
} from "../types/app";

const DEFAULT_PROXY_PORT = "8787";
const DEFAULT_REMOTE_SSH_PORT = "22";
const DEFAULT_REMOTE_LISTEN_PORT = "8787";
const REMOTE_DRAFTS_CACHE_KEY = "codex-tools:proxy-remote-drafts";
const REMOTE_SELECTED_CACHE_KEY = "codex-tools:proxy-remote-selected-id";
const REMOTE_HISTORY_CACHE_KEY = "codex-tools:proxy-remote-history";
const API_PROXY_REASONING_OPTION_IDS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
const API_PROXY_SERVICE_TIER_OPTION_IDS = ["auto", "default", "fast", "flex"] as const;

type RemoteServerDraft = {
  id: string;
  label: string;
  host: string;
  sshPort: string;
  sshUser: string;
  authMode: RemoteAuthMode;
  identityFile: string;
  privateKey: string;
  password: string;
  remoteDir: string;
  listenPort: string;
};

type ApiProxyPanelProps = {
  status: ApiProxyStatus;
  apiProxyKeys: ApiProxyKey[];
  apiProxyKeyLogs: ApiProxyKeyUsageLogEntry[];
  apiProxyKeysLoading: boolean;
  apiProxyUsageStats: ApiProxyUsageStats | null;
  apiProxyUsageRange: ApiProxyUsageRange;
  apiProxyUsageMetric: ApiProxyUsageMetric;
  apiProxyUsageLoading: boolean;
  apiProxyUsageClearing: boolean;
  apiProxyUsageExporting: boolean;
  cloudflaredStatus: CloudflaredStatus;
  accountCount: number;
  autoStartEnabled: boolean;
  savedPort: number;
  loadBalanceMode: ApiProxyLoadBalanceMode;
  sequentialFiveHourLimitPercent: number;
  apiProxySupportedModels: string[];
  apiProxyDisabledModels: string[];
  remoteServers: RemoteServerConfig[];
  remoteStatuses: Record<string, RemoteProxyStatus>;
  remoteLogs: Record<string, string>;
  savingSettings: boolean;
  starting: boolean;
  stopping: boolean;
  refreshingApiKey: boolean;
  bindingCodexProxy: boolean;
  restoringCodexProxy: boolean;
  savingApiProxyKey: boolean;
  refreshingRemoteId: string | null;
  deployingRemoteId: string | null;
  startingRemoteId: string | null;
  stoppingRemoteId: string | null;
  readingRemoteLogsId: string | null;
  installingDependencyName: string | null;
  installingDependencyTargetId: string | null;
  installingCloudflared: boolean;
  startingCloudflared: boolean;
  stoppingCloudflared: boolean;
  onStart: (port: number | null) => Promise<void> | void;
  onStop: () => void;
  onCreateApiProxyKey: (input: CreateApiProxyKeyInput) => Promise<void> | void;
  onUpdateApiProxyKey: (input: UpdateApiProxyKeyInput) => Promise<void> | void;
  onDeleteApiProxyKey: (id: string) => Promise<void> | void;
  onRegenerateApiProxyKey: (id: string) => Promise<void> | void;
  onSelectApiProxyUsageRange: (range: ApiProxyUsageRange) => void;
  onSelectApiProxyUsageMetric: (metric: ApiProxyUsageMetric) => void;
  onExportApiProxyUsage: (keyId: string | null) => Promise<void> | void;
  onClearApiProxyUsageStats: () => void;
  onRefreshApiKey: () => void;
  onBindCodexProxy: () => void;
  onRestoreCodexProxy: () => void;
  onRefresh: () => void;
  onToggleAutoStart: (enabled: boolean) => void;
  onPersistPort: (port: number) => Promise<void> | void;
  onUpdateLoadBalanceMode: (mode: ApiProxyLoadBalanceMode) => Promise<void> | void;
  onUpdateSequentialFiveHourLimitPercent: (percent: number) => Promise<void> | void;
  onUpdateApiProxyDisabledModels: (models: string[]) => Promise<void> | void;
  onUpdateRemoteServers: (servers: RemoteServerConfig[]) => void;
  onRefreshRemoteStatus: (server: RemoteServerConfig) => void;
  onDeployRemote: (server: RemoteServerConfig) => void;
  onStartRemote: (server: RemoteServerConfig) => void;
  onStopRemote: (server: RemoteServerConfig) => void;
  onReadRemoteLogs: (server: RemoteServerConfig) => void;
  onPickLocalIdentityFile: () => Promise<string | null>;
  onRefreshCloudflared: () => void;
  onInstallCloudflared: () => void;
  onStartCloudflared: (input: StartCloudflaredTunnelInput) => void;
  onStopCloudflared: () => void;
};

type ApiProxyTab = "status" | "usage" | "keys" | "remote";

function copyText(value: string | null) {
  if (!value) return;
  void navigator.clipboard?.writeText(value).catch(() => {});
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatTokenCount(value: number, locale: string) {
  const absoluteValue = Math.abs(value);
  const scale =
    absoluteValue >= 999_950
      ? { divisor: 1_000_000, suffix: "M" }
      : absoluteValue >= 1_000
        ? { divisor: 1_000, suffix: "K" }
        : null;

  if (!scale) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  }

  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(value / scale.divisor);
  return `${formatted}${scale.suffix}`;
}

function createRemoteServerId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `remote-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createRemoteDraft(): RemoteServerDraft {
  return {
    id: createRemoteServerId(),
    label: "",
    host: "",
    sshPort: DEFAULT_REMOTE_SSH_PORT,
    sshUser: "root",
    authMode: "keyPath",
    identityFile: "",
    privateKey: "",
    password: "",
    remoteDir: "/opt/codex-tools",
    listenPort: DEFAULT_REMOTE_LISTEN_PORT,
  };
}

function configToDraft(server: RemoteServerConfig): RemoteServerDraft {
  return {
    id: server.id,
    label: server.label ?? "",
    host: server.host,
    sshPort: String(server.sshPort ?? 22),
    sshUser: server.sshUser,
    authMode: server.authMode,
    identityFile: server.identityFile ?? "",
    privateKey: server.privateKey ?? "",
    password: server.password ?? "",
    remoteDir: server.remoteDir ?? "/opt/codex-tools",
    listenPort: String(server.listenPort ?? 8787),
  };
}

function draftToConfig(draft: RemoteServerDraft): RemoteServerConfig {
  return {
    id: draft.id,
    label: draft.label.trim(),
    host: draft.host.trim(),
    sshPort: Number.parseInt(draft.sshPort, 10) || 22,
    sshUser: draft.sshUser.trim() || "root",
    authMode: draft.authMode,
    identityFile: draft.identityFile.trim() || null,
    privateKey: draft.privateKey.trim() || null,
    password: draft.password || null,
    remoteDir: draft.remoteDir.trim() || "/opt/codex-tools",
    listenPort: Number.parseInt(draft.listenPort, 10) || 8787,
  };
}

function readStorageValue(key: string, scope: "session" | "local" = "session") {
  if (typeof window === "undefined") return null;
  try {
    return (scope === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function writeStorageValue(
  key: string,
  value: string | null,
  scope: "session" | "local" = "session",
) {
  if (typeof window === "undefined") return;
  try {
    const storage = scope === "local" ? window.localStorage : window.sessionStorage;
    if (value === null) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, value);
    }
  } catch {
    // Ignore storage quota errors
  }
}

function readCachedRemoteDrafts(remoteServers: RemoteServerConfig[]) {
  const cached = readStorageValue(REMOTE_DRAFTS_CACHE_KEY);
  if (!cached) return remoteServers.map(configToDraft);
  try {
    const parsed = JSON.parse(cached) as RemoteServerDraft[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // Fall back to props
  }
  return remoteServers.map(configToDraft);
}

function readCachedSelectedRemoteId(remoteServers: RemoteServerConfig[]) {
  const cached = readStorageValue(REMOTE_SELECTED_CACHE_KEY, "local");
  return cached && remoteServers.some((s) => s.id === cached)
    ? cached
    : remoteServers[0]?.id ?? null;
}

function readCachedRemoteHistory(remoteServers: RemoteServerConfig[]) {
  const cached = readStorageValue(REMOTE_HISTORY_CACHE_KEY, "local");
  if (!cached) return {};
  try {
    const parsed = JSON.parse(cached) as Record<string, number>;
    if (parsed && typeof parsed === "object") {
      return Object.fromEntries(
        Object.entries(parsed).filter(([id]) => remoteServers.some((s) => s.id === id)),
      );
    }
  } catch {
    // Ignore
  }
  return {};
}

function formatRemoteHistoryTime(locale: string, timestamp: number) {
  if (!timestamp) return "--";
  const deltaSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSec < 60) return locale.startsWith("zh") ? "刚刚" : "just now";
  if (deltaSec < 3600) {
    const mins = Math.floor(deltaSec / 60);
    return locale.startsWith("zh") ? `${mins} 分钟前` : `${mins}m ago`;
  }
  if (deltaSec < 86400) {
    const hrs = Math.floor(deltaSec / 3600);
    return locale.startsWith("zh") ? `${hrs} 小时前` : `${hrs}h ago`;
  }
  const days = Math.floor(deltaSec / 86400);
  return locale.startsWith("zh") ? `${days} 天前` : `${days}d ago`;
}

function formatApiProxyKeyLogTime(locale: string, timestamp: number | null) {
  if (!timestamp) return "--";
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function summarizeApiProxyKeyLogs(logs: ApiProxyKeyUsageLogEntry[], keyId: string) {
  const matched = logs.filter((log) => log.keyId === keyId);
  const totalCalls = matched.reduce((sum, log) => sum + (log.calls ?? 1), 0);
  const totalTokens = matched.reduce((sum, log) => sum + (log.tokens ?? 0), 0);
  const lastLog = matched[0] ?? null;
  return {
    totalCalls,
    totalTokens,
    lastUsedAt: lastLog?.timestamp ?? null,
  };
}

function toggleStringValue(values: string[], value: string, enabled: boolean) {
  return enabled ? [...values.filter((item) => item !== value), value] : values.filter((item) => item !== value);
}

function normalizeDisabledProxyModels(disabledModels: string[], supportedModels: string[]) {
  const valid = new Set(supportedModels);
  return disabledModels.filter((m) => valid.has(m));
}

const CHART_COLORS = [
  "#38bdf8",
  "#a78bfa",
  "#34d399",
  "#f472b6",
  "#fbbf24",
  "#60a5fa",
  "#f87171",
  "#4ade80",
];

function pickUsageColor(index: number) {
  return CHART_COLORS[index % CHART_COLORS.length];
}

type MappedPoint = { x: number; y: number; value: number; timestamp: number };
type MappedSeries = {
  id: string;
  label: string;
  color: string;
  totalCalls: number;
  totalTokens: number;
  mapped: MappedPoint[];
  pathD: string;
};

// 200px 紧凑用量图表
function CompactUsageChart({
  stats,
  range,
  metric,
  loading,
  clearing,
  exporting,
  apiProxyKeys,
  onSelectRange,
  onSelectMetric,
  onExport,
  onClear,
}: {
  stats: ApiProxyUsageStats | null;
  range: ApiProxyUsageRange;
  metric: ApiProxyUsageMetric;
  loading: boolean;
  clearing: boolean;
  exporting: boolean;
  apiProxyKeys: ApiProxyKey[];
  onSelectRange: (range: ApiProxyUsageRange) => void;
  onSelectMetric: (metric: ApiProxyUsageMetric) => void;
  onExport: (keyId: string | null) => Promise<void> | void;
  onClear: () => void;
}) {
  const { copy, locale } = useI18n();
  const [dimension, setDimension] = useState<"model" | "key">("model");
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [clearConfirming, setClearConfirming] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportKeyId, setExportKeyId] = useState("");
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);

  const clearTimerRef = useRef<number | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!moreMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [moreMenuOpen]);

  const handleClearClick = () => {
    if (!clearConfirming) {
      setClearConfirming(true);
      clearTimerRef.current = window.setTimeout(() => {
        setClearConfirming(false);
        clearTimerRef.current = null;
      }, 3000);
      return;
    }
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    setClearConfirming(false);
    setMoreMenuOpen(false);
    onClear();
  };

  useEffect(() => () => {
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current);
    }
  }, []);

  const chartSeries = useMemo(() => {
    if (!stats) return [];
    if (dimension === "model") {
      return (stats.series ?? []).map((s: ApiProxyUsageSeries, idx: number) => {
        const color = pickUsageColor(idx);
        const points = (s.points ?? []).map((p: ApiProxyUsagePoint) => ({
          timestamp: p.timestamp,
          value: metric === "calls" ? p.calls : p.tokens,
        }));
        return {
          id: s.model,
          label: s.model,
          color,
          points,
          totalCalls: s.totalCalls ?? 0,
          totalTokens: s.totalTokens ?? 0,
        };
      });
    }
    return (stats.keySeries ?? []).map((s: ApiProxyUsageKeySeries, idx: number) => {
      const color = pickUsageColor(idx);
      const points = (s.points ?? []).map((p: ApiProxyUsagePoint) => ({
        timestamp: p.timestamp,
        value: metric === "calls" ? p.calls : p.tokens,
      }));
      return {
        id: s.keyId,
        label: s.keyLabel || s.keyId,
        color,
        points,
        totalCalls: s.totalCalls ?? 0,
        totalTokens: s.totalTokens ?? 0,
      };
    });
  }, [dimension, metric, stats]);

  // 计算统一坐标点
  const chartWidth = 384;
  const chartHeight = 180;
  const paddingLeft = 32;
  const paddingRight = 12;
  const paddingTop = 12;
  const paddingBottom = 24;

  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  const allTimestamps = useMemo(() => {
    const set = new Set<number>();
    for (const s of chartSeries) {
      for (const p of s.points) {
        set.add(p.timestamp);
      }
    }
    return [...set].sort((a, b) => a - b);
  }, [chartSeries]);

  const maxVal = useMemo(() => {
    let max = 0;
    for (const s of chartSeries) {
      for (const p of s.points) {
        if (p.value > max) max = p.value;
      }
    }
    return Math.max(max, 1);
  }, [chartSeries]);

  const minTime = allTimestamps[0] ?? 0;
  const maxTime = allTimestamps[allTimestamps.length - 1] ?? 1;
  const timeSpan = Math.max(maxTime - minTime, 1);

  const lines: MappedSeries[] = useMemo(() => {
    return chartSeries.map((s) => {
      const mapped: MappedPoint[] = s.points.map((p) => {
        const x = paddingLeft + ((p.timestamp - minTime) / timeSpan) * plotWidth;
        const y = paddingTop + plotHeight - (p.value / maxVal) * plotHeight;
        return { x, y, value: p.value, timestamp: p.timestamp };
      });
      const pathD = mapped.reduce(
        (acc: string, pt: MappedPoint, i: number) =>
          i === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`,
        "",
      );
      return {
        id: s.id,
        label: s.label,
        color: s.color,
        totalCalls: s.totalCalls,
        totalTokens: s.totalTokens,
        mapped,
        pathD,
      };
    });
  }, [chartSeries, minTime, timeSpan, plotWidth, paddingTop, plotHeight, maxVal]);

  const hasData = chartSeries.some((s) => s.points.length > 0 && s.points.some((p) => p.value > 0));

  return (
    <div className="compactUsageContainer">
      {/* 1. 工具栏第一行：两个下拉 + 更多菜单 */}
      <div className="compactUsageControlsRow1">
        <div className="compactUsageDropdownGroup">
          <select
            className="compactSelect"
            value={dimension}
            onChange={(e) => setDimension(e.target.value as "model" | "key")}
            aria-label="统计维度"
          >
            <option value="model">{copy.apiProxy.chartByModel}</option>
            <option value="key">{copy.apiProxy.chartByKey}</option>
          </select>

          <select
            className="compactSelect"
            value={metric}
            onChange={(e) => onSelectMetric(e.target.value as ApiProxyUsageMetric)}
            aria-label="统计指标"
          >
            <option value="calls">{copy.apiProxy.chartCalls}</option>
            <option value="tokens">{copy.apiProxy.chartTokens}</option>
          </select>
        </div>

        <div className="compactMoreMenuWrap" ref={moreMenuRef}>
          <button
            type="button"
            className="compactIconButton"
            onClick={() => setMoreMenuOpen((o) => !o)}
            aria-label="用量更多操作"
            title="用量更多操作"
          >
            <svg className="iconGlyph" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
              <circle cx="5" cy="12" r="2" />
            </svg>
          </button>

          {moreMenuOpen ? (
            <div className="compactDropdownMenu">
              <button
                type="button"
                className="compactMenuItem"
                disabled={exporting || clearing}
                onClick={() => {
                  setMoreMenuOpen(false);
                  setExportModalOpen(true);
                }}
              >
                {exporting ? copy.apiProxy.chartExporting : copy.apiProxy.chartExportCsv}
              </button>
              <div className="compactMenuDivider" />
              <button
                type="button"
                className={`compactMenuItem${clearConfirming ? " tone-danger" : ""}`}
                disabled={clearing || exporting}
                onClick={handleClearClick}
              >
                {clearConfirming
                  ? (locale.startsWith("zh") ? "确认清除统计数据？" : "Confirm clear?")
                  : (locale.startsWith("zh") ? "清除用量统计" : "Clear statistics")}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* 2. 工具栏第二行：五个时间范围等宽分段控件 */}
      <div className="compactRangeSegmented">
        {(["1h", "24h", "7d", "14d", "30d"] as const).map((r) => (
          <button
            key={r}
            type="button"
            className={`compactRangeButton${range === r ? " isActive" : ""}`}
            onClick={() => onSelectRange(r)}
          >
            {r}
          </button>
        ))}
      </div>

      {/* 3. 200px 响应式折线图 */}
      <div className="compactChartFrame">
        {loading ? (
          <div className="compactChartOverlay">
            <span className="compactChartSpinner" />
          </div>
        ) : null}

        {!hasData && !loading ? (
          <div className="compactEmptyChart">
            <span>{copy.apiProxy.chartEmptyTitle}</span>
          </div>
        ) : (
          <svg
            className="compactChartSvg"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            role="img"
            aria-label={copy.apiProxy.chartTitle}
          >
            {/* 网格线与刻度 */}
            <line
              x1={paddingLeft}
              y1={paddingTop + plotHeight}
              x2={paddingLeft + plotWidth}
              y2={paddingTop + plotHeight}
              stroke="var(--line)"
              strokeWidth="1"
            />
            <line
              x1={paddingLeft}
              y1={paddingTop + plotHeight / 2}
              x2={paddingLeft + plotWidth}
              y2={paddingTop + plotHeight / 2}
              stroke="var(--line)"
              strokeDasharray="2 2"
              strokeWidth="1"
            />
            <text
              x={paddingLeft - 4}
              y={paddingTop + 8}
              textAnchor="end"
              fill="var(--muted)"
              fontSize="9"
              fontFamily="var(--font-ui)"
            >
              {formatNumber(maxVal, locale)}
            </text>
            <text
              x={paddingLeft - 4}
              y={paddingTop + plotHeight}
              textAnchor="end"
              fill="var(--muted)"
              fontSize="9"
              fontFamily="var(--font-ui)"
            >
              0
            </text>

            {/* 数据折线 */}
            {lines.map((l: MappedSeries) => (
              <g key={l.id}>
                <path
                  d={l.pathD}
                  fill="none"
                  stroke={l.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {l.mapped.map((pt: MappedPoint, i: number) => (
                  <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    r={activePointIndex === i ? "4" : "2"}
                    fill={l.color}
                    stroke="var(--bg-1)"
                    strokeWidth="1"
                    className="compactChartPoint"
                    tabIndex={0}
                    onFocus={() => setActivePointIndex(i)}
                    onMouseEnter={() => setActivePointIndex(i)}
                  />
                ))}
              </g>
            ))}
          </svg>
        )}
      </div>

      {/* 4. 单列图例 */}
      <div className="compactUsageLegend">
        {lines.map((s: MappedSeries) => (
          <div key={s.id} className="compactUsageLegendRow">
            <div className="compactLegendTitle">
              <span className="compactLegendDot" style={{ backgroundColor: s.color }} />
              <strong className="compactLegendName" title={s.label}>
                {s.label}
              </strong>
            </div>
            <div className="compactLegendValues">
              <span>{s.totalCalls} {locale.startsWith("zh") ? "次" : "calls"}</span>
              <span>·</span>
              <span>{formatTokenCount(s.totalTokens, locale)} Tok</span>
            </div>
          </div>
        ))}
      </div>

      {/* 导出过滤 Modal */}
      {exportModalOpen ? (
        <div className="compactModalBackdrop">
          <div className="compactModalCard">
            <h4>{copy.apiProxy.chartExportCsv}</h4>
            <label className="compactModalField">
              <span>{copy.apiProxy.chartExportKeyLabel}</span>
              <select
                className="compactSelect"
                value={exportKeyId}
                onChange={(e) => setExportKeyId(e.target.value)}
              >
                <option value="">{copy.apiProxy.chartExportAllKeys}</option>
                {apiProxyKeys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label || k.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="compactModalActions">
              <button
                type="button"
                className="compactModalCancelBtn"
                onClick={() => setExportModalOpen(false)}
              >
                {locale.startsWith("zh") ? "取消" : "Cancel"}
              </button>
              <button
                type="button"
                className="compactModalConfirmBtn"
                disabled={exporting}
                onClick={async () => {
                  await onExport(exportKeyId || null);
                  setExportModalOpen(false);
                }}
              >
                {exporting ? copy.apiProxy.chartExporting : (locale.startsWith("zh") ? "导出" : "Export")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ApiProxyPanel({
  status,
  apiProxyKeys,
  apiProxyKeyLogs,
  apiProxyKeysLoading,
  apiProxyUsageStats,
  apiProxyUsageRange,
  apiProxyUsageMetric,
  apiProxyUsageLoading,
  apiProxyUsageClearing,
  apiProxyUsageExporting,
  cloudflaredStatus,
  accountCount,
  autoStartEnabled,
  savedPort,
  loadBalanceMode,
  sequentialFiveHourLimitPercent,
  apiProxySupportedModels,
  apiProxyDisabledModels,
  remoteServers,
  remoteStatuses,
  remoteLogs,
  savingSettings,
  starting,
  stopping,
  refreshingApiKey,
  bindingCodexProxy,
  restoringCodexProxy,
  savingApiProxyKey,
  refreshingRemoteId,
  deployingRemoteId,
  startingRemoteId,
  stoppingRemoteId,
  readingRemoteLogsId,
  installingDependencyName,
  installingDependencyTargetId,
  installingCloudflared,
  startingCloudflared,
  stoppingCloudflared,
  onStart,
  onStop,
  onCreateApiProxyKey,
  onUpdateApiProxyKey,
  onDeleteApiProxyKey,
  onRegenerateApiProxyKey,
  onSelectApiProxyUsageRange,
  onSelectApiProxyUsageMetric,
  onExportApiProxyUsage,
  onClearApiProxyUsageStats,
  onRefreshApiKey,
  onBindCodexProxy,
  onRestoreCodexProxy,
  onRefresh,
  onToggleAutoStart,
  onPersistPort,
  onUpdateLoadBalanceMode,
  onUpdateSequentialFiveHourLimitPercent,
  onUpdateApiProxyDisabledModels,
  onUpdateRemoteServers,
  onRefreshRemoteStatus,
  onDeployRemote,
  onStartRemote,
  onStopRemote,
  onReadRemoteLogs,
  onPickLocalIdentityFile,
  onRefreshCloudflared,
  onInstallCloudflared,
  onStartCloudflared,
  onStopCloudflared,
}: ApiProxyPanelProps) {
  const { copy, locale } = useI18n();
  const proxyCopy = copy.apiProxy;

  // 四个互斥主分区
  const [activeTab, setActiveTab] = useState<ApiProxyTab>("status");

  // 子页模式: null | "model-selection" | "new-key" | "key-detail" | "server-detail"
  const [subpage, setSubpage] = useState<
    null | "model-selection" | "new-key" | "key-detail" | "server-detail"
  >(null);

  // 远程子切换: "ssh" | "cloudflared"
  const [remoteSubTab, setRemoteSubTab] = useState<"ssh" | "cloudflared">("ssh");

  // 局域网地址展开折叠
  const [lanExpanded, setLanExpanded] = useState(false);

  // 控制器顶部更多菜单
  const [topMoreMenuOpen, setTopMoreMenuOpen] = useState(false);
  const topMoreMenuRef = useRef<HTMLDivElement | null>(null);

  // 端口草稿
  const [portDraft, setPortDraft] = useState<string | null>(null);
  const portInput = portDraft ?? String(status.port ?? savedPort ?? DEFAULT_PROXY_PORT);
  const effectivePort = useMemo(() => {
    const raw = portInput.trim();
    if (!raw) return 8787;
    const num = Number(raw);
    return Number.isInteger(num) && num >= 1 && num <= 65535 ? num : null;
  }, [portInput]);

  // 模型管理子页状态
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [modelDraft, setModelDraft] = useState<string[]>(() =>
    normalizeDisabledProxyModels(apiProxyDisabledModels, apiProxySupportedModels),
  );
  const [savingModels, setSavingModels] = useState(false);

  // 同步外部模型配置到草稿
  useEffect(() => {
    if (subpage !== "model-selection") {
      setModelDraft(normalizeDisabledProxyModels(apiProxyDisabledModels, apiProxySupportedModels));
    }
  }, [apiProxyDisabledModels, apiProxySupportedModels, subpage]);

  // 密钥管理状态
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [keyAccordionOpen, setKeyAccordionOpen] = useState<"models" | "reasoning" | "tiers" | "logs" | null>(null);
  const [deleteKeyConfirming, setDeleteKeyConfirming] = useState(false);
  const [regenKeyConfirming, setRegenKeyConfirming] = useState(false);

  // 远程服务器草稿与状态
  const [remoteDrafts, setRemoteDrafts] = useState<RemoteServerDraft[]>(() =>
    readCachedRemoteDrafts(remoteServers),
  );
  const [selectedRemoteId, setSelectedRemoteId] = useState<string | null>(() =>
    readCachedSelectedRemoteId(remoteServers),
  );
  const [remoteHistory, setRemoteHistory] = useState<Record<string, number>>(() =>
    readCachedRemoteHistory(remoteServers),
  );
  const [sshConfigExpanded, setSshConfigExpanded] = useState(false);
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false);
  const [deleteServerConfirming, setDeleteServerConfirming] = useState(false);

  // Cloudflared 配置状态
  const [tunnelMode, setTunnelMode] = useState<CloudflaredTunnelMode>(
    cloudflaredStatus.tunnelMode ?? "quick",
  );
  const [useHttp2, setUseHttp2] = useState(cloudflaredStatus.useHttp2);
  const [advancedNetworkOpen, setAdvancedNetworkOpen] = useState(false);
  const [showTunnelSecrets, setShowTunnelSecrets] = useState(false);
  const [namedInput, setNamedInput] = useState({
    apiToken: "",
    accountId: "",
    zoneId: "",
    hostname: cloudflaredStatus.customHostname ?? "",
  });

  const busy = starting || stopping;
  const codexProxyBindingBusy = bindingCodexProxy || restoringCodexProxy;
  const cloudflaredBusy = installingCloudflared || startingCloudflared || stoppingCloudflared;

  useEffect(() => {
    writeStorageValue(REMOTE_DRAFTS_CACHE_KEY, JSON.stringify(remoteDrafts));
  }, [remoteDrafts]);

  useEffect(() => {
    writeStorageValue(REMOTE_SELECTED_CACHE_KEY, selectedRemoteId, "local");
  }, [selectedRemoteId]);

  useEffect(() => {
    writeStorageValue(REMOTE_HISTORY_CACHE_KEY, JSON.stringify(remoteHistory), "local");
  }, [remoteHistory]);

  // Esc 返回上一层
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (topMoreMenuOpen) {
          setTopMoreMenuOpen(false);
        } else if (subpage !== null) {
          setSubpage(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [topMoreMenuOpen, subpage]);

  // 点击外部关闭顶部菜单
  useEffect(() => {
    if (!topMoreMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (topMoreMenuRef.current && !topMoreMenuRef.current.contains(e.target as Node)) {
        setTopMoreMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [topMoreMenuOpen]);

  // 本地服务端口保存
  const persistPortIfNeeded = async () => {
    if (effectivePort === null || effectivePort === savedPort) return;
    await onPersistPort(effectivePort);
  };

  const handleStart = async () => {
    await persistPortIfNeeded();
    await onStart(effectivePort);
    setPortDraft(null);
  };

  const enabledModelCount = apiProxySupportedModels.length - apiProxyDisabledModels.length;

  // 远程同步
  const effectiveRemoteDrafts =
    remoteDrafts.length === 0 && remoteServers.length > 0
      ? remoteServers.map(configToDraft)
      : remoteDrafts;

  const persistRemoteDrafts = (drafts: RemoteServerDraft[]) => {
    onUpdateRemoteServers(drafts.map(draftToConfig));
  };

  const targetRemoteDraft =
    effectiveRemoteDrafts.find((d) => d.id === selectedRemoteId) ?? effectiveRemoteDrafts[0] ?? null;
  const targetRemoteStatus = targetRemoteDraft ? remoteStatuses[targetRemoteDraft.id] : null;
  const targetRemoteLog = targetRemoteDraft ? remoteLogs[targetRemoteDraft.id] : "";

  // 渲染子页: 模型选择
  if (subpage === "model-selection") {
    const query = modelSearchQuery.trim().toLowerCase();
    const filteredModels = apiProxySupportedModels.filter((m) =>
      query === "" ? true : m.toLowerCase().includes(query),
    );

    const handleToggleAll = (enable: boolean) => {
      setModelDraft(enable ? [] : [...apiProxySupportedModels]);
    };

    const handleToggleModel = (m: string) => {
      setModelDraft((curr) =>
        curr.includes(m) ? curr.filter((item) => item !== m) : [...curr, m],
      );
    };

    const handleSaveModels = async () => {
      setSavingModels(true);
      try {
        await onUpdateApiProxyDisabledModels(modelDraft);
        setSubpage(null);
      } finally {
        setSavingModels(false);
      }
    };

    return (
      <section className="compactProxyPage">
        <div className="compactSubpageHeader">
          <button type="button" className="compactBackButton" onClick={() => setSubpage(null)}>
            ‹ {locale.startsWith("zh") ? "返回状态" : "Back"}
          </button>
          <h3>{proxyCopy.modelMenuTitle}</h3>
        </div>

        <div className="compactSubpageBody">
          <input
            className="compactSearchInput"
            value={modelSearchQuery}
            placeholder={proxyCopy.modelMenuSearchPlaceholder}
            onChange={(e) => setModelSearchQuery(e.target.value)}
          />

          <div className="compactQuickActionRow">
            <button
              type="button"
              className="compactTextLink"
              onClick={() => handleToggleAll(true)}
            >
              {proxyCopy.modelMenuEnableAll}
            </button>
            <button
              type="button"
              className="compactTextLink"
              onClick={() => handleToggleAll(false)}
            >
              {proxyCopy.modelMenuDisableAll}
            </button>
          </div>

          <div className="compactModelChecklist">
            {filteredModels.map((m) => {
              const isEnabled = !modelDraft.includes(m);
              return (
                <label key={m} className="compactModelItem">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => handleToggleModel(m)}
                  />
                  <span className="compactModelName" title={m}>
                    {m}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="compactSubpageFooter">
            <button
              type="button"
              className="compactBtnGhost"
              onClick={() => setSubpage(null)}
            >
              {proxyCopy.modelMenuCancel}
            </button>
            <button
              type="button"
              className="compactBtnPrimary"
              disabled={savingModels}
              onClick={handleSaveModels}
            >
              {savingModels ? (locale.startsWith("zh") ? "保存中..." : "Saving...") : proxyCopy.modelMenuSave}
            </button>
          </div>
        </div>
      </section>
    );
  }

  // 渲染子页: 新增 API Key
  if (subpage === "new-key") {
    const handleCreateKey = async () => {
      await onCreateApiProxyKey({
        label: newKeyLabel.trim() || proxyCopy.keyCreateDefaultLabel,
        key: newKeyValue.trim() || null,
        allowedModels: [],
        allowedReasoningEfforts: [],
        allowedServiceTiers: [],
      });
      setNewKeyLabel("");
      setNewKeyValue("");
      setSubpage(null);
    };

    return (
      <section className="compactProxyPage">
        <div className="compactSubpageHeader">
          <button type="button" className="compactBackButton" onClick={() => setSubpage(null)}>
            ‹ {locale.startsWith("zh") ? "返回密钥列表" : "Back"}
          </button>
          <h3>{proxyCopy.keyCreateAction}</h3>
        </div>

        <div className="compactSubpageBody">
          <label className="compactFormField">
            <span>{proxyCopy.keyNameLabel}</span>
            <input
              className="compactInput"
              value={newKeyLabel}
              placeholder={proxyCopy.keyCreateNamePlaceholder}
              onChange={(e) => setNewKeyLabel(e.target.value)}
              autoFocus
            />
          </label>

          <label className="compactFormField">
            <span>{locale.startsWith("zh") ? "自定义密钥 (可选)" : "Custom Key (Optional)"}</span>
            <input
              className="compactInput"
              value={newKeyValue}
              placeholder={proxyCopy.keyCreateSecretPlaceholder}
              onChange={(e) => setNewKeyValue(e.target.value)}
            />
          </label>

          <div className="compactSubpageFooter">
            <button
              type="button"
              className="compactBtnGhost"
              onClick={() => setSubpage(null)}
            >
              {locale.startsWith("zh") ? "取消" : "Cancel"}
            </button>
            <button
              type="button"
              className="compactBtnPrimary"
              disabled={savingApiProxyKey}
              onClick={handleCreateKey}
            >
              {proxyCopy.keyCreateAction}
            </button>
          </div>
        </div>
      </section>
    );
  }

  // 渲染子页: 密钥详情
  if (subpage === "key-detail" && selectedKeyId) {
    const key = apiProxyKeys.find((k) => k.id === selectedKeyId);
    if (!key) {
      setSubpage(null);
      return null;
    }

    const summary = summarizeApiProxyKeyLogs(apiProxyKeyLogs, key.id);
    const matchedLogs = apiProxyKeyLogs.filter((l) => l.keyId === key.id);

    return (
      <section className="compactProxyPage">
        <div className="compactSubpageHeader">
          <button type="button" className="compactBackButton" onClick={() => setSubpage(null)}>
            ‹ {locale.startsWith("zh") ? "返回密钥列表" : "Back"}
          </button>
          <h3>{key.label}</h3>
        </div>

        <div className="compactSubpageBody">
          {/* 密钥明细与复制 */}
          <div className="compactDetailBox">
            <div className="compactKeySecretRow">
              <code className="compactKeySecretCode">
                {showSecretKey ? key.key : "••••••••••••••••"}
              </code>
              <div className="compactKeySecretActions">
                <button
                  type="button"
                  className="compactMiniBtn"
                  onClick={() => setShowSecretKey((s) => !s)}
                >
                  {showSecretKey ? (locale.startsWith("zh") ? "隐藏" : "Hide") : (locale.startsWith("zh") ? "显示" : "Show")}
                </button>
                <button
                  type="button"
                  className="compactMiniBtn"
                  onClick={() => copyText(key.key)}
                >
                  {proxyCopy.copy}
                </button>
              </div>
            </div>

            {/* 调用摘要 */}
            <div className="compactKeyStatsGrid">
              <div className="compactKeyStat">
                <span>{locale.startsWith("zh") ? "调用次数" : "Requests"}</span>
                <strong>{summary.totalCalls}</strong>
              </div>
              <div className="compactKeyStat">
                <span>Token</span>
                <strong>{formatTokenCount(summary.totalTokens, locale)}</strong>
              </div>
              <div className="compactKeyStat">
                <span>{locale.startsWith("zh") ? "最近调用" : "Last Used"}</span>
                <strong>{formatApiProxyKeyLogTime(locale, summary.lastUsedAt)}</strong>
              </div>
            </div>
          </div>

          {/* 权限手风琴 */}
          <div className="compactAccordionGroup">
            {/* 允许模型 */}
            <div className="compactAccordionItem">
              <button
                type="button"
                className="compactAccordionHeader"
                onClick={() =>
                  setKeyAccordionOpen((curr) => (curr === "models" ? null : "models"))
                }
              >
                <span>{proxyCopy.keyModelsLabel}</span>
                <b>{key.allowedModels.length === 0 ? (locale.startsWith("zh") ? "全部可用" : "All") : `${key.allowedModels.length} 个`} ›</b>
              </button>
              {keyAccordionOpen === "models" ? (
                <div className="compactAccordionContent">
                  {apiProxySupportedModels.map((m) => {
                    const isAllowed =
                      key.allowedModels.length === 0 || key.allowedModels.includes(m);
                    return (
                      <label key={m} className="compactModelItem">
                        <input
                          type="checkbox"
                          checked={isAllowed}
                          onChange={(e) => {
                            const current =
                              key.allowedModels.length === 0
                                ? apiProxySupportedModels
                                : key.allowedModels;
                            const next = toggleStringValue(current, m, e.target.checked);
                            void onUpdateApiProxyKey({ id: key.id, allowedModels: next });
                          }}
                        />
                        <span className="compactModelName">{m}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {/* 推理等级 */}
            <div className="compactAccordionItem">
              <button
                type="button"
                className="compactAccordionHeader"
                onClick={() =>
                  setKeyAccordionOpen((curr) => (curr === "reasoning" ? null : "reasoning"))
                }
              >
                <span>{proxyCopy.keyReasoningLabel}</span>
                <b>{key.allowedReasoningEfforts.length === 0 ? (locale.startsWith("zh") ? "全部" : "All") : `${key.allowedReasoningEfforts.length} 项`} ›</b>
              </button>
              {keyAccordionOpen === "reasoning" ? (
                <div className="compactAccordionContent">
                  {API_PROXY_REASONING_OPTION_IDS.map((eff) => {
                    const isAllowed =
                      key.allowedReasoningEfforts.length === 0 ||
                      key.allowedReasoningEfforts.includes(eff);
                    return (
                      <label key={eff} className="compactModelItem">
                        <input
                          type="checkbox"
                          checked={isAllowed}
                          onChange={(e) => {
                            const current =
                              key.allowedReasoningEfforts.length === 0
                                ? [...API_PROXY_REASONING_OPTION_IDS]
                                : key.allowedReasoningEfforts;
                            const next = toggleStringValue(current, eff, e.target.checked);
                            void onUpdateApiProxyKey({ id: key.id, allowedReasoningEfforts: next });
                          }}
                        />
                        <span className="compactModelName">{eff}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {/* 服务等级 */}
            <div className="compactAccordionItem">
              <button
                type="button"
                className="compactAccordionHeader"
                onClick={() =>
                  setKeyAccordionOpen((curr) => (curr === "tiers" ? null : "tiers"))
                }
              >
                <span>{proxyCopy.keyServiceTierLabel}</span>
                <b>{key.allowedServiceTiers.length === 0 ? (locale.startsWith("zh") ? "全部" : "All") : `${key.allowedServiceTiers.length} 项`} ›</b>
              </button>
              {keyAccordionOpen === "tiers" ? (
                <div className="compactAccordionContent">
                  {API_PROXY_SERVICE_TIER_OPTION_IDS.map((tier) => {
                    const isAllowed =
                      key.allowedServiceTiers.length === 0 ||
                      key.allowedServiceTiers.includes(tier);
                    return (
                      <label key={tier} className="compactModelItem">
                        <input
                          type="checkbox"
                          checked={isAllowed}
                          onChange={(e) => {
                            const current =
                              key.allowedServiceTiers.length === 0
                                ? [...API_PROXY_SERVICE_TIER_OPTION_IDS]
                                : key.allowedServiceTiers;
                            const next = toggleStringValue(current, tier, e.target.checked);
                            void onUpdateApiProxyKey({ id: key.id, allowedServiceTiers: next });
                          }}
                        />
                        <span className="compactModelName">{tier}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {/* 最近日志 */}
            <div className="compactAccordionItem">
              <button
                type="button"
                className="compactAccordionHeader"
                onClick={() =>
                  setKeyAccordionOpen((curr) => (curr === "logs" ? null : "logs"))
                }
              >
                <span>{proxyCopy.keyLogsLabel}</span>
                <b>{matchedLogs.length} 条 ›</b>
              </button>
              {keyAccordionOpen === "logs" ? (
                <div className="compactAccordionContent compactLogsList">
                  {matchedLogs.length === 0 ? (
                    <span className="compactMutedText">{proxyCopy.keyNoLogs}</span>
                  ) : (
                    matchedLogs.slice(0, 30).map((log, idx) => (
                      <div key={idx} className="compactLogItem">
                        <div className="compactLogRow1">
                          <strong>{log.model}</strong>
                          <span>{log.calls} {locale.startsWith("zh") ? "次" : "calls"}</span>
                        </div>
                        <div className="compactLogRow2">
                          <span>{formatApiProxyKeyLogTime(locale, log.timestamp)}</span>
                          <span>{formatTokenCount(log.tokens ?? 0, locale)} Tok</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* 危险操作 */}
          <div className="compactDangerActionsRow">
            <button
              type="button"
              className={`compactDangerBtn${regenKeyConfirming ? " isConfirm" : ""}`}
              onClick={() => {
                if (!regenKeyConfirming) {
                  setRegenKeyConfirming(true);
                  window.setTimeout(() => setRegenKeyConfirming(false), 3000);
                } else {
                  void onRegenerateApiProxyKey(key.id);
                  setRegenKeyConfirming(false);
                }
              }}
            >
              {regenKeyConfirming
                ? (locale.startsWith("zh") ? "确认重新生成？" : "Confirm regen?")
                : proxyCopy.keyRegenerate}
            </button>

            <button
              type="button"
              className={`compactDangerBtn${deleteKeyConfirming ? " isConfirm" : ""}`}
              onClick={() => {
                if (!deleteKeyConfirming) {
                  setDeleteKeyConfirming(true);
                  window.setTimeout(() => setDeleteKeyConfirming(false), 3000);
                } else {
                  void onDeleteApiProxyKey(key.id);
                  setDeleteKeyConfirming(false);
                  setSubpage(null);
                }
              }}
            >
              {deleteKeyConfirming
                ? (locale.startsWith("zh") ? "确认删除密钥？" : "Confirm delete?")
                : proxyCopy.keyDelete}
            </button>
          </div>
        </div>
      </section>
    );
  }

  // 渲染子页: SSH 服务器详情
  if (subpage === "server-detail" && targetRemoteDraft) {
    const isBusy =
      refreshingRemoteId === targetRemoteDraft.id ||
      deployingRemoteId === targetRemoteDraft.id ||
      startingRemoteId === targetRemoteDraft.id ||
      stoppingRemoteId === targetRemoteDraft.id ||
      (installingDependencyName !== null && installingDependencyTargetId === targetRemoteDraft.id);

    const isRunning = targetRemoteStatus?.running ?? false;
    const isInstalled = targetRemoteStatus?.installed ?? false;
    const isReadingLogs = readingRemoteLogsId === targetRemoteDraft.id;

    return (
      <section className="compactProxyPage">
        <div className="compactSubpageHeader">
          <button type="button" className="compactBackButton" onClick={() => setSubpage(null)}>
            ‹ {locale.startsWith("zh") ? "返回服务器列表" : "Back"}
          </button>
          <h3>{targetRemoteDraft.label || targetRemoteDraft.host}</h3>
        </div>

        <div className="compactSubpageBody">
          {/* 状态与上下文主操作 */}
          <div className="compactRemoteStatusCard">
            <div className="compactRemoteStatusLeft">
              <span className={`proxyStatusDot${isRunning ? " isRunning" : ""}`} />
              <strong>{isRunning ? proxyCopy.statusRunning : proxyCopy.statusStopped}</strong>
            </div>
            <div className="compactRemoteStatusActions">
              <button
                type="button"
                className="compactMiniBtn"
                disabled={isBusy}
                onClick={() => {
                  setRemoteHistory((h) => ({ ...h, [targetRemoteDraft.id]: Date.now() }));
                  onRefreshRemoteStatus(draftToConfig(targetRemoteDraft));
                }}
              >
                {proxyCopy.remoteRefresh}
              </button>

              {isRunning ? (
                <button
                  type="button"
                  className="compactBtnDanger"
                  disabled={isBusy}
                  onClick={() => onStopRemote(draftToConfig(targetRemoteDraft))}
                >
                  {stoppingRemoteId === targetRemoteDraft.id ? proxyCopy.remoteStopping : proxyCopy.remoteStop}
                </button>
              ) : isInstalled ? (
                <button
                  type="button"
                  className="compactBtnPrimary"
                  disabled={isBusy}
                  onClick={() => onStartRemote(draftToConfig(targetRemoteDraft))}
                >
                  {startingRemoteId === targetRemoteDraft.id ? proxyCopy.remoteStarting : proxyCopy.remoteStart}
                </button>
              ) : (
                <button
                  type="button"
                  className="compactBtnPrimary"
                  disabled={isBusy}
                  onClick={() => onDeployRemote(draftToConfig(targetRemoteDraft))}
                >
                  {deployingRemoteId === targetRemoteDraft.id ? proxyCopy.remoteDeploying : proxyCopy.remoteDeploy}
                </button>
              )}
            </div>
          </div>

          {/* 2 x 2 摘要网格 */}
          <div className="compactStatsGrid">
            <div className="compactStatCell">
              <span className="compactStatLabel">{proxyCopy.remoteInstalledLabel}</span>
              <strong className="compactStatValue">
                {isInstalled ? proxyCopy.remoteInstalledYes : proxyCopy.remoteInstalledNo}
              </strong>
            </div>
            <div className="compactStatCell">
              <span className="compactStatLabel">{proxyCopy.remoteSystemdLabel}</span>
              <strong className="compactStatValue">
                {targetRemoteStatus?.serviceInstalled ? proxyCopy.remoteInstalledYes : proxyCopy.remoteInstalledNo}
              </strong>
            </div>
            <div className="compactStatCell">
              <span className="compactStatLabel">{proxyCopy.remoteEnabledLabel}</span>
              <strong className="compactStatValue">
                {targetRemoteStatus?.enabled ? proxyCopy.remoteInstalledYes : proxyCopy.remoteInstalledNo}
              </strong>
            </div>
            <div className="compactStatCell">
              <span className="compactStatLabel">{proxyCopy.remotePidLabel}</span>
              <strong className="compactStatValue">
                {targetRemoteStatus?.pid ?? "--"}
              </strong>
            </div>
          </div>

          {/* 连接信息 */}
          <div className="compactDetailBox">
            <div className="compactDetailRow">
              <span>{proxyCopy.remoteBaseUrlLabel}</span>
              <div className="compactCopyValueWrap">
                <code>http://{targetRemoteDraft.host}:{targetRemoteDraft.listenPort}</code>
                <button
                  type="button"
                  className="compactMiniBtn"
                  onClick={() => copyText(`http://${targetRemoteDraft.host}:${targetRemoteDraft.listenPort}`)}
                >
                  {proxyCopy.copy}
                </button>
              </div>
            </div>
            <div className="compactDetailRow">
              <span>SSH</span>
              <span>{targetRemoteDraft.sshUser}@{targetRemoteDraft.host}:{targetRemoteDraft.sshPort}</span>
            </div>
          </div>

          {/* 折叠：SSH 配置表单 */}
          <div className="compactAccordionItem">
            <button
              type="button"
              className="compactAccordionHeader"
              onClick={() => setSshConfigExpanded((e) => !e)}
            >
              <span>{proxyCopy.remoteConfigTitle}</span>
              <b>{sshConfigExpanded ? "▲" : "▼"}</b>
            </button>
            {sshConfigExpanded ? (
              <div className="compactAccordionContent compactFormGrid">
                <label className="compactFormField">
                  <span>{proxyCopy.remoteNameLabel}</span>
                  <input
                    className="compactInput"
                    value={targetRemoteDraft.label}
                    onChange={(e) => {
                      const next = effectiveRemoteDrafts.map((d) =>
                        d.id === targetRemoteDraft.id ? { ...d, label: e.target.value } : d,
                      );
                      setRemoteDrafts(next);
                      persistRemoteDrafts(next);
                    }}
                  />
                </label>
                <label className="compactFormField">
                  <span>{proxyCopy.remoteHostLabel}</span>
                  <input
                    className="compactInput"
                    value={targetRemoteDraft.host}
                    onChange={(e) => {
                      const next = effectiveRemoteDrafts.map((d) =>
                        d.id === targetRemoteDraft.id ? { ...d, host: e.target.value } : d,
                      );
                      setRemoteDrafts(next);
                      persistRemoteDrafts(next);
                    }}
                  />
                </label>
                <label className="compactFormField">
                  <span>{proxyCopy.remoteSshPortLabel}</span>
                  <input
                    className="compactInput"
                    value={targetRemoteDraft.sshPort}
                    onChange={(e) => {
                      const next = effectiveRemoteDrafts.map((d) =>
                        d.id === targetRemoteDraft.id ? { ...d, sshPort: e.target.value } : d,
                      );
                      setRemoteDrafts(next);
                      persistRemoteDrafts(next);
                    }}
                  />
                </label>
                <label className="compactFormField">
                  <span>{proxyCopy.remoteUserLabel}</span>
                  <input
                    className="compactInput"
                    value={targetRemoteDraft.sshUser}
                    onChange={(e) => {
                      const next = effectiveRemoteDrafts.map((d) =>
                        d.id === targetRemoteDraft.id ? { ...d, sshUser: e.target.value } : d,
                      );
                      setRemoteDrafts(next);
                      persistRemoteDrafts(next);
                    }}
                  />
                </label>
                <div className="compactFormField">
                  <span>{proxyCopy.remoteIdentityFileLabel}</span>
                  <div className="compactRowActionWrap">
                    <input
                      className="compactInput"
                      value={targetRemoteDraft.identityFile}
                      placeholder={proxyCopy.remoteIdentityFilePlaceholder}
                      onChange={(e) => {
                        const next = effectiveRemoteDrafts.map((d) =>
                          d.id === targetRemoteDraft.id ? { ...d, identityFile: e.target.value } : d,
                        );
                        setRemoteDrafts(next);
                        persistRemoteDrafts(next);
                      }}
                    />
                    <button
                      type="button"
                      className="compactMiniBtn"
                      onClick={async () => {
                        const file = await onPickLocalIdentityFile();
                        if (file) {
                          const next = effectiveRemoteDrafts.map((d) =>
                            d.id === targetRemoteDraft.id ? { ...d, identityFile: file } : d,
                          );
                          setRemoteDrafts(next);
                          persistRemoteDrafts(next);
                        }
                      }}
                    >
                      {proxyCopy.remotePickIdentityFile}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* 折叠：日志与诊断 */}
          <div className="compactAccordionItem">
            <button
              type="button"
              className="compactAccordionHeader"
              onClick={() => {
                const next = !diagnosticsExpanded;
                setDiagnosticsExpanded(next);
                if (next && !targetRemoteLog && !isReadingLogs) {
                  onReadRemoteLogs(draftToConfig(targetRemoteDraft));
                }
              }}
            >
              <span>{proxyCopy.remoteLogsLabel}</span>
              <b>{diagnosticsExpanded ? "▲" : "▼"}</b>
            </button>
            {diagnosticsExpanded ? (
              <div className="compactAccordionContent">
                <div className="compactLogBox">
                  <pre>{targetRemoteLog || proxyCopy.remoteLogsEmpty}</pre>
                </div>
                <button
                  type="button"
                  className="compactMiniBtn"
                  disabled={isReadingLogs}
                  onClick={() => onReadRemoteLogs(draftToConfig(targetRemoteDraft))}
                >
                  {isReadingLogs ? proxyCopy.remoteReadingLogs : proxyCopy.remoteReadLogs}
                </button>
              </div>
            ) : null}
          </div>

          {/* 移除服务器 */}
          <div className="compactDangerActionsRow">
            <button
              type="button"
              className={`compactDangerBtn${deleteServerConfirming ? " isConfirm" : ""}`}
              onClick={() => {
                if (!deleteServerConfirming) {
                  setDeleteServerConfirming(true);
                  window.setTimeout(() => setDeleteServerConfirming(false), 3000);
                } else {
                  const next = effectiveRemoteDrafts.filter((d) => d.id !== targetRemoteDraft.id);
                  setRemoteDrafts(next);
                  persistRemoteDrafts(next);
                  setDeleteServerConfirming(false);
                  setSubpage(null);
                }
              }}
            >
              {deleteServerConfirming
                ? (locale.startsWith("zh") ? "确认移除此服务器？" : "Confirm remove?")
                : proxyCopy.remoteRemove}
            </button>
          </div>
        </div>
      </section>
    );
  }

  // 默认两层架构渲染：顶部控制器 + 4 个互斥分区
  return (
    <section className="compactProxyPage">
      {/* 1. 始终位于顶部的服务控制器 */}
      <section className="compactProxyController">
        {/* 第一行：状态指示 + 端口 + 启动/停止 */}
        <div className="compactControllerRow1">
          <div className="compactControllerStatus">
            <span className={`proxyStatusDot${status.running ? " isRunning" : ""}`} />
            <strong>
              {status.running
                ? `${proxyCopy.statusRunning} · ${proxyCopy.portLabel} ${status.port}`
                : `${proxyCopy.statusStopped} · ${proxyCopy.portLabel} ${status.port ?? savedPort ?? DEFAULT_PROXY_PORT}`}
            </strong>
          </div>

          <div className="compactControllerActions">
            {status.running ? (
              <button
                type="button"
                className="compactMainActionBtn tone-danger"
                disabled={busy}
                onClick={onStop}
              >
                {stopping ? (locale.startsWith("zh") ? "停止中..." : "Stopping...") : proxyCopy.stop}
              </button>
            ) : (
              <button
                type="button"
                className="compactMainActionBtn tone-primary"
                disabled={busy || accountCount === 0 || effectivePort === null}
                onClick={handleStart}
              >
                {starting ? (locale.startsWith("zh") ? "启动中..." : "Starting...") : proxyCopy.start}
              </button>
            )}

            {/* 顶栏右侧 ⋯ 刷新状态 */}
            <div className="compactMoreMenuWrap" ref={topMoreMenuRef}>
              <button
                type="button"
                className="compactIconButton"
                onClick={() => setTopMoreMenuOpen((o) => !o)}
                title="服务操作"
                aria-label="服务操作"
              >
                <svg className="iconGlyph" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                  <circle cx="5" cy="12" r="2" />
                </svg>
              </button>
              {topMoreMenuOpen ? (
                <div className="compactDropdownMenu">
                  <button
                    type="button"
                    className="compactMenuItem"
                    disabled={busy}
                    onClick={() => {
                      setTopMoreMenuOpen(false);
                      onRefresh();
                    }}
                  >
                    {proxyCopy.refreshStatus}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* 启动禁用原因提示 */}
        {!status.running && accountCount === 0 ? (
          <span className="compactControllerHint tone-danger">
            {locale.startsWith("zh") ? "请先在“账号”标签中添加并登录账号" : "Please add an account first"}
          </span>
        ) : null}

        {/* 第二行：本地 Base URL + 复制 */}
        <div className="compactControllerRow2">
          <code className="compactBaseUrlCode" title={status.baseUrl ?? `http://127.0.0.1:${savedPort}`}>
            {status.baseUrl ?? `http://127.0.0.1:${savedPort}`}
          </code>
          <button
            type="button"
            className="compactMiniBtn"
            disabled={!status.baseUrl}
            onClick={() => copyText(status.baseUrl)}
          >
            {proxyCopy.copy}
          </button>
        </div>

        {/* 第三行：局域网地址折叠 */}
        <div className="compactControllerRow3">
          <button
            type="button"
            className="compactLanToggleBtn"
            onClick={() => setLanExpanded((e) => !e)}
          >
            <span>{proxyCopy.lanBaseUrlLabel}</span>
            <b>{lanExpanded ? "▲" : "›"}</b>
          </button>
          {lanExpanded ? (
            <div className="compactLanBox">
              <code>{status.lanBaseUrl || (locale.startsWith("zh") ? "未获取到局域网 IP" : "No LAN IP")}</code>
              {status.lanBaseUrl ? (
                <button
                  type="button"
                  className="compactMiniBtn"
                  onClick={() => copyText(status.lanBaseUrl)}
                >
                  {proxyCopy.copy}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* 2. 四个互斥主分区切换 Tab */}
      <nav className="compactTabsNav" role="tablist">
        {(["status", "usage", "keys", "remote"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`compactTabButton${activeTab === tab ? " isActive" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "status"
              ? (locale.startsWith("zh") ? "状态" : "Status")
              : tab === "usage"
                ? (locale.startsWith("zh") ? "用量" : "Usage")
                : tab === "keys"
                  ? (locale.startsWith("zh") ? "密钥" : "Keys")
                  : (locale.startsWith("zh") ? "远程" : "Remote")}
          </button>
        ))}
      </nav>

      {/* 3. 分区主体内容 */}
      <div className="compactTabContent">
        {/* 状态分区 */}
        {activeTab === "status" ? (
          <div className="compactStatusSection">
            {/* 本地服务配置 */}
            <div className="compactSettingsCard">
              <div className="compactCardHeader">
                <h4>{locale.startsWith("zh") ? "本地服务" : "Local Service"}</h4>
              </div>

              <div className="compactSettingRow">
                <span>{proxyCopy.accountCountLabel}</span>
                <strong>{accountCount}</strong>
              </div>

              <div className="compactSettingRow">
                <span>{proxyCopy.defaultStartLabel}</span>
                <label className="themeSwitch">
                  <input
                    type="checkbox"
                    checked={autoStartEnabled}
                    disabled={savingSettings}
                    onChange={(e) => onToggleAutoStart(e.target.checked)}
                  />
                  <span className="themeSwitchTrack">
                    <span className="themeSwitchThumb" />
                  </span>
                </label>
              </div>

              <div className="compactSettingRow">
                <span>{proxyCopy.portLabel}</span>
                <input
                  className="compactPortInput"
                  inputMode="numeric"
                  value={portInput}
                  disabled={busy || status.running}
                  onChange={(e) => setPortDraft(e.target.value)}
                  onBlur={() => void persistPortIfNeeded()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void persistPortIfNeeded();
                  }}
                />
              </div>
            </div>

            {/* Codex 接管 */}
            <div className="compactSettingsCard">
              <div className="compactCardHeader">
                <h4>{proxyCopy.codexBindLabel}</h4>
              </div>
              <div className="compactSettingRow">
                <span>
                  {status.codexProxyBound
                    ? proxyCopy.codexBindBoundTitle
                    : proxyCopy.codexBindNormalTitle}
                </span>
                <div className="compactRowActionWrap">
                  <button
                    type="button"
                    className="compactBtnGhost"
                    disabled={!status.codexProxyRestoreAvailable || busy || codexProxyBindingBusy}
                    onClick={onRestoreCodexProxy}
                  >
                    {restoringCodexProxy ? proxyCopy.codexRestoreActionBusy : proxyCopy.codexRestoreAction}
                  </button>
                  <button
                    type="button"
                    className="compactBtnPrimary"
                    disabled={
                      !status.running ||
                      !status.baseUrl ||
                      !status.apiKey ||
                      busy ||
                      codexProxyBindingBusy ||
                      status.codexProxyBound
                    }
                    onClick={onBindCodexProxy}
                  >
                    {bindingCodexProxy ? proxyCopy.codexBindActionBusy : proxyCopy.codexBindAction}
                  </button>
                </div>
              </div>
            </div>

            {/* 路由策略 */}
            <div className="compactSettingsCard">
              <div className="compactCardHeader">
                <h4>{proxyCopy.loadBalanceLabel}</h4>
              </div>

              <div className="compactSettingRow">
                <div className="compactModeGroup">
                  <button
                    type="button"
                    className={`compactModeBtn${loadBalanceMode === "average" ? " isActive" : ""}`}
                    onClick={() => void onUpdateLoadBalanceMode("average")}
                  >
                    {proxyCopy.loadBalanceAverage}
                  </button>
                  <button
                    type="button"
                    className={`compactModeBtn${loadBalanceMode === "sequential" ? " isActive" : ""}`}
                    onClick={() => void onUpdateLoadBalanceMode("sequential")}
                  >
                    {proxyCopy.loadBalanceSequential}
                  </button>
                </div>
              </div>

              {loadBalanceMode === "sequential" ? (
                <div className="compactSettingRow">
                  <span>{proxyCopy.sequentialFiveHourLimitLabel}</span>
                  <div className="compactSliderWrap">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={sequentialFiveHourLimitPercent}
                      onChange={(e) =>
                        void onUpdateSequentialFiveHourLimitPercent(Number(e.target.value))
                      }
                    />
                    <b>{sequentialFiveHourLimitPercent}%</b>
                  </div>
                </div>
              ) : null}

              {/* 可用模型入口 */}
              <div
                className="compactSettingRow compactClickableRow"
                onClick={() => setSubpage("model-selection")}
                role="button"
                tabIndex={0}
              >
                <span>{proxyCopy.modelMenuLabel}</span>
                <b className="compactEntryLink">
                  {enabledModelCount} / {apiProxySupportedModels.length} ›
                </b>
              </div>

              {/* 服务密钥 */}
              <div className="compactSettingRow">
                <span>{proxyCopy.apiKeyLabel}</span>
                <div className="compactRowActionWrap">
                  <code className="compactMaskedKey">••••••••</code>
                  <button
                    type="button"
                    className="compactMiniBtn"
                    disabled={!status.apiKey}
                    onClick={() => copyText(status.apiKey)}
                  >
                    {proxyCopy.copy}
                  </button>
                  <button
                    type="button"
                    className="compactMiniBtn"
                    disabled={refreshingApiKey}
                    onClick={onRefreshApiKey}
                  >
                    {refreshingApiKey ? "..." : proxyCopy.refreshKey}
                  </button>
                </div>
              </div>
            </div>

            {/* 最近错误 */}
            {status.lastError ? (
              <div className="compactErrorBanner">
                <strong>{locale.startsWith("zh") ? "最近错误" : "Recent Error"}</strong>
                <p>{status.lastError}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 用量分区 */}
        {activeTab === "usage" ? (
          <CompactUsageChart
            stats={apiProxyUsageStats}
            range={apiProxyUsageRange}
            metric={apiProxyUsageMetric}
            loading={apiProxyUsageLoading}
            clearing={apiProxyUsageClearing}
            exporting={apiProxyUsageExporting}
            apiProxyKeys={apiProxyKeys}
            onSelectRange={onSelectApiProxyUsageRange}
            onSelectMetric={onSelectApiProxyUsageMetric}
            onExport={onExportApiProxyUsage}
            onClear={onClearApiProxyUsageStats}
          />
        ) : null}

        {/* 密钥分区 */}
        {activeTab === "keys" ? (
          <div className="compactKeysSection">
            <div className="compactKeysHeader">
              <span>
                {proxyCopy.keyManagerTitle} ({apiProxyKeys.length})
              </span>
              <button
                type="button"
                className="compactBtnPrimary"
                onClick={() => setSubpage("new-key")}
              >
                + {proxyCopy.keyCreateAction}
              </button>
            </div>

            <div className="compactKeysList">
              {apiProxyKeysLoading ? (
                <div className="compactEmptySection">
                  <span>{proxyCopy.keyLoading}</span>
                </div>
              ) : apiProxyKeys.length === 0 ? (
                <div className="compactEmptySection">
                  <span>{proxyCopy.keyEmpty}</span>
                </div>
              ) : (
                apiProxyKeys.map((key) => {
                  const summary = summarizeApiProxyKeyLogs(apiProxyKeyLogs, key.id);
                  return (
                    <div
                      key={key.id}
                      className="compactKeyCard"
                      onClick={() => {
                        setSelectedKeyId(key.id);
                        setSubpage("key-detail");
                      }}
                    >
                      <div className="compactKeyCardRow1">
                        <strong className="compactKeyName">{key.label}</strong>
                        <div
                          className="compactKeyCardTrailing"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <label className="themeSwitch">
                            <input
                              type="checkbox"
                              checked={key.enabled}
                              onChange={(e) =>
                                void onUpdateApiProxyKey({
                                  id: key.id,
                                  enabled: e.target.checked,
                                })
                              }
                            />
                            <span className="themeSwitchTrack">
                              <span className="themeSwitchThumb" />
                            </span>
                          </label>
                          <span className="compactArrow">›</span>
                        </div>
                      </div>

                      <div className="compactKeyCardRow2">
                        <span>{summary.totalCalls} {locale.startsWith("zh") ? "次" : "calls"}</span>
                        <span>·</span>
                        <span>{formatTokenCount(summary.totalTokens, locale)} Tok</span>
                        <span>·</span>
                        <span>{formatRemoteHistoryTime(locale, summary.lastUsedAt ? summary.lastUsedAt * 1000 : 0)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : null}

        {/* 远程分区 */}
        {activeTab === "remote" ? (
          <div className="compactRemoteSection">
            {/* 顶部二级分段切换 */}
            <div className="compactSubSegmented">
              <button
                type="button"
                className={`compactSubSegmentButton${remoteSubTab === "ssh" ? " isActive" : ""}`}
                onClick={() => setRemoteSubTab("ssh")}
              >
                {locale.startsWith("zh") ? "SSH 服务器" : "SSH Servers"}
              </button>
              <button
                type="button"
                className={`compactSubSegmentButton${remoteSubTab === "cloudflared" ? " isActive" : ""}`}
                onClick={() => {
                  setRemoteSubTab("cloudflared");
                  onRefreshCloudflared();
                }}
              >
                {proxyCopy.cloudflaredTitle}
              </button>
            </div>

            {remoteSubTab === "ssh" ? (
              <div className="compactSshListSection">
                <div className="compactKeysHeader">
                  <span>
                    {proxyCopy.remoteTitle} ({effectiveRemoteDrafts.length})
                  </span>
                  <button
                    type="button"
                    className="compactBtnPrimary"
                    onClick={() => {
                      const newDraft = createRemoteDraft();
                      const next = [...effectiveRemoteDrafts, newDraft];
                      setRemoteDrafts(next);
                      persistRemoteDrafts(next);
                      setSelectedRemoteId(newDraft.id);
                      setSubpage("server-detail");
                    }}
                  >
                    + {proxyCopy.remoteAddServer}
                  </button>
                </div>

                <div className="compactServerList">
                  {effectiveRemoteDrafts.length === 0 ? (
                    <div className="compactEmptySection">
                      <span>{proxyCopy.remoteEmptyTitle}</span>
                    </div>
                  ) : (
                    effectiveRemoteDrafts.map((draft) => {
                      const serverStatus = remoteStatuses[draft.id];
                      const isRunning = serverStatus?.running ?? false;
                      const lastChecked = remoteHistory[draft.id] ?? 0;

                      return (
                        <div
                          key={draft.id}
                          className="compactServerCard"
                          onClick={() => {
                            setSelectedRemoteId(draft.id);
                            setSubpage("server-detail");
                          }}
                        >
                          <div className="compactServerCardRow1">
                            <strong className="compactServerName">
                              {draft.label || draft.host || "Untitled"}
                            </strong>
                            <div className="compactServerCardTrailing">
                              <span className={`proxyStatusDot${isRunning ? " isRunning" : ""}`} />
                              <span>{isRunning ? proxyCopy.statusRunning : proxyCopy.statusStopped}</span>
                              <span className="compactArrow">›</span>
                            </div>
                          </div>

                          <div className="compactServerCardRow2">
                            <span>{draft.sshUser}@{draft.host}:{draft.sshPort}</span>
                            <span>·</span>
                            <span>{formatRemoteHistoryTime(locale, lastChecked)}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              /* 公网访问 (Cloudflared) */
              <div className="compactCloudflaredSection">
                {/* 状态徽标 */}
                <div className="compactDetailBox">
                  <div className="compactDetailRow">
                    <span>{proxyCopy.cloudflaredTitle}</span>
                    <strong>
                      {cloudflaredStatus.running
                        ? proxyCopy.statusRunning
                        : cloudflaredStatus.installed
                          ? proxyCopy.statusStopped
                          : proxyCopy.notInstalledLabel}
                    </strong>
                  </div>

                  {cloudflaredStatus.publicUrl ? (
                    <div className="compactDetailRow">
                      <span>{locale.startsWith("zh") ? "公开地址" : "Public URL"}</span>
                      <div className="compactCopyValueWrap">
                        <code>{cloudflaredStatus.publicUrl}</code>
                        <button
                          type="button"
                          className="compactMiniBtn"
                          onClick={() => copyText(cloudflaredStatus.publicUrl)}
                        >
                          {proxyCopy.copy}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {!cloudflaredStatus.installed ? (
                  <div className="compactInstallCard">
                    <p>{proxyCopy.installDescription}</p>
                    <button
                      type="button"
                      className="compactBtnPrimary"
                      disabled={cloudflaredBusy}
                      onClick={onInstallCloudflared}
                    >
                      {installingCloudflared
                        ? proxyCopy.installing
                        : proxyCopy.installButton}
                    </button>
                  </div>
                ) : (
                  <div className="compactCloudflaredForm">
                    {/* 隧道模式选择 */}
                    <div className="compactModeGroup">
                      <button
                        type="button"
                        className={`compactModeBtn${tunnelMode === "quick" ? " isActive" : ""}`}
                        onClick={() => setTunnelMode("quick")}
                      >
                        {proxyCopy.quickModeLabel}
                      </button>
                      <button
                        type="button"
                        className={`compactModeBtn${tunnelMode === "named" ? " isActive" : ""}`}
                        onClick={() => setTunnelMode("named")}
                      >
                        {proxyCopy.namedModeLabel}
                      </button>
                    </div>

                    {tunnelMode === "named" ? (
                      <div className="compactFormGrid">
                        <label className="compactFormField">
                          <span>{proxyCopy.apiTokenLabel}</span>
                          <div className="compactPasswordWrap">
                            <input
                              type={showTunnelSecrets ? "text" : "password"}
                              className="compactInput"
                              value={namedInput.apiToken}
                              onChange={(e) =>
                                setNamedInput((s) => ({ ...s, apiToken: e.target.value }))
                              }
                            />
                            <button
                              type="button"
                              className="compactMiniBtn"
                              onClick={() => setShowTunnelSecrets((s) => !s)}
                            >
                              {showTunnelSecrets ? (locale.startsWith("zh") ? "隐藏" : "显示") : (locale.startsWith("zh") ? "显示" : "Show")}
                            </button>
                          </div>
                        </label>

                        <label className="compactFormField">
                          <span>{proxyCopy.accountIdLabel}</span>
                          <input
                            type={showTunnelSecrets ? "text" : "password"}
                            className="compactInput"
                            value={namedInput.accountId}
                            onChange={(e) =>
                              setNamedInput((s) => ({ ...s, accountId: e.target.value }))
                            }
                          />
                        </label>

                        <label className="compactFormField">
                          <span>{proxyCopy.zoneIdLabel}</span>
                          <input
                            type={showTunnelSecrets ? "text" : "password"}
                            className="compactInput"
                            value={namedInput.zoneId}
                            onChange={(e) =>
                              setNamedInput((s) => ({ ...s, zoneId: e.target.value }))
                            }
                          />
                        </label>

                        <label className="compactFormField">
                          <span>{proxyCopy.hostnameLabel}</span>
                          <input
                            type="text"
                            className="compactInput"
                            placeholder="api.example.com"
                            value={namedInput.hostname}
                            onChange={(e) =>
                              setNamedInput((s) => ({ ...s, hostname: e.target.value }))
                            }
                          />
                        </label>
                      </div>
                    ) : null}

                    {/* 折叠高级网络选项 */}
                    <div className="compactAccordionItem">
                      <button
                        type="button"
                        className="compactAccordionHeader"
                        onClick={() => setAdvancedNetworkOpen((o) => !o)}
                      >
                        <span>{locale.startsWith("zh") ? "高级网络选项" : "Advanced Network"}</span>
                        <b>{advancedNetworkOpen ? "▲" : "▼"}</b>
                      </button>
                      {advancedNetworkOpen ? (
                        <div className="compactAccordionContent">
                          <label className="compactModelItem">
                            <input
                              type="checkbox"
                              checked={useHttp2}
                              onChange={(e) => setUseHttp2(e.target.checked)}
                            />
                            <span className="compactModelName">{proxyCopy.useHttp2}</span>
                          </label>
                        </div>
                      ) : null}
                    </div>

                    {/* 启动 / 停止主按钮 */}
                    <div className="compactCloudflaredActions">
                      {cloudflaredStatus.running ? (
                        <button
                          type="button"
                          className="compactBtnDanger"
                          disabled={cloudflaredBusy}
                          onClick={onStopCloudflared}
                        >
                          {stoppingCloudflared
                            ? proxyCopy.stoppingPublic
                            : proxyCopy.stopPublic}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="compactBtnPrimary"
                          disabled={
                            cloudflaredBusy ||
                            !status.running ||
                            status.port === null ||
                            (tunnelMode === "named" &&
                              (!namedInput.apiToken ||
                                !namedInput.accountId ||
                                !namedInput.zoneId ||
                                !namedInput.hostname))
                          }
                          onClick={() => {
                            if (status.port === null) return;
                            onStartCloudflared({
                              apiProxyPort: status.port,
                              useHttp2,
                              mode: tunnelMode,
                              named:
                                tunnelMode === "named"
                                  ? {
                                      apiToken: namedInput.apiToken.trim(),
                                      accountId: namedInput.accountId.trim(),
                                      zoneId: namedInput.zoneId.trim(),
                                      hostname: namedInput.hostname.trim(),
                                    }
                                  : null,
                            });
                          }}
                        >
                          {startingCloudflared
                            ? proxyCopy.startingPublic
                            : proxyCopy.startPublic}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
