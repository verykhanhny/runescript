/**
 * Node-only stand-in for the Worker's PRICES KV namespace, so the CLI and the dev server run
 * the same price logic as production (lib/prices.js). Implements just the parts of the KV API
 * that code uses. Entries live in .cache/ge-prices.json so the CLI and the server share them
 * and they survive restarts.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_FILE = fileURLToPath(new URL("../../.cache/ge-prices.json", import.meta.url));

export function createFileKV({ file = DEFAULT_FILE, now = () => Date.now() } = {}) {
  let entries = null; // key -> { value, expiresAt }
  let loading = null;

  // Memoised so concurrent callers all share one entries object.
  function load() {
    loading ??= readFile(file, "utf8").then(
      (text) => (entries = JSON.parse(text)),
      () => (entries = {}),
    );
    return loading;
  }

  // Saves are chained so concurrent writes never touch the file at the same time.
  let saving = Promise.resolve();
  function save() {
    saving = saving.then(async () => {
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(entries));
      await rename(tmp, file);
    }).catch((error) => console.warn(`Could not save GE price cache: ${error.message}`));
    return saving;
  }

  function read(key, type) {
    const record = entries[key];
    if (!record || (record.expiresAt != null && record.expiresAt <= now())) return null;
    return type === "json" ? JSON.parse(record.value) : record.value;
  }

  return {
    async get(keys, type) {
      await load();
      return Array.isArray(keys) ? new Map(keys.map((key) => [key, read(key, type)])) : read(keys, type);
    },
    async put(key, value, { expirationTtl } = {}) {
      await load();
      entries[key] = { value, expiresAt: expirationTtl ? now() + expirationTtl * 1000 : null };
      return save();
    },
    /** Resolves once every pending write has reached the disk. */
    flush: () => saving,
  };
}

export const priceStore = createFileKV();
