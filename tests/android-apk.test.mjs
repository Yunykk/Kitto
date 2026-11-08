import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyElf, verifyApkLibraries } from "../scripts/android-apk.mjs";

function elf(alignment = 16384n) {
  const bytes = Buffer.alloc(120);
  bytes.writeUInt32BE(0x7f454c46);
  bytes[4] = 2;
  bytes[5] = 1;
  bytes.writeBigUInt64LE(64n, 32);
  bytes.writeUInt16LE(56, 54);
  bytes.writeUInt16LE(1, 56);
  bytes.writeUInt32LE(1, 64);
  bytes.writeBigUInt64LE(alignment, 112);
  return bytes;
}

test("Android verification accepts 16 KiB ELF segments and rejects legacy 4 KiB libraries", () => {
  assert.doesNotThrow(() => verifyElf(elf(), "lib.so"));
  assert.throws(() => verifyElf(elf(4096n), "lib.so"), /not 16 KiB aligned/);
  const invalid = elf();
  invalid.writeBigUInt64LE(4096n, 80);
  assert.throws(() => verifyElf(invalid, "lib.so"), /not 16 KiB aligned/);
});

test("Android verification cannot pass truncated binaries or an APK without native libraries", () => {
  assert.throws(() => verifyElf(Buffer.from("invalid"), "lib.so"), /ELF64/);
  const invalid = elf();
  invalid.writeBigUInt64LE(2000n, 32);
  assert.throws(() => verifyElf(invalid, "lib.so"), /invalid ELF program headers/);
  assert.throws(() => verifyApkLibraries(Buffer.from("invalid")), /Invalid APK/);
  const zip = Buffer.alloc(22);
  zip.writeUInt32LE(0x06054b50);
  assert.throws(() => verifyApkLibraries(zip), /no ARM64 or x86_64/);
});
