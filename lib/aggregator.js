// Feed list, relevance filters and fetch/dedupe logic.
// Shared by server.js (Docker / local dev) and scripts/build.js (static Cloudflare Pages build).
const Parser = require('rss-parser');

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'ResSecNews/1.0 RSS Aggregator'
  }
});

// ── Feed sources ──────────────────────────────────────────────────────────
// `filter` controls which articles from a feed are kept:
//   'none'  – keep everything (the feed is already on-topic)
//   'edu'   – general security feed: keep only higher-ed / research stories
//   'cyber' – higher-ed / gov feed: keep only cyber or research-security stories
//   'both'  – broad science feed: require BOTH a higher-ed/research term AND a
//             cyber/research-security term (otherwise Nature et al. flood the feed)
//
// EDUCAUSE, the Chronicle, REN-ISAC and Times Higher Ed either block automated
// fetches or publish no feed, so they're reached through Google News searches.
const GN = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const FEEDS = [
  // Google News searches — scoped by query, so always included
  { name: 'Google News – University Cyberattacks', url: GN('university cyberattack OR "university data breach"'), filter: 'none' },
  { name: 'Google News – College Ransomware',      url: GN('college OR university ransomware'),                  filter: 'none' },
  { name: 'Google News – Research Security',       url: GN('"research security" university'),                    filter: 'none' },
  { name: 'Google News – NSPM-33 / SECURE Center', url: GN('NSPM-33 OR "SECURE Center" OR "research security program"'), filter: 'both' }, // "SECURE Center" also matches unrelated facilities
  { name: 'Google News – CMMC / NIST 800-171',     url: GN('CMMC OR "NIST 800-171" university'),                 filter: 'none' },
  { name: 'Google News – Export Controls & Foreign Influence', url: GN('university "export controls" OR "foreign influence" research'), filter: 'none' },
  { name: 'Google News – EDUCAUSE / REN-ISAC',     url: GN('EDUCAUSE OR REN-ISAC cybersecurity'),                filter: 'none' },

  // Research cyberinfrastructure security — on-topic by design
  { name: 'Trusted CI Blog', url: 'https://blog.trustedci.org/feeds/posts/default', filter: 'none' },

  // Higher-ed and public-sector outlets — keep the cyber stories
  { name: 'Higher Ed Dive',        url: 'https://www.highereddive.com/feeds/news/',         filter: 'cyber' },
  { name: 'Inside Higher Ed',      url: 'https://www.insidehighered.com/rss.xml',           filter: 'cyber' },
  { name: 'Campus Technology',     url: 'https://campustechnology.com/rss-feeds/news.aspx', filter: 'cyber' },
  { name: 'EdScoop',               url: 'https://edscoop.com/feed/',                        filter: 'cyber' },
  { name: 'Internet2',             url: 'https://internet2.edu/feed/',                      filter: 'cyber' },
  { name: 'FedScoop',              url: 'https://fedscoop.com/feed/',                       filter: 'both' },
  { name: 'Federal News Network',  url: 'https://federalnewsnetwork.com/feed/',             filter: 'both' },

  // Science / research-funding outlets — need both signals
  { name: 'Science – News',  url: 'https://www.science.org/rss/news_current.xml',     filter: 'both' },
  { name: 'Nature',          url: 'https://www.nature.com/nature.rss',                filter: 'both' },
  { name: 'NSF News',        url: 'https://www.nsf.gov/rss/rss_www_news.xml',         filter: 'both' },
  { name: 'NIST News',       url: 'https://www.nist.gov/news-events/news/rss.xml',    filter: 'both' },

  // General security outlets — keep the higher-ed / research stories
  { name: 'CISA Advisories',    url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', filter: 'edu' },
  { name: 'The Record',         url: 'https://therecord.media/feed',                  filter: 'edu' },
  { name: 'DataBreaches.net',   url: 'https://databreaches.net/feed/',                filter: 'edu' },
  { name: 'The Hacker News',    url: 'https://feeds.feedburner.com/TheHackersNews',   filter: 'edu' },
  { name: 'Cybersecurity Dive', url: 'https://www.cybersecuritydive.com/feeds/news/', filter: 'edu' },
  { name: 'Bleeping Computer',  url: 'https://www.bleepingcomputer.com/feed/',        filter: 'edu' },
  { name: 'Dark Reading',       url: 'https://www.darkreading.com/rss.xml',           filter: 'edu' },
  { name: 'SecurityWeek',       url: 'https://feeds.feedburner.com/Securityweek',     filter: 'edu' },
];

// ── Keyword lists ─────────────────────────────────────────────────────────
// Matched on word boundaries (see buildMatcher), so "hacker" won't match
// "hackathon" and "cui" won't match "biscuit".

// Cybersecurity and research-security signals.
// Research security goes beyond IT security: foreign influence, export controls
// and controlled unclassified information (CUI) obligations on federally funded work.
const CYBER_KEYWORDS = [
  'cybersecurity', 'cyber security', 'cyberattack', 'cyberattacks', 'cyber attack',
  'cyber incident', 'cyber threat', 'cyber espionage', 'ransomware', 'malware',
  'phishing', 'data breach', 'breach', 'breached', 'hacked', 'hacker', 'hackers',
  'hacking', 'vulnerability', 'vulnerabilities', 'exploit', 'exploited', 'zero-day',
  'incident response', 'cisa', 'mfa', 'multi-factor', 'multifactor', 'credential',
  'credentials', 'infosec', 'intrusion', 'ddos', 'spyware', 'social engineering',
  'dark web', 'espionage', 'nation-state', 'data leak', 'data exposure',
  'research security', 'foreign influence', 'foreign interference',
  'talent recruitment', 'malign foreign', 'export control', 'export controls',
  'itar', 'cui', 'controlled unclassified', 'cmmc', '800-171', 'dfars',
  'nspm-33', 'ferpa', 'hipaa', 'glba', 'safeguards rule',
];

// Higher-ed and research-enterprise signals. Deliberately excludes bare
// "research"/"researcher" — security outlets use "security researchers" constantly.
const EDU_KEYWORDS = [
  'university', 'universities', 'college', 'colleges', 'campus', 'campuses',
  'higher education', 'higher ed', 'academic', 'academia', 'faculty',
  'research institution', 'research institutions', 'research university',
  'research universities', 'research security', 'research data', 'research computing',
  'research lab', 'national lab', 'national laboratory', 'cyberinfrastructure',
  'supercomputer', 'supercomputing', 'hpc', 'federally funded research',
  'federal research', 'research funding', 'grant funding', 'nsf', 'nih',
  'educause', 'ren-isac', 'internet2', 'trusted ci', 'nspm-33',
  'cui', 'cmmc', '800-171', 'export control', 'export controls', 'ferpa', 'glba',
];

function buildMatcher(keywords) {
  const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i');
}
const CYBER_RE = buildMatcher(CYBER_KEYWORDS);
const EDU_RE   = buildMatcher(EDU_KEYWORDS);

function itemText(item) {
  return [
    item.title || '',
    item.contentSnippet || '',
    item.content || '',
    item.categories?.map(c => (typeof c === 'string' ? c : c?._ || '')).join(' ') || '',
  ].join(' ');
}

const FILTERS = {
  none:  () => true,
  edu:   item => EDU_RE.test(itemText(item)),
  cyber: item => CYBER_RE.test(itemText(item)),
  both:  item => { const t = itemText(item); return EDU_RE.test(t) && CYBER_RE.test(t); },
};

// Only pass through http(s) links — a feed could otherwise inject a
// javascript: URL that runs when a reader clicks the card.
function safeLink(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '#';
  } catch {
    return '#';
  }
}

