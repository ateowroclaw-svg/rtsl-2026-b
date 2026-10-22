# RTSL 2026-B league page

Standings, levels and results of the Royale Twilight Struggle League, built from the
[official Google Sheet](https://docs.google.com/spreadsheets/d/1XG75lg0PrK27zUL-6rlMAFloyrYFaaPzFHyUX7v73pI/edit).
The page loads nothing from Google or other outside servers, so it also works in mainland China.

## How it fits together

| Part | What it does |
|---|---|
| `site/` | The page (`index.html`) and its fonts. Netlify publishes this folder as the main site. |
| `.github/workflows/refresh.yml` | Runs every hour on GitHub. Reads the sheet and, only when something changed, pushes fresh data to the `data` branch. |
| `tools/build-data.mjs` | Turns the sheet's CSV exports into `data.json` and a copy of the page with that data built in. |
| `data` branch | Created by the workflow. Netlify publishes it as a free branch deploy at `data--<site>.netlify.app`. The main page reads `data.json` from there. |

The workflow never changes the `main` branch, so it never causes a production deploy.
On Netlify's free plan, each production deploy costs 15 of the 300 monthly credits, while branch deploys are free.
Change files on `main` only when the page design changes.

## Changing the page

Edit `site/index.html` on `main` (one production deploy). The next hourly run also copies the new design
to the `data` branch.

## Running the refresh by hand

GitHub → **Actions** → **Refresh RTSL data** → **Run workflow**.
