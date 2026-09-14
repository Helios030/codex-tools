import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n/I18nProvider";
import { effectiveWindowsUsageDisplayMode } from "../utils/quotaDisplayOnboarding";
import { EditorMultiSelect } from "./EditorMultiSelect";
import { ThemeSwitch } from "./ThemeSwitch";
import { SwitchField } from "./SwitchField";
import { QuotaArc, QuotaPowerIcon } from "./accounts/QuotaArc";
import type {
  AppSettings,
  AccountSummary,
  InstalledEditorApp,
  ThemeMode,
  UpdateSettingsOptions,
  WindowsTrayIconStyle,
} from "../types/app";

type SettingsPanelProps = {
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  settings: AppSettings;
  accounts: AccountSummary[];
  installedEditorApps: InstalledEditorApp[];
  hasOpencodeDesktopApp: boolean;
  savingSettings: boolean;
  onUpdateSettings: (patch: Partial<AppSettings>, options?: UpdateSettingsOptions) => void;
};

type TrayVisualPreview = {
  style: WindowsTrayIconStyle;
  dataUrl: string;
  pixelWidth: number;
  pixelHeight: number;
};

export function SettingsPanel({
  themeMode,
  onToggleTheme,
  settings,
  accounts,
  installedEditorApps,
  hasOpencodeDesktopApp,
  savingSettings,
  onUpdateSettings,
}: SettingsPanelProps) {
  const { copy, locale, localeOptions, setLocale } = useI18n();
  const quotaDisplayMode = settings.accountQuotaDisplayMode === "bars" ? "bars" : "dualArc";
  const [trayVisualPreviews, setTrayVisualPreviews] = useState<TrayVisualPreview[]>([]);
  const [runtimePlatform, setRuntimePlatform] = useState<string | null>(null);
  const [debugBuild, setDebugBuild] = useState(false);
  const [pickingCodexLaunchPathKind, setPickingCodexLaunchPathKind] = useState<"file" | "directory" | null>(null);
  const [windowsWidgetsEnabled, setWindowsWidgetsEnabled] = useState(false);
  const [windowsWidgetsError, setWindowsWidgetsError] = useState(false);
  const [openingWindowsTaskbarSettings, setOpeningWindowsTaskbarSettings] = useState(false);
  const languageLabel = copy.topBar.languagePicker;
  const languageOptions = localeOptions.map((item) => ({
    id: item.code,
    label: item.nativeLabel,
  }));
  const isWindows = runtimePlatform === "windows";
  const isMacos = runtimePlatform === "macos";
  const selectedTrayUsageDisplayMode =
    isWindows
      ? effectiveWindowsUsageDisplayMode(settings.trayUsageDisplayMode)
      : settings.trayUsageDisplayMode;
  const trayPreviewScale = typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio || 1) : 1;
  const trayIconStyleOptions: Array<{ value: WindowsTrayIconStyle | "hidden"; label: string }> = [
    { value: "gradientNumberPlate", label: copy.settings.windowsTrayIconStyle.gradientNumberPlate },
    { value: "gradientNumberCard", label: copy.settings.windowsTrayIconStyle.gradientNumberCard },
    { value: "gradientNumber", label: copy.settings.windowsTrayIconStyle.gradientNumber },
    { value: "numberProgressBar", label: copy.settings.windowsTrayIconStyle.numberProgressBar },
    { value: "logoProgressRing", label: copy.settings.windowsTrayIconStyle.logoProgressRing },
    { value: "dualConcentricRing", label: copy.settings.windowsTrayIconStyle.dualConcentricRing },
    { value: "dualTrackPill", label: copy.settings.windowsTrayIconStyle.dualTrackPill },
    { value: "heroNumberDualBars", label: copy.settings.windowsTrayIconStyle.heroNumberDualBars },
  ];
  trayIconStyleOptions.push({ value: "hidden", label: copy.settings.windowsTrayIconStyle.hidden });
  const selectedTrayIconStyle =
    !settings.trayQuotaIconVisible ? "hidden" : settings.windowsTrayIconStyle;
  const warmupAccounts = Array.from(
    new Map(
      accounts
        .filter((account) => account.sourceKind !== "relay")
        .map((account) => [account.accountKey, account]),
    ).values(),
  );

  const toggleWarmupAccount = (accountId: string, enabled: boolean) => {
    const selected = new Set(settings.autoAccountWarmupAccountIds);
    if (enabled) {
      selected.add(accountId);
    } else {
      selected.delete(accountId);
    }
    onUpdateSettings({ autoAccountWarmupAccountIds: Array.from(selected) });
  };

  useEffect(() => {
    let cancelled = false;

    void invoke<string>("get_runtime_platform")
      .then((platform) => {
        if (!cancelled) {
          setRuntimePlatform(platform);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // 浏览器预览没有 Tauri 命令；仅为本地预览保留平台回退，桌面包始终以后端为准。
          const platform = navigator.platform.toLowerCase();
          setRuntimePlatform(
            platform.includes("mac")
              ? "macos"
              : platform.includes("win")
                ? "windows"
                : "other",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void invoke<boolean>("is_debug_build")
      .then((enabled) => {
        if (!cancelled) {
          setDebugBuild(enabled);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDebugBuild(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isWindows && !isMacos) {
      return;
    }

    let cancelled = false;
    void invoke<TrayVisualPreview[]>("get_tray_visual_previews", {
      lightTheme: themeMode !== "dark",
      devicePixelRatio: trayPreviewScale,
    })
      .then((previews) => {
        if (!cancelled) {
          setTrayVisualPreviews(previews);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTrayVisualPreviews([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isMacos, isWindows, themeMode, trayPreviewScale]);

  useEffect(() => {
    if (!isWindows) {
      return;
    }

    let cancelled = false;
    const refreshWindowsWidgetsState = () => {
      void invoke<boolean>("get_windows_widgets_enabled")
        .then((enabled) => {
          if (!cancelled) {
            setWindowsWidgetsEnabled(enabled);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setWindowsWidgetsEnabled(false);
          }
        });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshWindowsWidgetsState();
      }
    };

    refreshWindowsWidgetsState();
    window.addEventListener("focus", refreshWindowsWidgetsState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshWindowsWidgetsState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isWindows]);

  const openWindowsTaskbarSettings = async () => {
    if (openingWindowsTaskbarSettings) {
      return;
    }
    setOpeningWindowsTaskbarSettings(true);
    setWindowsWidgetsError(false);
    try {
      await invoke("open_windows_taskbar_settings");
    } catch {
      setWindowsWidgetsError(true);
    } finally {
      setOpeningWindowsTaskbarSettings(false);
    }
  };

  const pickCodexLaunchPath = async (kind: "file" | "directory") => {
    if (savingSettings || pickingCodexLaunchPathKind) {
      return;
    }

    setPickingCodexLaunchPathKind(kind);
    try {
      const selected = await invoke<string | null>("pick_codex_launch_path", {
        kind,
        currentPath: settings.codexLaunchPath,
      });
      if (!selected) {
        return;
      }
      onUpdateSettings({ codexLaunchPath: selected });
    } finally {
      setPickingCodexLaunchPathKind(null);
    }
  };

  return (
    <section className="settingsPage" aria-label={copy.settings.title}>
      <div className="settingsShell">
        <div className="settingsGroup">
          <div className="settingRow">
            <div className="settingMeta">
              <strong>{languageLabel}</strong>
            </div>
            <EditorMultiSelect
              options={languageOptions}
              value={locale}
              className="languagePicker"
              ariaLabel={languageLabel}
              placeholder={languageLabel}
              onChange={setLocale}
            />
          </div>

          <div className="settingRow">
            <div className="settingMeta">
              <strong>{copy.settings.theme.label}</strong>
            </div>
            <ThemeSwitch themeMode={themeMode} onToggle={onToggleTheme} />
          </div>

          <div className="settingRow quotaStyleSetting">
            <div className="settingMeta"><strong>{copy.settings.theme.quotaStyleLabel}</strong></div>
            <div className="modeGroup quotaStyleModes" role="radiogroup" aria-label={copy.settings.theme.quotaStyleLabel}>
              {(["bars", "dualArc"] as const).map((mode) => (
                <button key={mode} type="button" role="radio"
                  aria-checked={quotaDisplayMode === mode}
                  className={quotaDisplayMode === mode ? "primary" : "ghost"}
                  tabIndex={quotaDisplayMode === mode ? 0 : -1}
                  disabled={savingSettings} onClick={() => onUpdateSettings({ accountQuotaDisplayMode: mode })}
                  onKeyDown={(event) => {
                    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                    const target = event.key === "Home" ? "bars" : event.key === "End" ? "dualArc" : mode === "bars" ? "dualArc" : "bars";
                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[target === "bars" ? 0 : 1]?.focus();
                    onUpdateSettings({ accountQuotaDisplayMode: target });
                  }}>
                  {copy.settings.theme[mode]}
                </button>
              ))}
            </div>
            <div className="quotaStylePreview" role="group" aria-label={copy.settings.theme.quotaPreview}>
              <div className="quotaPreviewValues">
                <span className="quotaNumeric quotaNumericWeek">{copy.accountsGrid.weekRemaining}<strong>89%</strong></span>
                {quotaDisplayMode === "bars" ? <div className="usageBar"><span style={{ width: "89%" }} /></div> : null}
                <span className="quotaNumeric quotaNumericFive">{copy.accountsGrid.fiveHourRemaining}<strong>59%</strong></span>
                {quotaDisplayMode === "bars" ? <div className="usageBar"><span style={{ width: "59%" }} /></div> : null}
              </div>
              {quotaDisplayMode === "dualArc" ? <QuotaArc week={89} fiveHour={59}><span className="quotaStartButton isCurrent" aria-hidden="true"><QuotaPowerIcon /></span></QuotaArc> : null}
            </div>
            <p className="quotaStyleHint">{copy.settings.theme.quotaStyleHint}</p>
          </div>

          {isMacos || isWindows ? (
            <div className="settingRow settingRowTrayUsage">
              <div className="settingMeta">
                <strong>{copy.settings.trayUsageDisplay.label}</strong>
              </div>
              <div className="trayUsageSettingsControls">
              <div
                className="modeGroup trayUsageModeGroup"
                role="radiogroup"
                aria-label={copy.settings.trayUsageDisplay.groupAriaLabel}
              >
                <button
                  className={selectedTrayUsageDisplayMode === "remaining" ? "primary" : "ghost"}
                  disabled={savingSettings}
                  onClick={() => onUpdateSettings({ trayUsageDisplayMode: "remaining" })}
                  aria-pressed={selectedTrayUsageDisplayMode === "remaining"}
                >
                  {copy.settings.trayUsageDisplay.remaining}
                </button>
                <button
                  className={selectedTrayUsageDisplayMode === "used" ? "primary" : "ghost"}
                  disabled={savingSettings}
                  onClick={() => onUpdateSettings({ trayUsageDisplayMode: "used" })}
                  aria-pressed={selectedTrayUsageDisplayMode === "used"}
                >
                  {copy.settings.trayUsageDisplay.used}
                </button>
                <button
                  className={selectedTrayUsageDisplayMode === "fiveHourRemaining" ? "primary" : "ghost"}
                  disabled={savingSettings}
                  onClick={() => onUpdateSettings({ trayUsageDisplayMode: "fiveHourRemaining" })}
                  aria-pressed={selectedTrayUsageDisplayMode === "fiveHourRemaining"}
                >
                  {copy.settings.trayUsageDisplay.fiveHourRemaining}
                </button>
                <button
                  className={selectedTrayUsageDisplayMode === "oneWeekRemaining" ? "primary" : "ghost"}
                  disabled={savingSettings}
                  onClick={() => onUpdateSettings({ trayUsageDisplayMode: "oneWeekRemaining" })}
                  aria-pressed={selectedTrayUsageDisplayMode === "oneWeekRemaining"}
                >
                  {copy.settings.trayUsageDisplay.oneWeekRemaining}
                </button>
                {isMacos ? (
                  <button
                    className={settings.trayUsageDisplayMode === "hidden" ? "primary" : "ghost"}
                    disabled={savingSettings}
                    onClick={() => onUpdateSettings({ trayUsageDisplayMode: "hidden" })}
                    aria-pressed={settings.trayUsageDisplayMode === "hidden"}
                  >
                    {copy.settings.trayUsageDisplay.hidden}
                  </button>
                ) : null}
              </div>
              </div>
            </div>
          ) : null}

          {isWindows || isMacos ? (
            <div className="settingRow settingRowTrayUsage">
              <div className="settingMeta">
                <strong>{copy.settings.windowsTrayIconStyle.label}</strong>
              </div>
              <div className="trayIconStyleControls">
                <div
                  className="modeGroup trayUsageModeGroup trayIconStyleGroup"
                  role="radiogroup"
                  aria-label={copy.settings.windowsTrayIconStyle.groupAriaLabel}
                >
                  {trayIconStyleOptions.map((option) => {
                    const isHiddenOption = option.value === "hidden";
                    const preview = isHiddenOption
                      ? undefined
                      : trayVisualPreviews.find((item) => item.style === option.value);
                    if (isMacos && option.value === "logoProgressRing") {
                      const styleSelected = selectedTrayIconStyle === option.value;
                      return (
                        <div
                          key={option.value}
                          className={`trayIconStyleOption trayIconStyleCompound ${
                            styleSelected ? "isSelected" : ""
                          }`}
                          role="group"
                          aria-label={option.label}
                        >
                          <span className="trayLogoRingVariantPreviews">
                            {[false, true].map((showPercentage) => {
                              const variantLabel = showPercentage
                                ? copy.settings.macosTrayLogoRingVariants.withPercentage
                                : copy.settings.macosTrayLogoRingVariants.withoutPercentage;
                              const variantSelected =
                                styleSelected &&
                                settings.macosTrayLogoRingShowPercentage === showPercentage;
                              return (
                                <button
                                  key={String(showPercentage)}
                                  type="button"
                                  className={`trayLogoRingVariant ${
                                    variantSelected ? "isSelected" : ""
                                  }`}
                                  disabled={savingSettings}
                                  onClick={() =>
                                    onUpdateSettings({
                                      windowsTrayIconStyle: "logoProgressRing",
                                      trayQuotaIconVisible: true,
                                      macosTrayLogoRingShowPercentage: showPercentage,
                                    })
                                  }
                                  aria-label={`${option.label}：${variantLabel}`}
                                  aria-pressed={variantSelected}
                                  title={variantLabel}
                                >
                                  <span className="trayLogoRingVariantArtwork" aria-hidden="true">
                                    {preview ? (
                                      <img
                                        src={preview.dataUrl}
                                        alt=""
                                        draggable={false}
                                        style={{
                                          width: `${preview.pixelWidth / trayPreviewScale}px`,
                                          height: `${preview.pixelHeight / trayPreviewScale}px`,
                                        }}
                                      />
                                    ) : (
                                      <span className="trayIconPreviewPlaceholder" />
                                    )}
                                    {showPercentage ? (
                                      <span className="trayLogoRingVariantNumber">97%</span>
                                    ) : null}
                                  </span>
                                </button>
                              );
                            })}
                          </span>
                          <span className="trayIconStyleLabel">{option.label}</span>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={option.value}
                        className={`trayIconStyleOption ${
                          selectedTrayIconStyle === option.value ? "primary" : "ghost"
                        }`}
                        disabled={savingSettings}
                        onClick={() => {
                          if (option.value === "hidden") {
                            onUpdateSettings({ trayQuotaIconVisible: false });
                            return;
                          }
                          onUpdateSettings({
                            windowsTrayIconStyle: option.value,
                            trayQuotaIconVisible: true,
                          });
                        }}
                        aria-label={option.label}
                        aria-pressed={selectedTrayIconStyle === option.value}
                        title={option.label}
                      >
                        <span className="trayIconPreviewFrame" aria-hidden="true">
                          {isHiddenOption ? (
                            <span className="trayIconHiddenPreview" />
                          ) : preview ? (
                            <img
                              src={preview.dataUrl}
                              alt=""
                              draggable={false}
                              style={{
                                width: `${preview.pixelWidth / trayPreviewScale}px`,
                                height: `${preview.pixelHeight / trayPreviewScale}px`,
                              }}
                            />
                          ) : (
                            <span className="trayIconPreviewPlaceholder" />
                          )}
                        </span>
                        <span className="trayIconStyleLabel">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {isMacos && debugBuild ? (
            <div className="settingRow">
              <div className="settingMeta">
                <strong>{copy.settings.macosQuotaOnboardingPreview.label}</strong>
                <span className="settingDescription">
                  {copy.settings.macosQuotaOnboardingPreview.description}
                </span>
              </div>
              <div className="settingActionGroup">
                <button
                  type="button"
                  className="ghost"
                  disabled={savingSettings}
                  onClick={() =>
                    onUpdateSettings(
                      { macosQuotaOnboardingCompleted: false },
                      { silent: true, throwOnError: true, keepInteractive: true },
                    )
                  }
                >
                  {copy.settings.macosQuotaOnboardingPreview.open}
                </button>
              </div>
            </div>
          ) : null}

          {isWindows ? (
            <div className="settingRow settingRowWindowsTaskbar">
              <div className="settingMeta">
                <strong>{copy.settings.windowsTaskbarWidget.label}</strong>
              </div>
              <div className="windowsTaskbarWidgetControls">
                <div
                  className="modeGroup trayUsageModeGroup"
                  role="radiogroup"
                  aria-label={copy.settings.windowsTaskbarWidget.groupAriaLabel}
                >
                  <button
                    className={settings.windowsTaskbarWidgetPlacement === "left" ? "primary" : "ghost"}
                    disabled={savingSettings}
                    onClick={() => onUpdateSettings({ windowsTaskbarWidgetPlacement: "left" })}
                    aria-pressed={settings.windowsTaskbarWidgetPlacement === "left"}
                  >
                    {copy.settings.windowsTaskbarWidget.left}
                  </button>
                  <button
                    className={settings.windowsTaskbarWidgetPlacement === "embedded" ? "primary" : "ghost"}
                    disabled={savingSettings}
                    onClick={() => onUpdateSettings({ windowsTaskbarWidgetPlacement: "embedded" })}
                    aria-pressed={settings.windowsTaskbarWidgetPlacement === "embedded"}
                  >
                    {copy.settings.windowsTaskbarWidget.right}
                  </button>
                  <button
                    className={settings.windowsTaskbarWidgetPlacement === "hidden" ? "primary" : "ghost"}
                    disabled={savingSettings}
                    onClick={() => onUpdateSettings({ windowsTaskbarWidgetPlacement: "hidden" })}
                    aria-pressed={settings.windowsTaskbarWidgetPlacement === "hidden"}
                  >
                    {copy.settings.windowsTaskbarWidget.hidden}
                  </button>
                </div>
                {windowsWidgetsEnabled ? (
                  <div className="windowsWidgetsActionRow">
                    {windowsWidgetsError ? (
                      <span className="settingDescription isError" role="alert">
                        {copy.settings.windowsWidgets.openFailed}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="primary windowsWidgetsButton"
                      disabled={openingWindowsTaskbarSettings}
                      onClick={() => void openWindowsTaskbarSettings()}
                      aria-label={copy.settings.windowsWidgets.disableAriaLabel}
                    >
                      {copy.settings.windowsWidgets.disable}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="settingsGroup">
          <SwitchField
            checked={settings.autoAccountWarmupEnabled}
            onChange={(checked) => onUpdateSettings({ autoAccountWarmupEnabled: checked })}
            label={copy.settings.accountWarmup.label}
            checkedText={copy.settings.accountWarmup.checkedText}
            uncheckedText={copy.settings.accountWarmup.uncheckedText}
            disabled={savingSettings}
          />
          <div className="settingRow settingRowCompact settingRowNested warmupSettingsRow">
            <div className="settingMeta">
              <strong>{copy.settings.accountWarmup.accountsLabel}</strong>
              <span className="settingDescription">
                {copy.settings.accountWarmup.description}
              </span>
            </div>
            {warmupAccounts.length > 0 ? (
              <div className="warmupAccountChoices">
                {warmupAccounts.map((account) => (
                  <label key={account.id} className="warmupAccountChoice">
                    <input
                      type="checkbox"
                      checked={settings.autoAccountWarmupAccountIds.includes(account.id)}
                      disabled={savingSettings}
                      onChange={(event) =>
                        toggleWarmupAccount(account.id, event.currentTarget.checked)
                      }
                    />
                    <span>{account.label}</span>
                  </label>
                ))}
              </div>
            ) : (
              <span className="settingValueMuted">
                {copy.settings.accountWarmup.noAccounts}
              </span>
            )}
          </div>
        </div>

        <div className="settingsGroup">
          <SwitchField
            checked={settings.launchAtStartup}
            onChange={(checked) => onUpdateSettings({ launchAtStartup: checked })}
            label={copy.settings.launchAtStartup.label}
            checkedText={copy.settings.launchAtStartup.checkedText}
            uncheckedText={copy.settings.launchAtStartup.uncheckedText}
            disabled={savingSettings}
          />

          <SwitchField
            checked={settings.launchCodexAfterSwitch}
            onChange={(checked) => onUpdateSettings({ launchCodexAfterSwitch: checked })}
            label={copy.settings.launchCodexAfterSwitch.label}
            checkedText={copy.settings.launchCodexAfterSwitch.checkedText}
            uncheckedText={copy.settings.launchCodexAfterSwitch.uncheckedText}
            disabled={savingSettings}
          />

          <SwitchField
            checked={settings.launchCodexAsAdmin}
            onChange={(checked) => onUpdateSettings({ launchCodexAsAdmin: checked })}
            label={copy.settings.launchCodexAsAdmin.label}
            checkedText={copy.settings.launchCodexAsAdmin.checkedText}
            uncheckedText={copy.settings.launchCodexAsAdmin.uncheckedText}
            disabled={savingSettings || !settings.launchCodexAfterSwitch}
          />

          <SwitchField
            checked={settings.smartSwitchIncludeApi}
            onChange={(checked) => onUpdateSettings({ smartSwitchIncludeApi: checked })}
            label={copy.settings.smartSwitchIncludeApi.label}
            checkedText={copy.settings.smartSwitchIncludeApi.checkedText}
            uncheckedText={copy.settings.smartSwitchIncludeApi.uncheckedText}
            disabled={savingSettings}
          />

          <div className="settingRow">
            <div className="settingMeta">
              <strong>{copy.settings.codexLaunchPath.label}</strong>
            </div>
            <div className="settingFieldGroup">
              {settings.codexLaunchPath ? (
                <span className="settingPathValue">{settings.codexLaunchPath}</span>
              ) : null}
              <div className="settingActionGroup">
                {settings.codexLaunchPath ? (
                  <button
                    className="ghost settingPathClearButton"
                    type="button"
                    aria-label={copy.common.clear}
                    disabled={savingSettings || pickingCodexLaunchPathKind !== null}
                    onClick={() => onUpdateSettings({ codexLaunchPath: null })}
                  >
                    ×
                  </button>
                ) : null}
                <button
                  className="ghost"
                  type="button"
                  disabled={savingSettings || pickingCodexLaunchPathKind !== null}
                  onClick={() => {
                    void pickCodexLaunchPath("file");
                  }}
                >
                  {copy.addAccount.uploadChooseFiles}
                </button>
                <button
                  className="ghost"
                  type="button"
                  disabled={savingSettings || pickingCodexLaunchPathKind !== null}
                  onClick={() => {
                    void pickCodexLaunchPath("directory");
                  }}
                >
                  {copy.addAccount.uploadChooseFolder}
                </button>
              </div>
            </div>
          </div>

          <SwitchField
            checked={settings.syncOpencodeOpenaiAuth}
            onChange={(checked) => onUpdateSettings({ syncOpencodeOpenaiAuth: checked })}
            label={copy.settings.syncOpencode.label}
            checkedText={copy.settings.syncOpencode.checkedText}
            uncheckedText={copy.settings.syncOpencode.uncheckedText}
            disabled={savingSettings}
          />

          {settings.syncOpencodeOpenaiAuth && hasOpencodeDesktopApp ? (
            <SwitchField
              checked={settings.restartOpencodeDesktopOnSwitch}
              onChange={(checked) =>
                onUpdateSettings({ restartOpencodeDesktopOnSwitch: checked })
              }
              label={copy.settings.restartOpencodeDesktop.label}
              checkedText={copy.settings.restartOpencodeDesktop.checkedText}
              uncheckedText={copy.settings.restartOpencodeDesktop.uncheckedText}
              disabled={savingSettings}
              rowClassName="settingRowCompact settingRowNested"
            />
          ) : null}

          <SwitchField
            checked={settings.restartEditorsOnSwitch}
            onChange={(checked) => {
              if (checked && settings.restartEditorTargets.length === 0 && installedEditorApps.length > 0) {
                onUpdateSettings({
                  restartEditorsOnSwitch: true,
                  restartEditorTargets: [installedEditorApps[0].id],
                });
                return;
              }
              onUpdateSettings({ restartEditorsOnSwitch: checked });
            }}
            label={copy.settings.restartEditorsOnSwitch.label}
            checkedText={copy.settings.restartEditorsOnSwitch.checkedText}
            uncheckedText={copy.settings.restartEditorsOnSwitch.uncheckedText}
            disabled={savingSettings}
          />

          {settings.restartEditorsOnSwitch ? (
            <div className="settingRow settingRowCompact settingRowNested">
              <div className="settingMeta">
                <strong>{copy.settings.restartEditorTargets.label}</strong>
              </div>
              {installedEditorApps.length > 0 ? (
                <EditorMultiSelect
                  options={installedEditorApps}
                  value={settings.restartEditorTargets[0] ?? null}
                  onChange={(selected) =>
                    onUpdateSettings(
                      { restartEditorTargets: [selected] },
                      { silent: true, keepInteractive: true },
                    )
                  }
                />
              ) : (
                <span className="settingValueMuted">{copy.settings.noSupportedEditors}</span>
              )}
            </div>
          ) : null}
        </div>

      </div>
    </section>
  );
}
