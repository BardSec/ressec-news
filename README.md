# Research Security News

A news aggregator for **higher-ed research cybersecurity**. It collects campus cyber incidents, research-security policy (NSPM-33, CUI/CMMC, NIST 800-171, export controls, foreign influence) and research cyberinfrastructure news from 27 sources, filters them for relevance, deduplicates them and shows them in a searchable web page.

Live site: https://ressec-news.edtechirl.com (also https://ressec.edtechirl.com and https://ressec-news.pages.dev)

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
- Custom domains: `ressec-news.edtechirl.com` and `ressec.edtechirl.com`. Each is a proxied CNAME to `ressec-news.pages.dev` in the edtechirl.com zone, plus a custom domain on the Pages project.
- **Keepalive:** GitHub disables scheduled workflows in public repos after 60 days with no commits. When the last commit is 25+ days old, the scheduled run pushes an empty `keepalive` commit as `github-actions[bot]`. Run the workflow by hand with **force_keepalive** to test it.

## API (Docker / local server only)

| Endpoint | Description |
|---|---|
| `GET /data/articles.json` | All cached articles, plus `lastFetched` |
| `GET /data/sources.json` | Configured source names |
| `GET /api/articles` | Paginated list. Query params: `q`, `source`, `page`, `limit` (max 500) |
| `GET /api/refresh` | Force a refresh (at most once per minute) |

## RSS feed

Each build also writes `feed.xml`, an RSS 2.0 feed of the 50 newest articles, at `<site>/feed.xml`. Pages link to it from a `<link rel="alternate">` tag and from the **Subscribe** card in the sidebar.

- Site name, description and URL for the feed come from `site.json`.
- `lib/feed.js` is identical in all three news repos.
- The feed exists only in the static build (`npm run build`), not in the local Express server.

## Sponsor

The EdTech IRL news sites are sponsored by [SoftwareStudioK12](https://softwarestudiok12.com/). Each page shows a sponsor card in the sidebar and a "Sponsored by" line in the footer, both with a disclosure that the sponsor has no say in which articles appear.

- The sponsor's name, logo, link, per-site message, call to action, disclosure and `utm_source` live in the `sponsor` section of `site.json`. Edit that to change the sponsor or its message.
- At build time, `lib/sponsor.js` (identical in all three repos) replaces the `<!-- SPONSOR_CARD -->` and `<!-- SPONSOR_FOOTER -->` placeholders in `index.html`.
- The local Express server serves `public/` unbuilt, so it doesn't show the sponsor block.
- Sponsor links carry UTM tags (`utm_medium=sponsor`, `utm_campaign=edtechirl-news`, `utm_content=sidebar|footer`). Clicks show up in SoftwareStudioK12's analytics. The news sites themselves track nothing.
- The logo is `public/brand/sponsor-softwarestudiok12.svg`, a light-only copy of the mark from softwarestudiok12.com. The original switches its lines to white in dark mode, which would vanish on these white cards.

## Branding (EdTech IRL network)

This site is one of three EdTech IRL news feeds: [K12 Cyber Watch](https://news.edtechirl.com/), [HiEd Security News](https://hied-news.edtechirl.com/) and [Research Security News](https://ressec-news.edtechirl.com/). Each has the same top bar and footer linking the three sites and the [EdTech IRL blog](https://www.edtechirl.com/).

- `public/brand/brand.css` is **identical in all three repos**. It sets the light theme, the network bar, the footer and each site's accent colors. Edit it in one repo and copy it to the other two.
- Each page picks its accent with `<html data-site="k12|hied|ressec">`. Accents: K12 blue `#1D4ED8`, HiEd teal `#0F766E`, ResSec orange `#B45309` for text with `#FF8200` for highlights. The EdTech IRL coral `#FD5353` is used only in the top bar.
- `public/brand/` also holds the IRL badge (`edtechirl-badge-64.png`, `-180.png`, `favicon-32.png`).

## Tech stack

- Node.js 20 / Express (local server only)
- [rss-parser](https://github.com/rbren/rss-parser)
- Vanilla JS frontend
- GitHub Actions + Cloudflare Pages (production), Docker (local)
