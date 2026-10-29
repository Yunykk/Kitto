import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { compileModule } from "svelte/compiler";
import ts from "typescript";

const { outputText } = ts.transpileModule(
  readFileSync(new URL("../src/lib/appearance.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } },
);
const moduleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const appearanceUrl = moduleUrl(outputText);
const appearance = await import(appearanceUrl);

const controllerTs = ts.transpileModule(
  readFileSync(new URL("../src/lib/appearance.svelte.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } },
).outputText;
let controllerJs = compileModule(controllerTs, { filename: "appearance.svelte.js", generate: "client" }).js.code;
for (const [name, url] of Object.entries({
  "svelte/internal/client": import.meta.resolve("svelte/internal/client"),
  svelte: moduleUrl("export const onMount = callback => { globalThis.__appearanceHarness.mount = callback; };"),
  "./appearance": appearanceUrl,
})) {
  controllerJs = controllerJs.replaceAll(`"${name}"`, JSON.stringify(url));
  controllerJs = controllerJs.replaceAll(`'${name}'`, JSON.stringify(url));
}
const { createAppearance } = await import(moduleUrl(controllerJs));

afterEach(() => {
  delete globalThis.__appearanceHarness;
  delete globalThis.localStorage;
  delete globalThis.document;
});

function setup(saved) {
  const entries = new Map(saved === undefined ? [] : [[appearance.APPEARANCE_KEY, saved]]);
  entries.set("kitto.settings", "playback settings");
  const styles = new Map();
  const root = { dataset: {}, style: { setProperty: (key, value) => styles.set(key, value) } };
  const harness = globalThis.__appearanceHarness = { writes: 0 };
  globalThis.document = { documentElement: root };
  globalThis.localStorage = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { harness.writes += 1; entries.set(key, value); },
  };
  return { controller: createAppearance(), entries, root, styles, harness };
}

test("appearance rejects corrupt records and unsupported schema versions", () => {
  for (const value of [null, [], "dark", 4, {}, { version: 2, theme: "editorial" }]) {
    assert.deepEqual(appearance.parseAppearance(value), appearance.defaultAppearance);
  }
});

test("appearance validates each field and normalizes custom colors", () => {
  assert.deepEqual(appearance.parseAppearance({ version: 1, theme: "paper-club", mode: "dark", accent: " #ABC " }), {
    theme: "paper-club", mode: "dark", accent: "#aabbcc",
  });
  assert.deepEqual(appearance.parseAppearance({ version: 1, theme: "missing", mode: "auto", accent: "url(example)" }), appearance.defaultAppearance);
});

test("all six themes are independently recognized", () => {
  assert.equal(appearance.themes.length, 6);
  assert.equal(new Set(appearance.themes.map(theme => theme.id)).size, 6);
  for (const theme of appearance.themes) assert.equal(appearance.isThemeId(theme.id), true);
});

test("accent text stays readable for extreme and preset colors in both modes", () => {
  const colors = ["#000000", "#ffffff", "#ffff00", "#0000ff", ...appearance.accentPresets.map(preset => preset.color)];
  for (const color of colors) {
    for (const mode of ["light", "dark"]) {
      const result = appearance.accentColors(color, mode);
      assert.ok(appearance.contrastRatio(result.accent, result.onAccent) >= 4.5, `${color} ${mode} label`);
      assert.ok(appearance.contrastRatio(result.ink, mode === "dark" ? "#202124" : "#f0ece3") >= 5, `${color} ${mode} ink`);
    }
  }
});

test("appearance restores saved choices before allowing writes", () => {
  const { controller, entries, root, styles, harness } = setup(JSON.stringify({
    version: 1, theme: "tape-deck", mode: "dark", accent: "#aabbcc",
  }));
  assert.equal(controller.isReady, false);
  assert.equal(controller.setTheme("editorial"), false);
  assert.equal(harness.writes, 0);
  harness.mount();
  assert.equal(controller.isReady, true);
  assert.equal(controller.theme, "tape-deck");
  assert.equal(controller.mode, "dark");
  assert.equal(controller.accent, "#aabbcc");
  assert.equal(root.dataset.theme, "tape-deck");
  assert.equal(root.dataset.mode, "dark");
  assert.equal(styles.get("--color-accent"), "#aabbcc");
  assert.equal(harness.writes, 0);
  controller.setTheme("paper-club");
  controller.setAccent("#123");
  controller.setMode("light");
  assert.deepEqual(JSON.parse(entries.get(appearance.APPEARANCE_KEY)), {
    version: 1, theme: "paper-club", mode: "light", accent: "#112233",
  });
  controller.reset();
  assert.equal(entries.get("kitto.settings"), "playback settings");
  assert.equal(controller.theme, "orbit");
});

test("corrupt and unavailable storage do not prevent appearance controls working", () => {
  const { controller, harness } = setup("broken JSON");
  harness.mount();
  assert.equal(controller.isReady, true);
  assert.equal(controller.theme, "orbit");
  assert.match(controller.error, /load/);
  globalThis.localStorage.setItem = () => { throw new Error("Quota"); };
  assert.equal(controller.setMode("dark"), false);
  assert.equal(controller.mode, "dark");
  assert.match(controller.error, /could not be saved/);
  assert.equal(controller.setAccent("not a color"), false);
  assert.equal(controller.accent, "#ff6a1a");
});
