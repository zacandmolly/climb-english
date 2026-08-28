import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const PREVIEW_DURATION_SECONDS = 20;
const PREVIEW_PRE_ROLL_SECONDS = 0.3;

export function getPreviewWindow(video) {
  const mediaStartTime = Number(video.mediaStartTime ?? 0);
  const firstCueStart = Number(video.cues?.[0]?.startTime ?? mediaStartTime);
  const previewStartTime = Math.max(
    mediaStartTime,
    Number((firstCueStart - PREVIEW_PRE_ROLL_SECONDS).toFixed(2))
  );
  return {
    previewStartTime,
    previewSourceOffset: Number((previewStartTime - mediaStartTime).toFixed(2)),
    previewDurationSeconds: PREVIEW_DURATION_SECONDS,
  };
}

export async function generateVideoPreview({
  inputFile,
  outputFile,
  sourceOffset,
  durationSeconds = PREVIEW_DURATION_SECONDS,
  maxHeight = 360,
  ffmpeg = process.env.FFMPEG || 'ffmpeg',
}) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  await run(ffmpeg, [
    '-y',
    '-ss',
    String(Math.max(0, sourceOffset)),
    '-i',
    inputFile,
    '-t',
    String(durationSeconds),
    '-vf',
    `scale=-2:'min(${maxHeight},ih)'`,
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '30',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '64k',
    '-movflags',
    '+faststart',
    outputFile,
  ]);
}
