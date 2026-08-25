import fs from 'node:fs';
import zlib from 'node:zlib';

export function readCaptionSource(filePath) {
  const source = fs.readFileSync(filePath);
  return (filePath.endsWith('.gz') ? zlib.gunzipSync(source) : source).toString('utf8');
}
