# Climb English Studio

Local MVP for training climbing-specific English listening and speaking from real IFSC commentary clips.

## Run

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

## Studio views

The top bar switches between two views. Both follow the same vertical rhythm:
tasks/library strip on top → video + hero subtitles → AI coach at the bottom.

- **每日计划** — the original 6-day, 5-minutes-a-day guided course built from the Bern 2025 final. Daily cards sit on top; sentence chips and the big bilingual practice sheet sit under the video.
- **字幕视频库** — a bilingual subtitle library. Watch any imported video with synced English + Chinese captions (overlay on the video and clickable XHS-style subtitle cards), loop a single cue, filter to study-worthy sentences, and shadow the current cue with the AI coach.

The learning method is unchanged: build a direct link between English sound and English text; Chinese is only a scaffold you can hide.

## Importing YouTube videos

Single video:

```bash
npm run import:youtube -- "https://www.youtube.com/watch?v=<id>" \
  --category world-cup --level intermediate
```

What the pipeline does:

1. Downloads English subtitles with yt-dlp (manual subs preferred, auto captions as fallback) and the video itself (resolution cap via `--max-height`, default 720p), transcoded to web-friendly H.264 MP4 with ffmpeg.
2. Rebuilds **sentences** from word-level caption timestamps — punctuation, inter-word gaps and clause structure decide the boundaries, not a fixed time grid. Clip start/end snap to the first/last real word with a small pad, so sentence starts are never cut off.
3. Scores every sentence for learning value (length, content-word ratio, climbing-term hits, grammar signals; filler and repetition are penalized). All sentences stay in the subtitle track, but only study-worthy ones become practice clips; the best are marked ★ highlights.
4. Translates cues to Chinese via DeepSeek when `DEEPSEEK_API_KEY` is set (batches of 24). Without a key it leaves visible `翻译待补` placeholders instead of failing — re-run later to fill them.
5. Writes a typed data module to `src/data/videos/<slug>.video.ts`, regenerates the lazy-loading registry `src/data/videos/index.ts` and the shared term dictionary. The library view picks it up on the next build.

Useful flags: `--start <s> --end <s>` (import a window), `--reuse-media <url> --media-start <s>` (reuse an existing local media file), `--backfill-zh src/data/lessons.ts` (reuse human-reviewed translations by fuzzy text overlap), `--min-score <0-100>`, `--no-translate`, `--dry-run`.

The Bern 2025 "智能重切" entry was produced this way, reusing the existing media file and the hand-reviewed translations:

```bash
npm run import:youtube -- "https://www.youtube.com/watch?v=CPhZ18zmrBs" \
  --title "Women's Boulder Final | Bern 2025 智能重切" \
  --category world-cup --start 631 --end 2432 \
  --reuse-media "/media/bern-2025-wb-10m31-40m32-web.mp4" --media-start 631 \
  --backfill-zh src/data/lessons.ts --no-translate \
  --slug bern-2025-wb-rescut
```

Auto-discovery of new videos (World Cup replays, technique tutorials, interviews) — **scan first, pick by hand, then import**:

```bash
npm run discover:youtube                          # scan, list numbered candidates, save queue
npm run discover:youtube -- --apply --only 1,3    # import the entries you picked
```

Sources (searches + channels) live in `import-sources.json`; the numbered queue is saved to `src/data/videos/discover-queue.json`; already-processed and already-imported video ids are excluded automatically. A daily automation ("Climb English 每日攀岩视频发现") runs the scan and posts the candidate list, then waits for your manual pick — nothing is imported unattended.

Filling translation placeholders later (after setting a DeepSeek key):

```bash
DEEPSEEK_API_KEY=sk-... npm run translate:videos            # all videos
DEEPSEEK_API_KEY=sk-... npm run translate:videos -- --dry-run
```

