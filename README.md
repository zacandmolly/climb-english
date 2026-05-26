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
