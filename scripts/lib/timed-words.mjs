// Shared caption parsing for the Climb English pipeline.
// Supports two VTT flavours:
//  - YouTube auto captions: word-level inline timestamps (<00:00:01.200>) with rolling duplication
//  - Manual / plain cues: one text block per cue, word times are interpolated

const ABBREVIATIONS = new Set(['mr.', 'mrs.', 'dr.', 'vs.', 'u.s.', 'st.', 'no.', 'etc.', 'e.g.', 'i.e.']);

export function parseTime(value) {
  const clean = value.trim().replace(',', '.');
  const [hours, minutes, seconds] = clean.split(':');
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

export function cleanText(value) {
  return value
    .replace(/<\/?c>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeWord(value) {
  return value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/^['"“”‘’.,!?;:()[\]-]+|['"“”‘’.,!?;:()[\]-]+$/g, '');
}

function recentPrefixOverlap(recentWords, prefixWords) {
  const recent = recentWords.map((word) => normalizeWord(word.raw)).filter(Boolean);
  const prefix = prefixWords.map((word) => normalizeWord(word)).filter(Boolean);
  const maxLength = Math.min(recent.length, prefix.length);

  for (let length = maxLength; length > 0; length -= 1) {
    const recentSuffix = recent.slice(-length).join(' ');
    const prefixStart = prefix.slice(0, length).join(' ');
    if (recentSuffix === prefixStart) return length;
  }

  return 0;
}

function splitVttBlocks(vtt) {
  return vtt
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((block) => block.split('\n').filter(Boolean))
    .filter((lines) => lines.some((line) => line.includes('-->')));
}

function cueTimesFromLines(lines) {
  const timeLineIndex = lines.findIndex((line) => line.includes('-->'));
  if (timeLineIndex < 0) return null;
  const [startValue, endValue] = lines[timeLineIndex].split('-->').map((part) => part.trim());
  const startToken = startValue.split(/\s+/)[0];
  const endToken = (endValue ?? '').split(/\s+/)[0];
  if (!startToken || !endToken) return null;
  return {
    index: timeLineIndex,
    start: parseTime(startToken),
    end: parseTime(endToken),
  };
}

export function parseVtt(vtt) {
  const blocks = splitVttBlocks(vtt);
  const hasWordTimestamps = blocks.some((lines) => lines.some((line) => /<\d\d:\d\d:\d\d[.,]\d+>/.test(line)));
  return hasWordTimestamps ? { kind: 'word', words: readWordTimedVtt(blocks) } : { kind: 'cue', cues: readCueVtt(blocks) };
}

function readWordTimedVtt(blocks) {
  const words = [];
  const seen = new Set();

  for (const lines of blocks) {
    const times = cueTimesFromLines(lines);
    if (!times) continue;

    for (const rawLine of lines.slice(times.index + 1)) {
      if (!rawLine.includes('<00:') && !/<\d\d:\d\d/.test(rawLine)) continue;

      const parts = rawLine
        .replace(/<\/?c>/g, '')
        .split(/(<\d\d:\d\d:\d\d[.,]\d+>)/g)
        .filter(Boolean);

      let time = times.start;
      let sawInlineTimestamp = false;
      for (const part of parts) {
        const timestamp = part.match(/^<(\d\d:\d\d:\d\d[.,]\d+)>$/);
        if (timestamp) {
          time = parseTime(timestamp[1]);
          sawInlineTimestamp = true;
          continue;
        }

        const text = cleanText(part);
        if (!text || /^\[.*\]$/.test(text)) continue;

        const rawWords = text.split(/\s+/);
        const skipCount = sawInlineTimestamp ? 0 : recentPrefixOverlap(words.slice(-80), rawWords);
        for (const word of rawWords.slice(skipCount)) {
          const normalized = normalizeWord(word);
          if (!normalized) continue;

          const key = `${time.toFixed(2)}|${normalized}`;
          if (seen.has(key)) continue;
          seen.add(key);
          words.push({ time, word: normalized, raw: word });
        }
      }
    }
  }

  return words.sort((first, second) => first.time - second.time);
}

function readCueVtt(blocks) {
  const cues = [];
  for (const lines of blocks) {
    const times = cueTimesFromLines(lines);
    if (!times) continue;
    const text = cleanText(lines.slice(times.index + 1).join(' '));
    if (!text || /^\[.*\]$/.test(text)) continue;
    cues.push({ start: times.start, end: times.end, text });
  }
  return cues.sort((first, second) => first.start - second.start);
}

// Manual cues have no word timestamps; distribute words evenly inside the cue
// so downstream sentence segmentation can still reason about gaps.
export function wordsFromCues(cues) {
  const words = [];
  for (const cue of cues) {
    const tokens = cue.text.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const duration = Math.max(0.3, cue.end - cue.start);
    const step = duration / tokens.length;
    tokens.forEach((token, index) => {
      const normalized = normalizeWord(token);
      if (!normalized) return;
      words.push({ time: cue.start + index * step, word: normalized, raw: token });
    });
  }
  return words;
}

export function loadSubtitleWords(vttText) {
  const parsed = parseVtt(vttText);
  if (parsed.kind === 'word') return { kind: 'auto', words: parsed.words };
  return { kind: 'manual', words: wordsFromCues(parsed.cues) };
}

export function wordsToText(words) {
  return words
    .map((word) => (typeof word === 'string' ? word : word.raw))
    .join(' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\bi\b/g, 'I')
    .replace(/\s+/g, ' ')
    .trim();
}

export function endsSentence(rawWord) {
  const clean = rawWord.trim().toLowerCase();
  if (ABBREVIATIONS.has(clean)) return false;
  return /[.!?…]["'”’)\]]*$/.test(clean);
}
