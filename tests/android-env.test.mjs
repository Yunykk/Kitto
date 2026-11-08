import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { androidLocalEnvironment, resolveAndroidEnvironment } from "../scripts/android-env.mjs";

const normalize = (value) => value.replaceAll("\\", "/");
function fixture(overrides = {}, remove = []) {
  const env = { USERPROFILE: "C:/User", JAVA_HOME: "C:/JDK", ANDROID_HOME: "C:/SDK", CARGO_HOME: "C:/Cargo", PATH: "original", ...overrides };
  const paths = new Set([
    "C:/JDK/bin/java.exe", "C:/JDK/bin/javac.exe", "C:/SDK", "C:/SDK/platforms", "C:/SDK/build-tools", "C:/SDK/platform-tools/adb.exe", "C:/SDK/ndk", "C:/Cargo/bin/rustup.exe",
    ...["9.9.9", "10.0.0"].flatMap(version => [`C:/SDK/ndk/${version}/source.properties`, `C:/SDK/ndk/${version}/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe`]),
  ]);
  remove.forEach(value => paths.delete(value));
  const listing = { "C:/SDK/ndk": ["9.9.9", "10.0.0", ".temp"], "C:/SDK/platforms": ["android-36"], "C:/SDK/build-tools": ["36.0.0", "README"] };
  return { env, result: resolveAndroidEnvironment(env, "win32", p => paths.has(normalize(p)), p => listing[normalize(p)] ?? []) };
}

test("Android environment resolves complete SDK/JDK/NDK without changing caller variables", () => {
  const { env, result } = fixture();
  assert.equal(normalize(result.ndk), "C:/SDK/ndk/10.0.0");
  assert.equal(result.javaHome, "C:/JDK");
  assert.equal(normalize(result.rustup), "C:/Cargo/bin/rustup.exe");
  assert.equal(result.platformTools, true);
  assert.deepEqual(result.buildTools, ["36.0.0"]);
  assert.equal(env.NDK_HOME, undefined);
  assert.equal(env.PATH, "original");
  assert.equal(result.env.NDK_HOME, result.ndk);
});

test("explicit invalid NDK and Java paths are reported rather than silently replaced", () => {
  assert.equal(fixture({ NDK_HOME: "C:/Wrong" }).result.ndk, "");
  assert.equal(fixture({ JAVA_HOME: "C:/Wrong" }).result.javaHome, "");
});

test("incomplete NDK installs and JRE-only installations cannot pass readiness checks", () => {
  const { result } = fixture({}, [
    "C:/SDK/ndk/10.0.0/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe",
    "C:/JDK/bin/javac.exe", "C:/SDK/platform-tools/adb.exe",
  ]);
  assert.equal(normalize(result.ndk), "C:/SDK/ndk/9.9.9");
  assert.equal(result.javaHome, "");
  assert.equal(result.platformTools, false);
});

test("missing SDK produces useful empty diagnostics without reading nonexistent directories", () => {
  const env = { HOME: "/home/test", JAVA_HOME: "/jdk", PATH: "/bin" };
  const result = resolveAndroidEnvironment(env, "linux", () => false, () => { throw new Error("Unexpected listing"); });
  assert.equal(result.sdk, ""); assert.equal(result.ndk, ""); assert.deepEqual(result.platforms, []);
});

test("local Android paths are opt-in defaults and never override the caller environment", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "kitto-android-env-"));
  const file = path.join(directory, "android.local.json");
  try {
    const env = { NDK_HOME: "explicit", PATH: "original", TEMP: "system-temp" };
    assert.deepEqual(androidLocalEnvironment(file, env), env);
    writeFileSync(file, JSON.stringify({ NDK_HOME: "local", GRADLE_USER_HOME: "cache", TEMP: "android-temp" }));
    assert.deepEqual(androidLocalEnvironment(file, env), { ...env, GRADLE_USER_HOME: "cache", TEMP: "android-temp" });
    assert.equal(env.TEMP, "system-temp");
    assert.equal(env.GRADLE_USER_HOME, undefined);
    writeFileSync(file, JSON.stringify({ PATH: "unexpected" }));
    assert.throws(() => androidLocalEnvironment(file, env), /Invalid Android local setting/);
  } finally { if (existsSync(file)) unlinkSync(file); rmdirSync(directory); }
});
