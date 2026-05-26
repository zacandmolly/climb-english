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

On a static GitHub Pages deployment, the recording UI still works but AI feedback falls back to offline demo suggestions because Pages does not run the Express API.

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
