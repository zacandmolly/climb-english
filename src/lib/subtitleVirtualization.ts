import type { SubtitleCue } from '../types';

export type SubtitleVirtualRow = {
  cue: SubtitleCue;
  originalIndex: number;
};

/**
 * Build the virtualized row list for SubtitlePanel (Issue #25).
 *
 * Every row keeps its ORIGINAL cue index (no `cues.indexOf` anywhere) so keys,
 * `data-cue-index` and `onSelectCue` stay stable while the list virtualizes.
 * In study-only mode filler cues are filtered out, but the active cue is
 * always included so it remains visible and scrollable-to.
 */
export function subtitleVirtualRows(
  cues: readonly SubtitleCue[],
  activeCueIndex: number,
  studyOnly: boolean
): SubtitleVirtualRow[] {
  const rows: SubtitleVirtualRow[] = [];
  for (let originalIndex = 0; originalIndex < cues.length; originalIndex += 1) {
    const cue = cues[originalIndex];
    if (studyOnly && !cue.study && originalIndex !== activeCueIndex) continue;
    rows.push({ cue, originalIndex });
  }
  return rows;
}

/** Virtual-row position of an original cue index, or -1 when filtered out. */
export function subtitleVirtualIndexForCue(
  rows: readonly SubtitleVirtualRow[],
  originalIndex: number
): number {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    if (rows[rowIndex].originalIndex === originalIndex) return rowIndex;
  }
  return -1;
}