function normalizeItem(item, feedName) {
  const link = safeLink(item.link || item.guid || '');
  return {
    title: item.title || 'Untitled',
    link,
    published: item.isoDate || item.pubDate || new Date().toISOString(),
    summary: item.contentSnippet || item.summary || '',
    source: feedName,
    guid: link !== '#' ? link : (item.guid || item.title),
  };
}

// Google News searches return stories years old; drop anything past this age
const MAX_AGE_DAYS = parseInt(process.env.MAX_AGE_DAYS, 10) || 365;

async function fetchFeed(feed) {
  try {
    const result = await parser.parseURL(feed.url);
    const keep = FILTERS[feed.filter] || FILTERS.none;
    return (result.items || []).filter(keep).map(i => normalizeItem(i, feed.name));
  } catch (err) {
    console.warn(`[warn] Failed to fetch "${feed.name}": ${err.message}`);
    return null;
  }
}

// Fetch every feed, filter, drop stale items, dedupe and sort newest first.
// Returns { articles, feedErrors } — feedErrors counts feeds that returned nothing due to an error.
async function fetchAll() {
  let feedErrors = 0;
  const results = await Promise.all(FEEDS.map(f => fetchFeed(f).then(r => {
    if (r === null) { feedErrors++; return []; }
    return r;
  })));
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const all = results.flat().filter(a => !(new Date(a.published) < cutoff));

  // Deduplicate by link, then by normalized title — the same story often
  // arrives from several Google News queries plus the outlet's own feed
  const seenGuid = new Set();
  const seenTitle = new Set();
  const articles = all.filter(a => {
    const titleKey = a.title.toLowerCase().replace(/\s+-\s+[^-]+$/, '').replace(/\W+/g, ' ').trim();
    if (seenGuid.has(a.guid) || seenTitle.has(titleKey)) return false;
    seenGuid.add(a.guid);
    seenTitle.add(titleKey);
    return true;
  });

  articles.sort((a, b) => new Date(b.published) - new Date(a.published));
  return { articles, feedErrors };
}

const sourceNames = () => FEEDS.map(f => f.name);

module.exports = { FEEDS, fetchAll, sourceNames };
