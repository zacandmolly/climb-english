#!/usr/bin/env node
// Fill machine-translation placeholders in already-imported video data files.
// Scans src/data/videos/*.video.ts for cues flagged needsTranslation, batch
// translates them via DeepSeek, and rewrites the data modules in place.
//
// Usage:
//   DEEPSEEK_API_KEY=sk-... node scripts/translate-videos.mjs
//   node scripts/translate-videos.mjs --video bern-2025-wb-rescut   # one video only
//   node scripts/translate-videos.mjs --dry-run                     # report only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateSentences } from './lib/translate.mjs';
import { writeRegistry } from './import-youtube.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'src/data/videos');

main().catch((error) => {
  console.error(`\n✗ translate-videos failed: ${error.message}`);
  process.exit(1);
});

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const videoFlag = args.indexOf('--video');
  const onlyId = videoFlag >= 0 ? args[videoFlag + 1] : null;

  if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY && !dryRun) {
    console.error('Set DEEPSEEK_API_KEY first (export DEEPSEEK_API_KEY=sk-...).');
    process.exit(1);
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.endsWith('.video.ts'))
    .filter((file) => !onlyId || file === `${onlyId}.video.ts`)
    .sort();

  if (files.length === 0) {
    console.log('No video data files found.');
    return;
  }

  for (const file of files) {
    const fullPath = path.join(DATA_DIR, file);
    const video = parseVideoFile(fullPath);
    const pending = video.cues
      .map((cue, index) => ({ cue, index }))
      .filter(({ cue }) => cue.needsTranslation || !cue.zh);

    console.log(`\n→ ${video.id}: ${pending.length}/${video.cues.length} cues need translation`);
    if (pending.length === 0) continue;
    if (dryRun) continue;

    const translated = await translateSentences(
      pending.map(({ cue }) => ({ text: cue.en })),
      {}
    );

    let filled = 0;
    translated.forEach((result, offset) => {
      const target = video.cues[pending[offset].index];
      if (result.zh) {
        target.zh = result.zh;
        if (result.note) target.note = result.note;
        delete target.needsTranslation;
        filled += 1;
      }
    });
    video.needsTranslationCount = video.cues.filter((cue) => cue.needsTranslation).length;

    fs.writeFileSync(
      fullPath,
      `import type { VideoEntry } from '../../types';\n\nexport const video: VideoEntry = ${JSON.stringify(video, null, 2)};\n`
    );
    console.log(
      `  ✓ filled ${filled}/${pending.length} (remaining placeholders: ${video.needsTranslationCount})`
    );
  }

  if (!dryRun) {
    // Refresh registry so summary badges (已校对 / 待翻译) reflect the new data.
    writeRegistry();
  }

  console.log('\nDone. Re-run npm run build to bundle the updated data.');
}

function parseVideoFile(fullPath) {
  const text = fs.readFileSync(fullPath, 'utf8');
  const match = text.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!match) throw new Error(`Could not parse ${fullPath}`);
  return JSON.parse(match[1]);
}
