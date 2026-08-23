#!/usr/bin/env node
// Discover new climbing videos from configured YouTube sources and queue or
// run imports. Sources live in import-sources.json (searches and channels).
//
// Usage:
//   node scripts/discover-youtube.mjs            # list new candidates
//   node scripts/discover-youtube.mjs --apply    # import the top candidates
//   node scripts/discover-youtube.mjs --apply --max 2

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES_FILE = path.join(ROOT, 'import-sources.json');
const STATE_FILE = path.join(ROOT, 'src/data/videos/import-state.json');
const QUEUE_FILE = path.join(ROOT, 'src/data/videos/discover-queue.json');
const YT_DLP =
  process.env.YT_DLP ||
  (fs.existsSync('/Users/zaczhu/.workbuddy/binaries/python/envs/default/bin/yt-dlp')
    ? '/Users/zaczhu/.workbuddy/binaries/python/envs/default/bin/yt-dlp'
    : 'yt-dlp');

main().catch((error) => {
  console.error(`\n✗ discover failed: ${error.message}`);
  process.exit(1);
});

async function main() {
  const apply = process.argv.includes('--apply');
  const maxFlag = process.argv.indexOf('--max');
  const maxImports = maxFlag >= 0 ? Number(process.argv[maxFlag + 1]) : 3;
  const onlyFlag = process.argv.indexOf('--only');
  const onlyIndexes =
    onlyFlag >= 0
      ? String(process.argv[onlyFlag + 1])
          .split(',')
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isInteger(value) && value > 0)
      : null;

  const state = loadState();

  // Manual-pick flow: scan writes a queue; `--apply --only 1,3` imports the
  // picked entries from the LAST scan without re-scanning YouTube.
  if (apply && onlyIndexes) {
    const queue = loadQueue();
    if (queue.length === 0) {
      console.error('No discover queue found. Run npm run discover:youtube first to scan.');
      process.exit(1);
    }
    const picked = onlyIndexes.map((index) => queue[index - 1]).filter(Boolean);
    if (picked.length === 0) {
      console.error(
        `None of the indexes [${onlyIndexes.join(', ')}] exist in the queue (1-${queue.length}).`
      );
      process.exit(1);
    }
    console.log(`→ importing ${picked.length} picked video(s) from the last scan queue`);
    for (const entry of picked) {
      await importEntry(entry, state);
    }
    // Imported entries drop out of the queue so the list stays actionable.
    saveQueue(queue.filter((entry) => !picked.some((pick) => pick.id === entry.id)));
    return;
  }

  const sources = JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf8')).sources;
  const libraryIds = loadLibraryYoutubeIds();
  const candidates = [];

  for (const source of sources) {
    console.log(`→ scanning ${source.type}: ${source.query ?? source.channelUrl}`);
    const entries = await scanSource(source);
    const fresh = entries.filter((entry) => {
      if (!entry.id || state.knownIds.includes(entry.id)) return false;
      if (libraryIds.has(entry.id)) return false;
      if (source.minDurationSeconds && (entry.duration ?? 0) < source.minDurationSeconds)
        return false;
      if (source.maxDurationSeconds && (entry.duration ?? 0) > source.maxDurationSeconds)
        return false;
      return true;
    });
    console.log(`  ${entries.length} found, ${fresh.length} new`);
    for (const entry of fresh.slice(0, source.maxPerSource ?? 4)) {
      candidates.push({ ...entry, category: source.category, level: source.level });
    }
  }

  if (candidates.length === 0) {
    console.log('\nNo new videos to import.');
    saveQueue([]);
    return;
  }

  saveQueue(candidates);
  console.log(
    `\n${candidates.length} candidates (queue saved → src/data/videos/discover-queue.json):`
  );
  candidates.forEach((entry, index) => {
    console.log(
      `  ${index + 1}. [${entry.category}] ${entry.title} (${fmtDuration(entry.duration)}) — ${entry.url}`
    );
  });

  if (!apply) {
    console.log('\nPick entries by number, then run:');
    console.log('  npm run discover:youtube -- --apply --only 1,3');
    return;
  }

  const queue = candidates.slice(0, maxImports);
  for (const entry of queue) {
    await importEntry(entry, state);
  }
  saveQueue(candidates.filter((entry) => !queue.some((pick) => pick.id === entry.id)));
}

async function importEntry(entry, state) {
  console.log(`\n=== importing: ${entry.title}`);
  try {
    await run(
      process.execPath,
      [
        path.join(ROOT, 'scripts/import-youtube.mjs'),
        entry.url,
        '--category',
        entry.category ?? 'other',
        '--level',
        entry.level ?? 'intermediate',
      ],
      { maxBuffer: 64 * 1024 * 1024 }
    );
    state.knownIds.push(entry.id);
    saveState(state);
    console.log(`  ✓ imported ${entry.id}`);
  } catch (error) {
    console.warn(`  ! import failed for ${entry.id}: ${String(error.message).slice(0, 300)}`);
    state.failedIds = Array.from(new Set([...(state.failedIds ?? []), entry.id]));
    saveState(state);
  }
}

async function scanSource(source) {
  if (source.type === 'search') {
    const count = source.scanCount ?? 10;
    const target = `ytsearch${count}:${source.query}`;
    const { stdout } = await run(YT_DLP, ['--flat-playlist', '--dump-single-json', target], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const data = JSON.parse(stdout);
    return (data.entries ?? []).filter(Boolean).map((entry) => ({
      id: entry.id,
      title: entry.title ?? entry.id,
      url: entry.url?.startsWith('http')
        ? entry.url
        : `https://www.youtube.com/watch?v=${entry.id}`,
      duration: entry.duration ?? null,
    }));
  }

  if (source.type === 'channel') {
    const url = source.channelUrl.replace(/\/?$/, '/videos');
    const { stdout } = await run(
      YT_DLP,
      [
        '--flat-playlist',
        '--playlist-end',
        String(source.scanCount ?? 10),
        '--dump-single-json',
        url,
      ],
      { maxBuffer: 64 * 1024 * 1024 }
    );
    const data = JSON.parse(stdout);
    return (data.entries ?? []).filter(Boolean).map((entry) => ({
      id: entry.id,
      title: entry.title ?? entry.id,
      url: `https://www.youtube.com/watch?v=${entry.id}`,
      duration: entry.duration ?? null,
    }));
  }

  throw new Error(`Unknown source type: ${source.type}`);
}

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { knownIds: [], failedIds: [], ...parsed };
  } catch {
    return { knownIds: [], failedIds: [] };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadQueue() {
  try {
    const parsed = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
    return Array.isArray(parsed.candidates) ? parsed.candidates : [];
  } catch {
    return [];
  }
}

// Videos already in the library (regardless of how they were imported) should
// never show up as "new" candidates again.
function loadLibraryYoutubeIds() {
  const dir = path.join(ROOT, 'src/data/videos');
  const ids = new Set();
  try {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.video.ts')) continue;
      const match = fs.readFileSync(path.join(dir, file), 'utf8').match(/"youtubeId":\s*"([^"]+)"/);
      if (match) ids.add(match[1]);
    }
  } catch {
    // Directory may not exist yet; nothing to exclude.
  }
  return ids;
}

function saveQueue(candidates) {
  fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
  fs.writeFileSync(
    QUEUE_FILE,
    JSON.stringify({ scannedAt: new Date().toISOString(), candidates }, null, 2)
  );
}

function fmtDuration(seconds) {
  if (!seconds) return '??:??';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
