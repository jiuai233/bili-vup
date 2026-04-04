import fs from "node:fs/promises";
import path from "node:path";
import { BilibiliClient } from "../src/bilibiliClient.js";

const DEFAULT_MIN_DELAY_MS = 10000;
const DEFAULT_JITTER_MS = 2000;
const DEFAULT_MIN_VIDEO_COUNT = 2;

function parseArgs(argv) {
  const options = {
    input: "",
    outputDir: "",
    minVideos: DEFAULT_MIN_VIDEO_COUNT,
    minDelayMs: DEFAULT_MIN_DELAY_MS,
    jitterMs: DEFAULT_JITTER_MS,
    cookie: process.env.BILIBILI_COOKIE || "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--input" && next) {
      options.input = next;
      index += 1;
      continue;
    }

    if (token === "--output-dir" && next) {
      options.outputDir = next;
      index += 1;
      continue;
    }

    if (token === "--min-videos" && next) {
      options.minVideos = Number(next);
      index += 1;
      continue;
    }

    if (token === "--min-delay-ms" && next) {
      options.minDelayMs = Number(next);
      index += 1;
      continue;
    }

    if (token === "--jitter-ms" && next) {
      options.jitterMs = Number(next);
      index += 1;
      continue;
    }

    if (token === "--cookie" && next) {
      options.cookie = next;
      index += 1;
    }
  }

  return options;
}

function validateOptions(options) {
  if (!options.input) {
    throw new Error("Missing --input");
  }

  if (!Number.isFinite(options.minVideos) || options.minVideos < 0) {
    throw new Error("--min-videos must be a non-negative number");
  }

  if (!Number.isFinite(options.minDelayMs) || options.minDelayMs < 0) {
    throw new Error("--min-delay-ms must be a non-negative number");
  }

  if (!Number.isFinite(options.jitterMs) || options.jitterMs < 0) {
    throw new Error("--jitter-ms must be a non-negative number");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextDelay(minDelayMs, jitterMs) {
  return minDelayMs + Math.floor(Math.random() * (jitterMs + 1));
}

function normalizeEntry(entry, index) {
  if (typeof entry === "string" || typeof entry === "number") {
    const uid = String(entry).trim();
    return { uid, raw: { uid } };
  }

  if (entry && typeof entry === "object") {
    const uid = String(entry.uid ?? entry.mid ?? "").trim();
    return { uid, raw: entry };
  }

  throw new Error(`Invalid creator entry at index ${index}`);
}

async function loadEntries(inputPath) {
  const content = await fs.readFile(inputPath, "utf8");
  const extension = path.extname(inputPath).toLowerCase();

  if (extension === ".json") {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error("JSON input must be an array");
    }

    return parsed.map(normalizeEntry);
  }

  if (extension === ".txt") {
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((uid) => normalizeEntry(uid));
  }

  throw new Error("Unsupported input format. Use .json or .txt");
}

function toResult(entry, videoCount, minVideos) {
  return {
    ...entry.raw,
    uid: entry.uid,
    videoCount,
    shouldKeep: videoCount >= minVideos,
  };
}

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  validateOptions(options);

  const inputPath = path.resolve(options.input);
  const outputDir = path.resolve(options.outputDir || path.dirname(inputPath));
  const client = new BilibiliClient();
  const entries = await loadEntries(inputPath);
  const kept = [];
  const removed = [];
  const failures = [];

  console.log(`Loaded ${entries.length} creators from ${inputPath}`);
  console.log(
    `Rate limit: 1 request every ${options.minDelayMs}-${options.minDelayMs + options.jitterMs} ms`
  );

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const progress = `[${index + 1}/${entries.length}]`;

    if (!/^\d+$/.test(entry.uid)) {
      failures.push({
        ...entry.raw,
        uid: entry.uid,
        error: "Invalid uid",
      });
      console.log(`${progress} invalid uid: ${entry.uid}`);
      continue;
    }

    try {
      const stats = await client.getUserVideoStats(entry.uid, {
        cookie: options.cookie,
      });
      const result = toResult(entry, stats.count, options.minVideos);

      if (result.shouldKeep) {
        kept.push(result);
      } else {
        removed.push(result);
      }

      console.log(
        `${progress} uid=${entry.uid} total=${stats.count} ${result.shouldKeep ? "keep" : "remove"}`
      );
    } catch (error) {
      failures.push({
        ...entry.raw,
        uid: entry.uid,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      console.log(
        `${progress} uid=${entry.uid} failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    if (index < entries.length - 1) {
      await sleep(nextDelay(options.minDelayMs, options.jitterMs));
    }
  }

  await fs.mkdir(outputDir, { recursive: true });

  await Promise.all([
    writeJson(path.join(outputDir, "creators-kept.json"), kept),
    writeJson(path.join(outputDir, "creators-removed.json"), removed),
    writeJson(path.join(outputDir, "creators-failures.json"), failures),
    writeJson(path.join(outputDir, "creators-summary.json"), {
      input: inputPath,
      total: entries.length,
      kept: kept.length,
      removed: removed.length,
      failures: failures.length,
      minVideos: options.minVideos,
      minDelayMs: options.minDelayMs,
      jitterMs: options.jitterMs,
    }),
  ]);

  console.log(`Done. kept=${kept.length} removed=${removed.length} failures=${failures.length}`);
  console.log(`Output: ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
