import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const [command = "check", ...args] = process.argv.slice(2);
if (process.platform !== "linux") {
  console.error("Run Linux commands on Linux (or inside WSL with Linux Node.js and Rust). Windows cannot produce these packages.");
  process.exit(1);
}
if (!["check", "dev", "build"].includes(command)) {
  console.error("Usage: node scripts/linux.mjs check|dev|build [Tauri options]");
  process.exit(1);
}
const probes = [
  ["Rust", "rustc", ["--version"]],
  ["Cargo", "cargo", ["--version"]],
  ["C compiler", "cc", ["--version"]],
  ["GTK 3", "pkg-config", ["--modversion", "gtk+-3.0"]],
  ["WebKitGTK 4.1", "pkg-config", ["--modversion", "webkit2gtk-4.1"]],
  ["GStreamer", "pkg-config", ["--modversion", "gstreamer-1.0"]],
];
let missing = false;
for (const [label, binary, options] of probes) {
  const result = spawnSync(binary, options, { cwd: root, encoding: "utf8" });
  const ok = !result.error && result.status === 0;
  console.log(`${ok ? "OK" : "MISSING"} ${label}${ok ? `: ${result.stdout.trim().split("\n")[0]}` : ""}`);
  missing ||= !ok;
}
if (missing) {
  console.error("Install the dependencies listed in docs/linux.md, then retry.");
  process.exit(1);
}
if (command !== "check") {
  const cli = fileURLToPath(new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url));
  const result = spawnSync(process.execPath, [cli, command, ...args], { cwd: root, stdio: "inherit" });
  if (result.error) console.error(result.error.message);
  process.exit(result.status ?? 1);
}
