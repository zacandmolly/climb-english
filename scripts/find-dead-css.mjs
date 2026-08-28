#!/usr/bin/env node
// Dead-CSS report for the R7 dead-code audit (phase 02).
//
// Purges src/styles.css against every class/tag actually present in the app's
// content (src/**/*.tsx + index.html) and lists the selectors that survive in
// the stylesheet but are never matched. This is a read-only gate: it never
// rewrites the stylesheet, but exits non-zero until every finding is resolved.
//
// Run:
//   node scripts/find-dead-css.mjs            # scan every selector
//   node scripts/find-dead-css.mjs --limit 20 # cap the printed list

import { PurgeCSS } from 'purgecss';

const args = process.argv.slice(2);
const limitFlag = args.indexOf('--limit');
const limit = limitFlag >= 0 ? Number(args[limitFlag + 1]) : null;

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  const results = await new PurgeCSS().purge({
    // The app's actual markup/class surface. Styles are defined in .tsx
    // (className="..."), not in separate template files.
    content: ['index.html', 'src/**/*.tsx', 'src/**/*.ts'],
    css: ['src/styles.css'],
    rejected: true,
  });

  const rejected = (results[0]?.rejected ?? []).filter((selector) => selector.trim());
  const unique = [...new Set(rejected)].sort();

  console.log(`Dead-CSS scan: src/styles.css vs ${results[0]?.file ?? 'src/styles.css'}`);
  console.log(`Rejected (unused) selectors: ${unique.length}`);
  console.log('');
  for (const selector of limit != null ? unique.slice(0, limit) : unique) {
    console.log(`  ${selector}`);
  }
  if (limit != null && unique.length > limit) {
    console.log(`  …and ${unique.length - limit} more`);
  }
  if (unique.length > 0) {
    process.exitCode = 1;
  }
}
