import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { tokenHeatmapLevel } from "../utils/heatmapScale";
import type {
  CodexBudgetAlert,
  CodexCostAnalyticsProgress,
  CodexCostAnalyticsSnapshot,
  CodexHourlyCostBucket,
  CodexProjectCostBreakdown,
  CodexPromptCostBreakdown,
  CodexSessionCostBreakdown,
} from "../types/app";

type AnalyticsPanelProps = {
  analytics: CodexCostAnalyticsSnapshot | null;
  error: string | null;
  loading: boolean;
  exporting: "csv" | "json" | null;
  progress: CodexCostAnalyticsProgress | null;
  weeklyBudgetUsd: number | null;
  savingSettings: boolean;
  onRefresh: () => void;
  onExport: (format: "csv" | "json") => void;
  onDeleteSession: (session: CodexSessionCostBreakdown) => Promise<void> | void;
  onUpdateWeeklyBudget: (value: number | null) => Promise<void>;
};

type AnalyticsTab = "projects" | "sessions" | "prompts" | "heatmap";

function formatUsd(value: number, locale: string) {
  const digits = Math.abs(value) < 1 ? 4 : 2;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatWholeNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
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
    return formatWholeNumber(value, locale);
  }

  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(value / scale.divisor);
  return `${formatted}${scale.suffix}`;
}

function formatDateTime(value: number | null, locale: string) {
  if (!value) {
    return "--";
  }
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value * 1000));
}

function formatTimeOnly(value: number | null, locale: string) {
  if (!value) {
    return "--";
  }
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value * 1000));
}

function alertLabel(
  alert: CodexBudgetAlert,
  copy: ReturnType<typeof useI18n>["copy"]["analytics"],
) {
  if (alert === "danger") {
    return copy.budgetDanger;
  }
  if (alert === "warning") {
    return copy.budgetWarning;
  }
  if (alert === "ok") {
    return copy.budgetOk;
  }
  return copy.budgetUnset;
}

function progressStageLabel(
  progress: CodexCostAnalyticsProgress | null,
  copy: ReturnType<typeof useI18n>["copy"]["analytics"],
) {
  if (progress?.stage === "caching") {
    return copy.progressCaching;
  }
  if (progress?.stage === "complete") {
    return copy.progressComplete;
  }
  return copy.progressScanning;
}

