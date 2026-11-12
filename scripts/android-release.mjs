import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { androidLocalEnvironment, resolveAndroidEnvironment } from "./android-env.mjs";
import { verifyApkLibraries } from "./android-apk.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const detected = resolveAndroidEnvironment(androidLocalEnvironment(path.join(root, "android.local.json")));
const signingDir = process.env.KITTO_SIGNING_DIR || path.join(os.homedir(), ".kitto", "android-signing");
const keyStore = path.join(signingDir, "release.p12");
const credentialsFile = path.join(signingDir, "credentials.json");
const buildToolsVersion = detected.buildTools.toSorted((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
const buildTools = path.join(detected.sdk, "build-tools", buildToolsVersion || "");
const executable = name => path.join(detected.javaHome, "bin", name + (process.platform === "win32" ? ".exe" : ""));

function run(program, args, env = detected.env) {
  const result = spawnSync(program, args, { cwd: root, env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(program)} failed (${result.status}).`);
}

function findApks(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) return findApks(location);
    return entry.name.endsWith(".apk") && location.includes(`${path.sep}release${path.sep}`) ? [location] : [];
  });
}

try {
  if (!detected.javaHome || !buildToolsVersion) throw new Error("Run npm run android:check first.");
  mkdirSync(signingDir, { recursive: true, mode: 0o700 });
  if (existsSync(keyStore) !== existsSync(credentialsFile)) {
    throw new Error(`Incomplete signing identity in ${signingDir}. Restore its matching key and credentials before continuing.`);
  }
  let credentials;
  if (existsSync(credentialsFile)) {
    credentials = JSON.parse(readFileSync(credentialsFile, "utf8"));
  } else {
    credentials = { alias: "kitto", password: randomBytes(32).toString("hex") };
    writeFileSync(credentialsFile, JSON.stringify(credentials, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    run(executable("keytool"), ["-genkeypair", "-keystore", keyStore, "-storetype", "PKCS12",
      "-alias", credentials.alias, "-keyalg", "RSA", "-keysize", "3072", "-validity", "10000",
      "-dname", "CN=Kitto, OU=Android, O=Kitto", "-storepass:env", "KITTO_SIGNING_PASSWORD", "-noprompt"],
      { ...detected.env, KITTO_SIGNING_PASSWORD: credentials.password });
  }
  if (typeof credentials.alias !== "string" || !credentials.alias || typeof credentials.password !== "string" || !credentials.password) {
    throw new Error("Invalid Android signing credentials.");
  }
  if (!process.argv.includes("--sign-only")) {
    run(process.execPath, ["scripts/android.mjs", "build", "--target", "aarch64", "--apk", "--ci"]);
  }
  const candidates = findApks(path.join(root, "src-tauri", "gen", "android", "app", "build", "outputs", "apk"))
    .toSorted((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!candidates.length) throw new Error("No release APK found. Run npm run android:release without --sign-only.");
  const libraries = verifyApkLibraries(readFileSync(candidates[0]));
  if (!libraries.some(name => name.startsWith("lib/arm64-v8a/")) || libraries.some(name => name.startsWith("lib/x86_64/"))) {
    throw new Error("Expected an ARM64-only release APK. Rebuild with npm run android:release.");
  }
  const outputDir = path.join(root, "build", "android");
  mkdirSync(outputDir, { recursive: true });
  const aligned = path.join(outputDir, "aligned-unsigned.apk");
  const output = path.join(outputDir, `Kitto_${version}_android-arm64.apk`);
  run(path.join(buildTools, process.platform === "win32" ? "zipalign.exe" : "zipalign"), ["-f", "-P", "16", "4", candidates[0], aligned]);
  run(executable("java"), ["-jar", path.join(buildTools, "lib", "apksigner.jar"), "sign",
    "--ks", keyStore, "--ks-key-alias", credentials.alias, "--ks-pass", "env:KITTO_SIGNING_PASSWORD",
    "--out", output, aligned], { ...detected.env, KITTO_SIGNING_PASSWORD: credentials.password });
  run(process.execPath, ["scripts/android-apk.mjs", output]);
  unlinkSync(aligned);
  const checksum = createHash("sha256").update(readFileSync(output)).digest("hex");
  writeFileSync(`${output}.sha256`, `${checksum}  ${path.basename(output)}\n`);
  console.log(`\nSigned APK: ${output}\nBack up the signing directory privately: ${signingDir}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
