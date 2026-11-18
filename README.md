# ResSec News

A news aggregator for **higher-ed research cybersecurity**. It collects campus cyber incidents, research-security policy (NSPM-33, CUI/CMMC, NIST 800-171, export controls, foreign influence) and research cyberinfrastructure news from 27 sources, filters them for relevance, deduplicates them and shows them in a searchable web page.

Live site: https://ressec-news.pages.dev

Adapted from [k12-cyber-news](../k12-cyber-news) for a higher-ed / research audience.

## How it works

- **Production:** a static site on Cloudflare Pages. A GitHub Actions workflow (`.github/workflows/deploy.yml`) runs every 30 minutes. It fetches every feed, writes `dist/data/articles.json` and deploys `dist/` to Pages. If the fetch looks unhealthy (fewer than 20 articles, or more than half the feeds failing), the build fails and the last good deploy stays live.
- **Local dev / Docker:** `server.js` serves the same frontend and the same `/data/*.json` paths from an in-memory cache that refreshes every 15 minutes.

Both use the same feed list and filters in `lib/aggregator.js`.

## Sources

| Group | Sources | Filter |
|---|---|---|
| Google News searches | University cyberattacks, college ransomware, research security, NSPM-33 / SECURE Center, CMMC / NIST 800-171, export controls & foreign influence, EDUCAUSE / REN-ISAC | None (scoped by query); NSPM-33 requires both |
| Research cyberinfrastructure | Trusted CI blog | None |
| Higher-ed outlets | Higher Ed Dive, Inside Higher Ed, Campus Technology, EdScoop, Internet2 | Cyber |
| Federal / science | FedScoop, Federal News Network, Science, Nature, NSF, NIST | Both |
| Security outlets | CISA Advisories, The Record, DataBreaches.net, The Hacker News, Cybersecurity Dive, Bleeping Computer, Dark Reading, SecurityWeek | Higher-ed |

Filters:
- **Cyber:** the article must contain a cybersecurity or research-security term.
- **Higher-ed:** the article must contain a higher-ed or research-enterprise term.
- **Both:** the article must contain one of each.

Matching is on whole words. EDUCAUSE, the Chronicle, REN-ISAC and Times Higher Ed block automated fetches or publish no feed, so they're covered by Google News searches.

To add a source, add an entry to `FEEDS` in `lib/aggregator.js`.

## Running locally

```bash
npm install
npm run dev      # http://localhost:3000, auto-restarts on change
npm run build    # produce the static site in dist/
```

## Running with Docker

```bash
docker compose up -d --build
```

Available at `http://localhost:30304`.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port (Docker sets `30304`) |
| `MAX_AGE_DAYS` | `365` | Drop articles older than this. Google News searches otherwise return stories years old |
| `MIN_ARTICLES` | `20` | Static build fails, and skips the deploy, below this many articles |

## Deployment (Cloudflare Pages)

- Pages project: `ressec-news`, production branch `main`.
- GitHub repo secrets: `CLOUDFLARE_API_TOKEN` (Pages edit permission) and `CLOUDFLARE_ACCOUNT_ID`.
- The workflow runs on push to `main`, every 30 minutes, and on manual dispatch (**Actions → Build & deploy → Run workflow**).

## API (Docker / local server only)

| Endpoint | Description |
|---|---|
| `GET /data/articles.json` | All cached articles, plus `lastFetched` |
| `GET /data/sources.json` | Configured source names |
| `GET /api/articles` | Paginated list. Query params: `q`, `source`, `page`, `limit` (max 500) |
| `GET /api/refresh` | Force a refresh (at most once per minute) |

## Tech stack

- Node.js 20 / Express (local server only)
- [rss-parser](https://github.com/rbren/rss-parser)
- Vanilla JS frontend
- GitHub Actions + Cloudflare Pages (production), Docker (local)
