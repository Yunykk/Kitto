import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { androidLocalEnvironment, resolveAndroidEnvironment } from "./android-env.mjs";

export function verifyElf(bytes, name) {
  if (bytes.length < 64 || bytes.readUInt32BE(0) !== 0x7f454c46 || bytes[4] !== 2 || bytes[5] !== 1) {
    throw new Error(`${name}: expected a little-endian ELF64 library.`);
  }
  const start = Number(bytes.readBigUInt64LE(32));
  const size = bytes.readUInt16LE(54);
  const count = bytes.readUInt16LE(56);
  if (size < 56 || !Number.isSafeInteger(start) || start + size * count > bytes.length) throw new Error(`${name}: invalid ELF program headers.`);
  let loads = 0;
  for (let index = 0; index < count; index++) {
    const offset = start + size * index;
    if (bytes.readUInt32LE(offset) !== 1) continue;
    loads++;
    const alignment = bytes.readBigUInt64LE(offset + 48);
    const fileOffset = bytes.readBigUInt64LE(offset + 8);
    const address = bytes.readBigUInt64LE(offset + 16);
    if (alignment < 16384n || fileOffset % 16384n !== address % 16384n) throw new Error(`${name}: LOAD segment is not 16 KiB aligned.`);
  }
  if (!loads) throw new Error(`${name}: no loadable ELF segments.`);
}

export function verifyApkLibraries(apk) {
  const end = apk.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > apk.length) throw new Error("Invalid APK ZIP directory.");
  const count = apk.readUInt16LE(end + 10);
  let cursor = apk.readUInt32LE(end + 16);
  const checked = [];
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > apk.length || apk.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Invalid APK ZIP entry.");
    const method = apk.readUInt16LE(cursor + 10);
    const compressed = apk.readUInt32LE(cursor + 20);
    const length = apk.readUInt16LE(cursor + 28);
    const extra = apk.readUInt16LE(cursor + 30);
    const comment = apk.readUInt16LE(cursor + 32);
    const local = apk.readUInt32LE(cursor + 42);
    const name = apk.subarray(cursor + 46, cursor + 46 + length).toString("utf8");
    cursor += 46 + length + extra + comment;
    if (!/^lib\/(arm64-v8a|x86_64)\/[^/]+\.so$/.test(name)) continue;
    if (local + 30 > apk.length || apk.readUInt32LE(local) !== 0x04034b50) throw new Error(`${name}: invalid local ZIP header.`);
    const start = local + 30 + apk.readUInt16LE(local + 26) + apk.readUInt16LE(local + 28);
    if (start + compressed > apk.length) throw new Error(`${name}: truncated native library.`);
    const bytes = apk.subarray(start, start + compressed);
    const elf = method === 0 ? bytes : method === 8 ? inflateRawSync(bytes, { maxOutputLength: 256 * 1024 * 1024 }) : null;
    if (!elf) throw new Error(`${name}: unsupported ZIP compression.`);
    verifyElf(elf, name);
    checked.push(name);
  }
  if (!checked.length) throw new Error("APK contains no ARM64 or x86_64 native libraries.");
  return checked;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const apk = path.resolve(process.argv[2] || path.join(root, "src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"));
    const libraries = verifyApkLibraries(readFileSync(apk));
    const detected = resolveAndroidEnvironment(androidLocalEnvironment(path.join(root, "android.local.json")));
    const version = detected.buildTools.toSorted((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
    if (!version || !detected.javaHome) throw new Error("Java and Android SDK Build-Tools are required for signature and ZIP alignment checks.");
    const tools = path.join(detected.sdk, "build-tools", version);
    for (const [program, args] of [
      [path.join(tools, process.platform === "win32" ? "zipalign.exe" : "zipalign"), ["-c", "-P", "16", "4", apk]],
      [path.join(detected.javaHome, "bin", process.platform === "win32" ? "java.exe" : "java"), ["-jar", path.join(tools, "lib", "apksigner.jar"), "verify", "--verbose", apk]],
    ]) {
      const result = spawnSync(program, args, { env: detected.env, stdio: "inherit", windowsHide: true });
      if (result.error || result.status !== 0) throw result.error || new Error(`APK verification failed: ${path.basename(program)}`);
    }
    console.log(`Verified APK signature, ZIP alignment and 16 KiB ELF alignment: ${libraries.join(", ")}`);
    console.log(apk);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
