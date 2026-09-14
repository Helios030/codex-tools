import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("startup defaults to the narrowest window, dual arcs and dark theme", () => {
  const windowConfig = JSON.parse(read("src-tauri/tauri.conf.json")).app.windows[0];
  assert.equal(windowConfig.width, windowConfig.minWidth);
  assert.equal(windowConfig.width, 420);
  assert.equal(windowConfig.height, 720);
  assert.match(read("src/hooks/useCodexController.ts"), /accountQuotaDisplayMode: "dualArc"/);
  assert.match(read("src/hooks/useThemeMode.ts"), /saved === "dark" \|\| saved === "light" \? saved : "dark"/);
  assert.match(read("index.html"), /data-theme="dark"/);
});

test("settings no longer includes the project, version or update module", () => {
  const settings = read("src/components/SettingsPanel.tsx");
  assert.doesNotMatch(settings, /projectInfo|getVersion|onCheckUpdate|PROJECT_REPOSITORY|PROJECT_RELEASES|PROJECT_CHANGELOG|PROJECT_ISSUES/);
  assert.doesNotMatch(read("src/App.tsx"), /UpdateBanner|DebugFloatingTool|app-menu-check-update/);
});

test("manual maintenance removes automatic checks and updater plugin access", () => {
  assert.doesNotMatch(read("src/hooks/useCodexController.ts"), /plugin-updater|plugin-process|checkForAppUpdate|UPDATE_CHECK_MS|downloadAndInstall/);
  assert.doesNotMatch(read("src-tauri/src/lib.rs"), /tauri_plugin_updater|tauri_plugin_process|APP_MENU_CHECK_UPDATES/);
  assert.doesNotMatch(read("src-tauri/Cargo.toml"), /tauri-plugin-updater|tauri-plugin-process/);
  const config = JSON.parse(read("src-tauri/tauri.conf.json"));
  assert.equal(config.bundle.createUpdaterArtifacts, false);
  assert.equal(config.plugins.updater, undefined);
  const permissions = JSON.parse(read("src-tauri/capabilities/default.json")).permissions;
  assert.equal(permissions.includes("updater:default"), false);
  assert.equal(permissions.includes("process:default"), false);
  const dependencies = JSON.parse(read("package.json")).dependencies;
  assert.equal(dependencies["@tauri-apps/plugin-updater"], undefined);
  assert.equal(dependencies["@tauri-apps/plugin-process"], undefined);
});
