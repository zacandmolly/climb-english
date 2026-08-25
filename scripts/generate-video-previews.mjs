#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeRegistry } from './import-youtube.mjs';
import {
  generateVideoPreview,
  getPreviewWindow,
  PREVIEW_DURATION_SECONDS,
} from './lib/video-preview.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'src/data/videos');
const PREVIEW_DIR = path.join(ROOT, 'public/media/previews');

main().catch((error) => {
  console.error(`\n✗ preview generation failed: ${error.message}`);
  process.exit(1);
});

async function main() {
  const requestedIds = new Set(process.argv.slice(2));
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.endsWith('.video.ts'))
    .sort();

  for (const file of files) {
    const dataFile = path.join(DATA_DIR, file);
    const video = readGeneratedVideo(dataFile);
    if (requestedIds.size > 0 && !requestedIds.has(video.id)) continue;
    if (!video.mediaUrl?.startsWith('/media/')) {
      throw new Error(`${video.id}: a local source media file is required to build its preview`);
    }

    const mediaFile = path.join(ROOT, 'public', video.mediaUrl.replace(/^\//, ''));
    if (!fs.existsSync(mediaFile))
      throw new Error(`${video.id}: missing source media ${mediaFile}`);

    const window = getPreviewWindow(video);
    const previewFileName = `${video.id}-20s.mp4`;
    const previewFile = path.join(PREVIEW_DIR, previewFileName);
    console.log(
      `→ ${video.id}: ${window.previewStartTime}s → ${window.previewStartTime + PREVIEW_DURATION_SECONDS}s`
    );
    await generateVideoPreview({
      inputFile: mediaFile,
      outputFile: previewFile,
      sourceOffset: window.previewSourceOffset,
    });

    const nextVideo = {
      ...video,
      previewMediaUrl: `/media/previews/${previewFileName}`,
      previewStartTime: window.previewStartTime,
      previewDurationSeconds: window.previewDurationSeconds,
      ...(fs.statSync(mediaFile).size >= 100 * 1024 * 1024 ? { preferPreview: true } : {}),
    };
    fs.writeFileSync(
      dataFile,
      `import type { VideoEntry } from '../../types';\n\nexport const video: VideoEntry = ${JSON.stringify(nextVideo, null, 2)};\n`
    );
    console.log(`  ✓ ${path.relative(ROOT, previewFile)}`);
  }

  writeRegistry();
  console.log('✓ video registry updated');
}

function readGeneratedVideo(file) {
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!match) throw new Error(`Could not parse generated video: ${file}`);
  return JSON.parse(match[1]);
}