Requirements: `yt-dlp` (the scripts auto-detect the WorkBuddy managed install, or set `YT_DLP`) and `ffmpeg` (or set `FFMPEG`). Machine translation needs `DEEPSEEK_API_KEY` in the environment.

## AI feedback

The app works without an OpenAI key and returns demo feedback so the prototype can be reviewed locally.

To enable real transcription and coaching:

```bash
cp .env.example .env
```

Then set `OPENAI_API_KEY` in `.env` and restart `npm run dev`.

On a static GitHub Pages deployment, the recording UI still works. If `VITE_FEEDBACK_API_BASE` is not configured, feedback falls back to offline demo suggestions because Pages does not run the Express API.

## Public feedback API

Do not put `OPENAI_API_KEY` in frontend code, GitHub Actions variables, or any `VITE_` environment variable. Browser-visible variables are public.

The current lightweight deployment runs the API on the always-on M1 and exposes it through a tunnel. The key lives only on the M1 in `~/.climb-english-api.env`.

Operational commands from this project on your work Mac:

```bash
npm run m1:status
npm run m1:usage
```

To replace the M1 OpenAI key safely, copy the new OpenAI API key to your Mac clipboard, then run:

```bash
npm run m1:install-key
npm run m1:test
```

The script reads the key from the clipboard, writes it to the private M1 env file over SSH, restarts `ai.climb-english-api`, and runs a real `/api/speaking-feedback` request. It does not print the key or commit it to the repository.

To use DeepSeek for text coaching instead, copy the DeepSeek API key to your Mac clipboard, then run:

```bash
npm run m1:install-deepseek-key
npm run m1:test
```

DeepSeek is used only for the coaching response. It does not transcribe audio, so the browser sends a Web Speech transcript when available.

For the public site, use the Cloudflare Worker in `workers/speaking-feedback-worker.mjs` as the API proxy:

1. Copy `workers/wrangler.toml.example` to `workers/wrangler.toml`.
2. Create a Cloudflare KV namespace and put its id in `workers/wrangler.toml`.
3. Set Worker secrets:

```bash
npx wrangler secret put OPENAI_API_KEY --config workers/wrangler.toml
npx wrangler secret put API_ADMIN_TOKEN --config workers/wrangler.toml
```

4. Deploy the Worker:

```bash
npm run worker:deploy
```

5. Set the GitHub repository variable `VITE_FEEDBACK_API_BASE` to the Worker origin, for example:

```text
https://climb-english-feedback.<your-subdomain>.workers.dev
```

6. Re-run the GitHub Pages workflow.

The Worker defaults are sized for a small private beta:

- `DAILY_REQUEST_LIMIT=300`
- `HOURLY_REQUEST_LIMIT=90`
- `PER_IP_HOURLY_LIMIT=35`
- `MAX_AUDIO_BYTES=10485760`

Usage can be checked with:

```bash
curl -H "Authorization: Bearer $API_ADMIN_TOKEN" \
  https://climb-english-feedback.<your-subdomain>.workers.dev/api/usage
```

## Learning progress

Progress is saved in the browser with `localStorage`.

- Day 1 is available by default.
- Later days are locked until the previous day is marked complete.
- Completed days can be opened again for review.
- Use `重置` in the daily plan to start over on that browser.

## Publish

The included GitHub Actions workflow deploys the static build to GitHub Pages when this app is pushed as a repository named `climb-english`.

Expected URL:

```text
https://<github-user>.github.io/climb-english/
```

If the repository name changes, update `VITE_BASE_PATH` in `.github/workflows/deploy-pages.yml`.

## Material notes

The sample clips use the official YouTube source:

- https://www.youtube.com/watch?v=CPhZ18zmrBs

The current web video is compressed for publishing and keeps the 30-minute practice timeline intact.

## License

Code is released under the MIT License.

The bundled competition media and commentary content come from the official source above and are included only for this learning prototype. Media rights remain with the original rights holders and are not covered by the MIT License.
