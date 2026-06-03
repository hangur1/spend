# Spend Campaign Timeline Dashboard

Live-updating campaign timeline view, pulling directly from Asana. Mirrors the phase × channel grid from your planning doc.

## How it works

- **`api/tasks.js`** — Vercel serverless function that hits the Asana API, pulls all tasks from the Spend campaign project, and filters to only those with a **Phase** custom field set. Returns shaped task data (name, phases, channel, dates, Asana URL).
- **`public/index.html`** — Static dashboard that calls `/api/tasks` on load and every 2 minutes. Renders a phase × channel grid. Clicking any task card opens it in Asana.

## Data model

| Asana field | Dashboard use |
|---|---|
| `Phase` custom field (multi-select) | Columns: Tease / Embargo / Phase 1–3 / Sustain |
| `Channel` custom field (single-select) | Rows: Creative, Comms, Social, Stories, Events, Lifecycle, Web/FEM, Paid Social |
| `due_on` | Shown on card |
| Task `gid` | Links directly to task in Asana |

Tasks **without** a Phase value are excluded from the view.

## Deploy to Vercel

```bash
# 1. Install Vercel CLI (if needed)
npm i -g vercel

# 2. From this directory
vercel

# 3. Set your Asana token as an environment variable
vercel env add ASANA_TOKEN
# Paste your personal access token when prompted
# Select: Production, Preview, Development

# 4. Redeploy to pick up the env var
vercel --prod
```

That's it. The dashboard will be live at your Vercel URL.

## Asana project details

- **Project GID:** `1211763087952574`
- **Phase field GID:** `1215397981889360`
- **Channel field GID:** `1213107724210215`

## Adding "Sustain" phase

The dashboard supports Sustain but it's not yet in the Asana Phase field options. To add it:
1. Open the project in Asana → Customize → Phase field → Add option "Sustain"
2. The dashboard will auto-pick it up on next refresh

## Auto-refresh

The dashboard auto-refreshes every 2 minutes. Click "Refresh" to force an immediate reload.