// 7 x 24 热力图组件，紧凑适配 384px 可用内容区
function Heatmap({
  buckets,
  locale,
  copy,
}: {
  buckets: CodexHourlyCostBucket[];
  locale: string;
  copy: ReturnType<typeof useI18n>["copy"]["analytics"];
}) {
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null);
  const byKey = useMemo(
    () => new Map(buckets.map((bucket) => [`${bucket.weekday}:${bucket.hour}`, bucket])),
    [buckets],
  );
  const maxTokens = Math.max(...buckets.map((bucket) => bucket.tokens), 1);
  const weekdayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  });
  const weekdayLabels = Array.from({ length: 7 }, (_, weekday) =>
    weekdayFormatter.format(new Date(Date.UTC(2024, 0, 7 + weekday, 12))),
  );
  const hourLabels = Array.from({ length: 24 }, (_, hour) => hour);

  return (
    <div className="compactHeatmapWrap">
      <div
        className="compactHeatmap"
        role="img"
        aria-label={copy.heatmapAriaLabel}
        onMouseLeave={() => setActiveCellKey(null)}
      >
        <div className="compactHeatmapHeader" aria-hidden="true">
          <span />
          {hourLabels.map((hour) => (
            <b key={hour}>
              {hour % 6 === 0 ? String(hour).padStart(2, "0") : ""}
            </b>
          ))}
        </div>
        {weekdayLabels.map((label, weekday) => (
          <div key={label} className="compactHeatmapRow">
            <span>{label}</span>
            {hourLabels.map((hour) => {
              const cellKey = `${weekday}:${hour}`;
              const bucket = byKey.get(cellKey);
              const tokens = bucket?.tokens ?? 0;
              const level = tokenHeatmapLevel(tokens, maxTokens);
              const tooltip = copy.heatmapTooltip(
                label,
                `${String(hour).padStart(2, "0")}:00`,
                formatTokenCount(tokens, locale),
              );
              const isActive = activeCellKey === cellKey;
              return (
                <button
                  key={hour}
                  type="button"
                  tabIndex={0}
                  className={`compactHeatmapCell level${level}${isActive ? " isActive" : ""}`}
                  data-tooltip={tooltip}
                  aria-label={tooltip}
                  onClick={() => setActiveCellKey((curr) => (curr === cellKey ? null : cellKey))}
                  onMouseEnter={() => setActiveCellKey(cellKey)}
                  onFocus={() => setActiveCellKey(cellKey)}
                  onBlur={() => setActiveCellKey((curr) => (curr === cellKey ? null : curr))}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="compactHeatmapFooter">
        <span className="compactHeatmapLegendLabel">{locale.startsWith("zh") ? "少" : "Less"}</span>
        <div className="compactHeatmapLegendBar" aria-hidden="true">
          <i className="compactHeatmapCell level0" />
          <i className="compactHeatmapCell level2" />
          <i className="compactHeatmapCell level4" />
          <i className="compactHeatmapCell level6" />
          <i className="compactHeatmapCell level8" />
        </div>
        <span className="compactHeatmapLegendLabel">{locale.startsWith("zh") ? "多" : "More"}</span>
      </div>
    </div>
  );
}

// 项目列表
function ProjectRows({
  projects,
  locale,
}: {
  projects: CodexProjectCostBreakdown[];
  locale: string;
}) {
  const maxCost = Math.max(...projects.map((p) => p.costUsd), 0.000001);

  if (projects.length === 0) {
    return (
      <div className="compactEmptySection">
        <span>{locale.startsWith("zh") ? "暂无项目数据" : "No project data"}</span>
      </div>
    );
  }

  return (
    <div className="compactProjectList">
      {projects.slice(0, 10).map((project) => (
        <article key={project.projectPath} className="compactProjectItem">
          <div className="compactProjectTop">
            <strong className="compactProjectName" title={project.projectName}>
              {project.projectName}
            </strong>
            <span className="compactProjectCost">
              {formatUsd(project.costUsd, locale)}
            </span>
          </div>
          <div className="compactProjectPathRow">
            <span className="compactProjectPath" title={project.projectPath} tabIndex={0}>
              {project.projectPath}
            </span>
            <span className="compactProjectTokens">
              {formatTokenCount(project.total.totalTokens, locale)} Token
            </span>
          </div>
          <div className="compactProjectBar" aria-hidden="true">
            <i
              style={{
                width: `${Math.max(4, (project.costUsd / maxCost) * 100)}%`,
              }}
            />
          </div>
          <div className="compactProjectMeta">
            {project.sessionCount} {locale.startsWith("zh") ? "会话" : "sessions"} ·{" "}
            {project.promptCount} {locale.startsWith("zh") ? "提示" : "prompts"} ·{" "}
            {project.eventCount} {locale.startsWith("zh") ? "事件" : "events"}
          </div>
        </article>
      ))}
    </div>
  );
}

// 垂直会话列表（替换原 860px 宽表格）
function SessionList({
  sessions,
  locale,
  text,
  pendingDeleteSessionId,
  deletingSessionId,
  onDeleteSession,
}: {
  sessions: CodexSessionCostBreakdown[];
  locale: string;
  text: ReturnType<typeof useI18n>["copy"]["analytics"];
  pendingDeleteSessionId: string | null;
  deletingSessionId: string | null;
  onDeleteSession: (session: CodexSessionCostBreakdown) => void;
}) {
  if (sessions.length === 0) {
    return (
      <div className="compactEmptySection">
        <span>{locale.startsWith("zh") ? "未匹配到会话" : "No matching sessions"}</span>
      </div>
    );
  }

  return (
    <div className="compactSessionList">
      {sessions.slice(0, 80).map((session) => {
        const isPendingDelete = pendingDeleteSessionId === session.sessionId;
        const isDeleting = deletingSessionId === session.sessionId;

        return (
          <article key={session.sessionId} className="compactSessionItem">
            <div className="compactSessionRow1">
              <div className="compactSessionIdMeta">
                <strong title={session.sessionId}>
                  {session.sessionId.slice(0, 8)}
                </strong>
                <span className="compactSessionDot">·</span>
                <span className="compactSessionProject" title={session.projectName}>
                  {session.projectName}
                </span>
              </div>
              <button
                type="button"
                className={`compactSessionDeleteBtn${isPendingDelete ? " isConfirm" : ""}`}
                disabled={isDeleting}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(session);
                }}
                title={
                  isDeleting
                    ? text.sessionDeleting
                    : isPendingDelete
                      ? text.sessionDeleteConfirm
                      : text.sessionDelete
                }
              >
                {isDeleting
                  ? text.sessionDeleting
                  : isPendingDelete
                    ? text.sessionDeleteConfirm
                    : text.sessionDelete}
              </button>
            </div>

            <div className="compactSessionRow2">
              <span className="compactSessionModel" title={session.model}>
                {session.model}
              </span>
              <span className="compactSessionDot">·</span>
              <span className="compactSessionTime">
                {formatDateTime(session.updatedAt, locale)}
              </span>
            </div>

            <div className="compactSessionRow3">
              <span className="compactSessionTokens">
                {formatTokenCount(session.total.totalTokens, locale)} Token
              </span>
              <strong className="compactSessionCost">
                {formatUsd(session.costUsd, locale)}
              </strong>
            </div>

            {session.parentSessionId ? (
              <div className="compactSessionRowParent">
                <span>parent {session.parentSessionId.slice(0, 8)}</span>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

// 提示词列表
function PromptList({
  prompts,
  locale,
}: {
  prompts: CodexPromptCostBreakdown[];
  locale: string;
}) {
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(() => new Set());

  const toggleExpand = (index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (prompts.length === 0) {
    return (
      <div className="compactEmptySection">
        <span>{locale.startsWith("zh") ? "暂无提示词数据" : "No prompts data"}</span>
      </div>
    );
  }

  return (
    <div className="compactPromptList">
      {prompts.map((prompt, index) => {
        const isExpanded = expandedIndices.has(index);
        return (
          <article
            key={`${prompt.sessionId}-${prompt.timestamp}-${index}`}
            className={`compactPromptItem${isExpanded ? " isExpanded" : ""}`}
            onClick={() => toggleExpand(index)}
          >
            <div className="compactPromptHead">
              <span className="compactPromptRank">{index + 1}</span>
              <strong className="compactPromptCost">
                {formatUsd(prompt.costUsd, locale)}
              </strong>
              <span className="compactPromptExpandHint">
                {isExpanded ? (locale.startsWith("zh") ? "收起" : "Collapse") : (locale.startsWith("zh") ? "展开" : "Expand")}
              </span>
            </div>
            <p className={`compactPromptPreview${isExpanded ? " isFull" : ""}`}>
              {prompt.promptPreview}
            </p>
            <div className="compactPromptMeta">
              <span>{prompt.projectName}</span>
              <span>·</span>
              <span>{prompt.model}</span>
              <span>·</span>
              <span>{formatNumber(prompt.total.totalTokens, locale)} tok</span>
              <span>·</span>
              <span>{prompt.promptChars} ch</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function AnalyticsPanel({
  analytics,
  error,
  loading,
  exporting,
  progress,
  weeklyBudgetUsd,
  savingSettings,
  onRefresh,
  onExport,
  onDeleteSession,
  onUpdateWeeklyBudget,
}: AnalyticsPanelProps) {
  const { copy, locale } = useI18n();
  const text = copy.analytics;

  // 分区状态：项目 / 会话 / 提示 / 活跃
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("projects");
  // 视图状态：main / source-details
  const [view, setView] = useState<"main" | "source-details">("main");
  // 更多菜单
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  // 预算行内编辑
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState(
    weeklyBudgetUsd === null ? "" : String(weeklyBudgetUsd),
  );
  const budgetInputRef = useRef<HTMLInputElement | null>(null);

  // 会话搜索与删除确认
  const [sessionQuery, setSessionQuery] = useState("");
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const deleteConfirmTimerRef = useRef<number | null>(null);

  // 错误展开
  const [errorExpanded, setErrorExpanded] = useState(false);

  // 更多菜单外部点击关闭
  useEffect(() => {
    if (!moreMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [moreMenuOpen]);

  // Esc 返回上一层
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (moreMenuOpen) {
          setMoreMenuOpen(false);
        } else if (isEditingBudget) {
          setIsEditingBudget(false);
        } else if (view === "source-details") {
          setView("main");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moreMenuOpen, isEditingBudget, view]);

  // 同步 budgetDraft
  useEffect(() => {
    setBudgetDraft(weeklyBudgetUsd === null ? "" : String(weeklyBudgetUsd));
  }, [weeklyBudgetUsd]);

  // 过滤会话
  const normalizedQuery = sessionQuery.trim().toLocaleLowerCase();
  const filteredSessions = useMemo(() => {
    const sessions = analytics?.sessions ?? [];
    if (!normalizedQuery) {
      return sessions;
    }
    return sessions.filter((session) =>
      [
        session.sessionId,
        session.parentSessionId ?? "",
        session.projectName,
        session.projectPath,
        session.model,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [analytics?.sessions, normalizedQuery]);

  const clearDeleteConfirmTimer = () => {
    if (deleteConfirmTimerRef.current !== null) {
      window.clearTimeout(deleteConfirmTimerRef.current);
      deleteConfirmTimerRef.current = null;
    }
  };

  const handleDeleteSession = (session: CodexSessionCostBreakdown) => {
    if (deletingSessionId !== null) {
      return;
    }

    if (pendingDeleteSessionId !== session.sessionId) {
      clearDeleteConfirmTimer();
      setPendingDeleteSessionId(session.sessionId);
      deleteConfirmTimerRef.current = window.setTimeout(() => {
        setPendingDeleteSessionId((current) =>
          current === session.sessionId ? null : current,
        );
        deleteConfirmTimerRef.current = null;
      }, 3_000);
      return;
    }

    clearDeleteConfirmTimer();
    setDeletingSessionId(session.sessionId);
    void Promise.resolve(onDeleteSession(session))
      .catch(() => {})
      .finally(() => {
        setPendingDeleteSessionId(null);
        setDeletingSessionId(null);
      });
  };

  useEffect(() => () => clearDeleteConfirmTimer(), []);

  const handleSaveBudget = async () => {
    const trimmed = budgetDraft.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      return;
    }
    await onUpdateWeeklyBudget(value);
    setIsEditingBudget(false);
  };

  const handleClearBudget = async () => {
    setBudgetDraft("");
    await onUpdateWeeklyBudget(null);
    setIsEditingBudget(false);
  };

  const hasData = analytics !== null && analytics.eventCount > 0;
  const showProgress = loading || progress !== null;
  const progressPercent = Math.max(
    0,
    Math.min(100, Math.round(progress?.percent ?? (loading ? 15 : 0))),
  );

  const budgetPercent = analytics?.weeklyBudgetPercent ?? null;
  const hasBudget = weeklyBudgetUsd !== null && weeklyBudgetUsd > 0;
  const hasAnomalies =
    analytics &&
    (analytics.failedPathCount > 0 ||
      analytics.unresolvedForkCount > 0 ||
      analytics.unresolvedUsageEventCount > 0);

  const tabLabels: Record<AnalyticsTab, string> = {
    projects: locale.startsWith("zh") ? "项目" : "Projects",
    sessions: locale.startsWith("zh") ? "会话" : "Sessions",
    prompts: locale.startsWith("zh") ? "提示" : "Prompts",
    heatmap: locale.startsWith("zh") ? "活跃" : "Activity",
  };

  // 数据来源详情子页
  if (view === "source-details") {
    return (
      <section className="compactAnalyticsPage">
        <div className="compactSubpageHeader">
          <button
            type="button"
            className="compactBackButton"
            onClick={() => setView("main")}
          >
            ‹ {locale.startsWith("zh") ? "返回分析" : "Back"}
          </button>
          <h3>{locale.startsWith("zh") ? "数据来源详情" : "Data Source Details"}</h3>
        </div>

        <div className="compactSourceDetailsBody">
          <div className="compactDetailGrid">
            <div className="compactDetailRow">
              <span>{text.sourceFiles}</span>
              <strong>{analytics?.sourcePathCount ?? "--"}</strong>
            </div>
            <div className="compactDetailRow">
              <span>{text.failedSources}</span>
              <strong className={analytics?.failedPathCount ? "tone-danger" : ""}>
                {analytics?.failedPathCount ?? 0}
              </strong>
            </div>
            <div className="compactDetailRow">
              <span>{text.unresolvedForks}</span>
              <strong className={analytics?.unresolvedForkCount ? "tone-warning" : ""}>
                {analytics?.unresolvedForkCount ?? 0}
              </strong>
            </div>
            <div className="compactDetailRow">
              <span>{text.usageAnomalies}</span>
              <strong className={analytics?.unresolvedUsageEventCount ? "tone-warning" : ""}>
                {analytics?.unresolvedUsageEventCount ?? 0}
              </strong>
            </div>
            <div className="compactDetailRow">
              <span>{locale.startsWith("zh") ? "定价数据源" : "Pricing Source"}</span>
              <strong>{analytics?.pricingSource ?? "--"}</strong>
            </div>
            <div className="compactDetailRow">
              <span>{text.updated}</span>
              <strong>{formatDateTime(analytics?.updatedAt ?? null, locale)}</strong>
            </div>
            <div className="compactDetailRow">
              <span>{locale.startsWith("zh") ? "本地定价更新时间" : "Pricing Cache Updated"}</span>
              <strong>{formatDateTime(analytics?.costSourceUpdatedAt ?? null, locale)}</strong>
            </div>
          </div>

          {error ? (
            <div className="compactErrorBox">
              <strong>{text.errorTitle}</strong>
              <p>{error}</p>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="compactAnalyticsPage">
      {/* 1. 紧凑页头 */}
      <header className="compactAnalyticsHeader">
        <div className="compactHeaderTitle">
          <h2>{locale.startsWith("zh") ? "分析" : "Analytics"}</h2>
        </div>

        <div className="compactHeaderActions" ref={moreMenuRef}>
          <button
            type="button"
            className="compactIconButton"
            onClick={onRefresh}
            disabled={loading}
            title={text.refresh}
            aria-label={text.refresh}
          >
            <svg
              className={`iconGlyph${loading ? " isSpinning" : ""}`}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>

          <button
            type="button"
            className="compactIconButton"
            onClick={() => setMoreMenuOpen((o) => !o)}
            aria-label="更多"
            title="更多操作"
            aria-expanded={moreMenuOpen}
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
                disabled={exporting !== null}
                onClick={() => {
                  setMoreMenuOpen(false);
                  onExport("csv");
                }}
              >
                {exporting === "csv" ? text.exporting : text.exportCsv}
              </button>
              <button
                type="button"
                className="compactMenuItem"
                disabled={exporting !== null}
                onClick={() => {
                  setMoreMenuOpen(false);
                  onExport("json");
                }}
              >
                {exporting === "json" ? text.exporting : text.exportJson}
              </button>
              <div className="compactMenuDivider" />
              <button
                type="button"
                className="compactMenuItem"
                onClick={() => {
                  setMoreMenuOpen(false);
                  setView("source-details");
                }}
              >
                {locale.startsWith("zh") ? "数据来源详情" : "Data Source Details"}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {/* 扫描进度细行 */}
      {showProgress ? (
        <div className="compactProgressBarRow" aria-live="polite">
          <div className="compactProgressBarMeta">
            <span>{progressStageLabel(progress, text)}</span>
            <b>{progressPercent}%</b>
          </div>
          <div className="compactProgressBarTrack">
            <i style={{ width: `${progressPercent}%` }} />
          </div>
          {progress?.currentPath ? (
            <span className="compactProgressPath" title={progress.currentPath}>
              {progress.currentPath}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* 紧凑错误条 */}
      {error ? (
        <div className="compactErrorBanner">
          <div className="compactErrorHead">
            <span>⚠️ {text.errorTitle}</span>
            <button
              type="button"
              className="compactTextLink"
              onClick={() => setErrorExpanded((e) => !e)}
            >
              {errorExpanded ? (locale.startsWith("zh") ? "收起" : "Less") : (locale.startsWith("zh") ? "详情" : "More")}
            </button>
          </div>
          {errorExpanded ? <p className="compactErrorDetail">{error}</p> : null}
        </div>
      ) : null}

      {/* 2. 数据摘要 (2 × 2) */}
      <section className="compactStatsContainer">
        <div className="compactStatsGrid">
          <div className="compactStatCell">
            <span className="compactStatLabel">
              {locale.startsWith("zh") ? "总成本" : "Total Cost"}
            </span>
            <strong className="compactStatValue">
              {analytics ? formatUsd(analytics.totalCostUsd, locale) : "--"}
            </strong>
          </div>
          <div className="compactStatCell">
            <span className="compactStatLabel">
              {locale.startsWith("zh") ? "近 7 日" : "Last 7 Days"}
            </span>
            <strong className="compactStatValue">
              {analytics ? formatUsd(analytics.last7dCostUsd, locale) : "--"}
            </strong>
          </div>
          <div className="compactStatCell">
            <span className="compactStatLabel">
              {locale.startsWith("zh") ? "Token" : "Tokens"}
            </span>
            <strong className="compactStatValue">
              {analytics ? formatTokenCount(analytics.total.totalTokens, locale) : "--"}
            </strong>
          </div>
          <div className="compactStatCell">
            <span className="compactStatLabel">
              {locale.startsWith("zh") ? "会话数" : "Sessions"}
            </span>
            <strong className="compactStatValue">
              {analytics ? formatNumber(analytics.sessions.length, locale) : "--"}
            </strong>
          </div>
        </div>

        <div className="compactStatsFoot">
          <span className="compactStatsUpdateTime">
            {locale.startsWith("zh") ? "更新于" : "Updated at"}{" "}
            {analytics ? formatTimeOnly(analytics.updatedAt, locale) : "--"}
          </span>
          {hasAnomalies ? (
            <button
              type="button"
              className="compactAnomalyBadge"
              onClick={() => setView("source-details")}
            >
              ⚠️ {locale.startsWith("zh") ? "存在异常数据 ›" : "Anomalies ›"}
            </button>
          ) : (
            <span className="compactStatusNormal">
              {locale.startsWith("zh") ? "数据正常" : "Normal"}
            </span>
          )}
        </div>
      </section>

      {/* 3. 周预算 */}
      <section className="compactBudgetContainer">
        {isEditingBudget ? (
          <div className="compactBudgetEditMode">
            <div className="compactBudgetEditInputRow">
              <label htmlFor="compactBudgetInput" className="compactBudgetLabel">
                {text.budgetTitle} (USD)
              </label>
              <input
                id="compactBudgetInput"
                ref={budgetInputRef}
                className="compactBudgetInput"
                type="text"
                inputMode="decimal"
                placeholder="20"
                value={budgetDraft}
                onChange={(e) => setBudgetDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSaveBudget();
                  if (e.key === "Escape") setIsEditingBudget(false);
                }}
                autoFocus
              />
            </div>
            <div className="compactBudgetEditActions">
              <button
                type="button"
                className="compactBudgetClearBtn"
                disabled={savingSettings}
                onClick={handleClearBudget}
              >
                {text.budgetClear}
              </button>
              <button
                type="button"
                className="compactBudgetCancelBtn"
                onClick={() => setIsEditingBudget(false)}
              >
                {locale.startsWith("zh") ? "取消" : "Cancel"}
              </button>
              <button
                type="button"
                className="compactBudgetSaveBtn"
                disabled={savingSettings}
                onClick={handleSaveBudget}
              >
                {text.budgetSave}
              </button>
            </div>
          </div>
        ) : (
          <div
            className="compactBudgetSummaryMode"
            onClick={() => setIsEditingBudget(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setIsEditingBudget(true);
              }
            }}
          >
            <div className="compactBudgetSummaryRow">
              <span className="compactBudgetTitle">{text.budgetTitle}</span>
              {hasBudget ? (
                <>
                  <span className="compactBudgetAmounts">
                    {formatUsd(analytics?.last7dCostUsd ?? 0, locale)} /{" "}
                    {formatUsd(weeklyBudgetUsd, locale)}
                  </span>
                  <span
                    className={`compactBudgetStatusBadge tone-${analytics?.weeklyBudgetAlert ?? "ok"}`}
                  >
                    {alertLabel(analytics?.weeklyBudgetAlert ?? "ok", text)}{" "}
                    {budgetPercent !== null ? `${Math.round(budgetPercent)}%` : ""}{" "}
                    ›
                  </span>
                </>
              ) : (
                <span className="compactBudgetSetPrompt">
                  {locale.startsWith("zh") ? "设置周预算 ›" : "Set weekly budget ›"}
                </span>
              )}
            </div>
            {hasBudget ? (
              <div className="compactBudgetMeter">
                <i
                  style={{
                    width: `${Math.min(100, Math.max(0, budgetPercent ?? 0))}%`,
                  }}
                />
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* 4. 内容切换 (4 Tab) */}
      <nav className="compactTabsNav" role="tablist">
        {(["projects", "sessions", "prompts", "heatmap"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`compactTabButton${activeTab === tab ? " isActive" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </nav>

      {/* 分区主体内容 */}
      <div className="compactTabContent">
        {!hasData && !loading ? (
          <div className="compactEmptySection">
            <strong>{text.emptyTitle}</strong>
            <span>{text.emptyDescription}</span>
          </div>
        ) : (
          <>
            {activeTab === "projects" && analytics ? (
              <ProjectRows projects={analytics.projects} locale={locale} />
            ) : null}

            {activeTab === "sessions" && analytics ? (
              <div className="compactSessionsSection">
                <div className="compactSearchRow">
                  <input
                    className="compactSearchInput"
                    value={sessionQuery}
                    placeholder={
                      locale.startsWith("zh")
                        ? "搜索会话 / 项目 / 模型"
                        : "Search sessions / project / model"
                    }
                    onChange={(e) => setSessionQuery(e.target.value)}
                  />
                </div>
                <SessionList
                  sessions={filteredSessions}
                  locale={locale}
                  text={text}
                  pendingDeleteSessionId={pendingDeleteSessionId}
                  deletingSessionId={deletingSessionId}
                  onDeleteSession={handleDeleteSession}
                />
              </div>
            ) : null}

            {activeTab === "prompts" && analytics ? (
              <PromptList prompts={analytics.topPrompts} locale={locale} />
            ) : null}

            {activeTab === "heatmap" && analytics ? (
              <Heatmap buckets={analytics.heatmap} locale={locale} copy={text} />
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
