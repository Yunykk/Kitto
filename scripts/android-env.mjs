import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

export const androidTargets = {
  aarch64: "aarch64-linux-android", armv7: "armv7-linux-androideabi",
  i686: "i686-linux-android", x86_64: "x86_64-linux-android",
};

export function androidLocalEnvironment(file, env = process.env) {
  if (!existsSync(file)) return { ...env };
  const config = JSON.parse(readFileSync(file, "utf8"));
  const allowed = new Set(["JAVA_HOME", "ANDROID_HOME", "ANDROID_SDK_ROOT", "NDK_HOME", "GRADLE_USER_HOME", "CARGO_TARGET_DIR", "TMP", "TEMP"]);
  if (typeof config !== "object" || config === null || Array.isArray(config)) throw new Error("android.local.json must contain an object.");
  const next = { ...env };
  for (const [key, value] of Object.entries(config)) {
    if (!allowed.has(key) || typeof value !== "string" || !value.trim()) throw new Error(`Invalid Android local setting: ${key}`);
    if (!next[key] || key === "TMP" || key === "TEMP") next[key] = value;
  }
  return next;
}

export function resolveAndroidEnvironment(env = process.env, host = process.platform, exists = existsSync, list = readdirSync) {
  const home = env.USERPROFILE || env.HOME || os.homedir();
  const win = host === "win32";
  const java = win ? "java.exe" : "java";
  const sdkCandidates = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT,
    win ? path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "Android", "Sdk")
      : host === "darwin" ? path.join(home, "Library", "Android", "sdk") : path.join(home, "Android", "Sdk")];
  const sdk = sdkCandidates.find((candidate) => candidate && exists(candidate)) || "";
  const javaCandidates = env.JAVA_HOME ? [env.JAVA_HOME] : [
    win ? path.join(env.ProgramFiles || "C:/Program Files", "Android", "Android Studio", "jbr")
      : host === "darwin" ? "/Applications/Android Studio.app/Contents/jbr/Contents/Home" : "/opt/android-studio/jbr",
  ];
  const javaHome = javaCandidates.find((candidate) => exists(path.join(candidate, "bin", java)) &&
    exists(path.join(candidate, "bin", win ? "javac.exe" : "javac"))) || "";
  const ndkRoot = sdk ? path.join(sdk, "ndk") : "";
  const versions = ndkRoot && exists(ndkRoot)
    ? list(ndkRoot).filter((item) => /^\d+\.\d+\.\d+$/.test(item)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })) : [];
  const ndkCandidates = env.NDK_HOME ? [env.NDK_HOME] : versions.map((version) => path.join(ndkRoot, version));
  const ndkHost = win ? "windows-x86_64" : host === "darwin" ? "darwin-x86_64" : "linux-x86_64";
  const ndk = ndkCandidates.find((candidate) => exists(path.join(candidate, "source.properties")) &&
    exists(path.join(candidate, "toolchains", "llvm", "prebuilt", ndkHost, "bin", win ? "clang.exe" : "clang"))) || "";
  const cargoBin = path.join(env.CARGO_HOME || path.join(home, ".cargo"), "bin");
  const rustup = path.join(cargoBin, win ? "rustup.exe" : "rustup");
  const platforms = sdk && exists(path.join(sdk, "platforms")) ? list(path.join(sdk, "platforms")).filter((item) => /^android-\d+(\.\d+)?$/.test(item)) : [];
  const buildTools = sdk && exists(path.join(sdk, "build-tools")) ? list(path.join(sdk, "build-tools")).filter((item) => /^\d+\.\d+\.\d+/.test(item)) : [];
  const platformTools = !!sdk && exists(path.join(sdk, "platform-tools", win ? "adb.exe" : "adb"));
  return {
    sdk, javaHome, ndk, cargoBin, rustup: exists(rustup) ? rustup : "", platforms, buildTools, platformTools,
    env: {
      ...env,
      ...(sdk ? { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk } : {}),
      ...(javaHome ? { JAVA_HOME: javaHome } : {}),
      ...(ndk ? { NDK_HOME: ndk } : {}),
      PATH: [javaHome && path.join(javaHome, "bin"), cargoBin, env.PATH || env.Path].filter(Boolean).join(path.delimiter),
    },
  };
}
