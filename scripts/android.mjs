import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { androidLocalEnvironment, androidTargets, resolveAndroidEnvironment } from "./android-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [action = "check", ...args] = process.argv.slice(2);
if (!["check", "init", "dev", "build", "test"].includes(action)) {
  console.error("Usage: node scripts/android.mjs check|init|dev|build|test");
  process.exit(2);
}
const targetOption = args.findIndex((arg) => arg === "--target" || arg === "-t");
const target = args.find((arg) => arg.startsWith("--target="))?.split("=")[1]
  || (targetOption >= 0 ? args[targetOption + 1] : "aarch64");
if (!target || !(target in androidTargets)) {
  console.error(`Unsupported Android target. Choose ${Object.keys(androidTargets).join(", ")}.`);
  process.exit(2);
}
let detected;
try {
  detected = resolveAndroidEnvironment(androidLocalEnvironment(path.join(root, "android.local.json")));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
let ready = true;
function check(label, value, instruction) {
  console.log(`${value ? "OK" : "MISSING"} ${label}${typeof value === "string" && value ? `: ${value}` : ""}`);
  if (!value) { ready = false; console.log(`  ${instruction}`); }
}
console.log("Kitto Android environment (no automatic installations)\n");
check("Java", detected.javaHome, "Install Android Studio or set JAVA_HOME to its jbr directory.");
check("Android SDK", detected.sdk, "Install Android Studio and set ANDROID_HOME to the SDK directory.");
check("SDK Platform-Tools", detected.platformTools, "Install Android SDK Platform-Tools in SDK Manager.");
check("SDK platform", detected.platforms.length > 0, "Install an Android SDK Platform in Android Studio's SDK Manager.");
check("SDK Build-Tools", detected.buildTools.length > 0, "Install Android SDK Build-Tools in SDK Manager.");
check("Android NDK", detected.ndk, "Install NDK (Side by side) in SDK Manager, then rerun this check.");
check("rustup", detected.rustup, "Install Rust through rustup and restart your terminal.");
if (detected.rustup) {
  const installed = spawnSync(detected.rustup, ["target", "list", "--installed"], { env: detected.env, encoding: "utf8", windowsHide: true });
  const required = androidTargets[target];
  check(`Rust target ${required}`, installed.status === 0 && installed.stdout.split(/\s+/).includes(required), `Run: rustup target add ${required}`);
}
if (!ready) {
  console.error("\nAndroid setup is incomplete. See docs/android.md. Desktop commands remain available.");
  process.exit(1);
}
if (action === "check") process.exit(0);
for (const key of ["GRADLE_USER_HOME", "CARGO_TARGET_DIR", "TMP", "TEMP"]) {
  if (detected.env[key]) mkdirSync(detected.env[key], { recursive: true });
}
const androidRoot = path.join(root, "src-tauri", "gen", "android");
const initialized = existsSync(path.join(androidRoot, "gradle", "wrapper", "gradle-wrapper.jar"));
if (action === "init" && initialized) {
  console.log("\nAndroid project is already initialized. Use android:dev or android:build.");
  process.exit(0);
}
if (action !== "init" && !initialized) {
  console.error("Run npm run android:init first.");
  process.exit(1);
}
if (action === "test") {
  const java = path.join(detected.javaHome, "bin", process.platform === "win32" ? "java.exe" : "java");
  const result = spawnSync(java, ["-jar", path.join(androidRoot, "gradle", "wrapper", "gradle-wrapper.jar"),
    "--project-dir", androidRoot, ":tauri-plugin-android-audio:testDebugUnitTest", "--console=plain", ...args], {
    cwd: root, env: detected.env, stdio: "inherit", windowsHide: true,
  });
  if (result.error) console.error(result.error.message);
  process.exit(result.status ?? 1);
}
const options = action === "init" ? ["--ci", "--skip-targets-install", ...args]
  : action === "build" && targetOption < 0 && !args.some((arg) => arg.startsWith("--target="))
    ? ["--target", target, ...args] : args;
const result = spawnSync(process.execPath, [path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js"), "android", action, ...options], {
  cwd: root, env: detected.env, stdio: "inherit", windowsHide: true,
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
