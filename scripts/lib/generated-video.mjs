// Read/write generated *.video.ts payloads without type-stripping imports.
// The modules are stable generated JSON (2-space indented) wrapped in:
//   import type { VideoEntry } from '../../types';
//   export const video: VideoEntry = { ... };

import fs from 'node:fs';

const HEADER =
  "import type { VideoEntry } from '../../types';\n\nexport const video: VideoEntry = ";

export function readGeneratedVideo(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const marker = 'export const video: VideoEntry = ';
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`Cannot parse generated video module: ${filePath}`);
  const json = text.slice(start + marker.length, text.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

const COMPACT_OFFSETS_PREFIX = '__CLIMB_WORD_OFFSETS__';

export function stringifyGeneratedVideo(video) {
  return JSON.stringify(
    video,
    (key, value) => {
      if (key !== 'wordStartOffsetsMs' || !Array.isArray(value)) return value;
      if (value.length === 0) {
        throw new TypeError('wordStartOffsetsMs must not be an empty array');
      }
      if (!value.every(Number.isInteger)) {
        throw new TypeError('wordStartOffsetsMs must contain integer millisecond offsets');
      }
      return `${COMPACT_OFFSETS_PREFIX}${JSON.stringify(value)}`;
    },
    2
  ).replace(/"__CLIMB_WORD_OFFSETS__(\[-?\d+(?:,-?\d+)*\])"/g, '$1');
}

export function writeGeneratedVideo(filePath, video) {
  fs.writeFileSync(filePath, `${HEADER}${stringifyGeneratedVideo(video)};\n`);
}
