// Turns the team's raw competitor ad report (ads.json) into dashboard-ready intelligence.
// Pure functions only: no network, no Next.js imports, so it is easy to test.

const DAY = 86_400_000;
export const SELF = 'Shiprocket';

// ---------- Raw report shape (from sr-ad-intelligence ads.json) ----------
export type RawAd = {
  id: string;
  competitor: string;
  account: string | null;
  recruitment: boolean;
  source: 'meta' | 'google' | 'youtube';
  format: string | null;
  platforms: string | null;
  title: string | null;
  body: string | null;
  cta: string | null;
  first_shown: string | null;
  last_shown: string | null;
  days_shown: number | null;
  status: string | null;
  ranks: Record<string, number> | null;
  ad_url: string | null;
  text_source: string | null;
};

export type RawReport = {
  generated_at: string;
  period_days: number;
  region: string;
  competitors: { name: string; counts: Record<string, number> }[];
  ads: RawAd[];
};

// ---------- Output shape ----------
export type Creative = {
  key: string;
  competitor: string;
  type: 'Customer' | 'Hiring';
  title: string;
  text: string;
  language: string;
  sources: string[];
  format: string | null;
  cta: string | null;
  firstSeen: string;
  versions: number;
  daysLive: number;
  isNew: boolean;
  isLongRunner: boolean;
  topRank: number | null;
  offers: string[];
  adUrl: string | null;
};

export type Offer = {
  competitor: string;
  kind: 'Customer offer' | 'Rider payout';
  label: string;
  detail: string;
  languages: string[];
  firstSeen: string;
  daysLive: number;
  ads: number;
  isNew: boolean;
};

export type CompetitorStat = {
  name: string;
  isSelf: boolean;
  meta: number;
  google: number;
  youtube: number;
  total: number;
  sharePct: number;
  creatives: number;
  newCreatives: number;
  hiringCreatives: number;
  longRunners: number;
  languages: string[];
};

export type Signal = {
  competitor: string;
  kind: 'Hiring push' | 'New offer' | 'Creative burst' | 'New top ad' | 'Proven offer';
  priority: 'Act' | 'Watch';
  headline: string;
  detail: string;
};

export type Intelligence = {
  generatedAt: string;
  periodDays: number;
  region: string;
  totals: {
    allAds: number;
    competitorAds: number;
    ourAds: number;
    ourSharePct: number;
    leader: string;
    leaderSharePct: number;
    leaderVsUs: number | null;
  };
  competitors: CompetitorStat[];
  creatives: Creative[];
  offers: Offer[];
  signals: Signal[];
  skippedAds: number; // ads with no readable text (some Google/YouTube ads)
};

// ---------- Helpers ----------
const round1 = (n: number) => Math.round(n * 10) / 10;
const fmtINR = (n: number) => n.toLocaleString('en-IN');
const daysBetween = (a: number, b: number) => Math.max(0, Math.round((b - a) / DAY));

// Built with new RegExp so the project's ES5 TypeScript target accepts the unicode ('u') flag.
const EMOJI_RE = new RegExp('[\\p{Extended_Pictographic}\\uFE0F\\u200D]', 'gu');
const NON_WORD_RE = new RegExp('[^\\p{L}\\p{N}₹%]+', 'gu');

function normalize(s: string): string {
  return s.toLowerCase().replace(EMOJI_RE, '').replace(NON_WORD_RE, ' ').trim();
}

const SCRIPTS: [RegExp, string][] = [
  [/[\u0980-\u09FF]/, 'Bengali'],
  [/[\u0A00-\u0A7F]/, 'Punjabi'],
  [/[\u0A80-\u0AFF]/, 'Gujarati'],
  [/[\u0B80-\u0BFF]/, 'Tamil'],
  [/[\u0C00-\u0C7F]/, 'Telugu'],
  [/[\u0C80-\u0CFF]/, 'Kannada'],
  [/[\u0D00-\u0D7F]/, 'Malayalam'],
];

export function detectLanguage(text: string): string {
  for (const [re, lang] of SCRIPTS) if (re.test(text)) return lang;
  if (/[\u0900-\u097F]/.test(text)) {
    return /(आणि|नाही|करा|पर्यंत|सोबत)/.test(text) ? 'Marathi' : 'Hindi';
  }
  return 'English';
}

// Promo codes always contain letters and digits, e.g. PTW25, TRUCK100, PUNE50, SHIPHEAVY20.
const CODE_RE = /\bcode\s*[:\-]?\s*([A-Z]{2,}[0-9]{1,4}[A-Z0-9]*)\b/gi;
const PCT_RE = /(\d{1,2})\s*%\s*(?:off|discount)[^.!\n]{0,40}/i;
const FLAT_RE = /(?:flat\s*)?₹\s?([\d,]+)\s*off[^.!\n]{0,30}/i;
const RUPEE_RE = /₹\s?([\d,]{3,7})/g;

export function extractCodes(text: string): { code: string; detail: string }[] {
  const out: { code: string; detail: string }[] = [];
  for (const m of Array.from(text.matchAll(CODE_RE))) {
    const code = m[1];
    if (code !== code.toUpperCase()) continue; // real codes are written in capitals
    const pct = text.match(PCT_RE);
    const flat = text.match(FLAT_RE);
    const detail = (pct?.[0] ?? flat?.[0] ?? '').replace(/\s*(?:with|use)?\s*(?:the\s+)?code\b.*$/i, '').trim();
    if (!out.some((o) => o.code === code)) out.push({ code, detail });
  }
  return out;
}

export function extractPayouts(text: string): { amount: number; unit: 'day' | 'month' }[] {
  const amounts = Array.from(text.matchAll(RUPEE_RE)).map((m) => Number(m[1].replace(/,/g, ''))).filter((n) => n >= 300);
  // Daily payouts in these ads are around ₹1,000–1,500; monthly ones are ₹20,000+.
  const daily = amounts.filter((n) => n < 10_000);
  const monthly = amounts.filter((n) => n >= 10_000);
  const out: { amount: number; unit: 'day' | 'month' }[] = [];
  if (daily.length) out.push({ amount: Math.max(...daily), unit: 'day' });
  if (monthly.length) out.push({ amount: Math.max(...monthly), unit: 'month' });
  return out;
}

// ---------- Main ----------
export function analyze(report: RawReport, opts: { maxCreativesPerCompetitor?: number } = {}): Intelligence {
  const maxPer = opts.maxCreativesPerCompetitor ?? 60;
  const reportTime = Date.parse(report.generated_at);
  // "New" = first shown on or after the start of the day, period_days before the report date.
  const reportDay = Date.UTC(new Date(reportTime).getUTCFullYear(), new Date(reportTime).getUTCMonth(), new Date(reportTime).getUTCDate());
  const windowStart = reportDay - report.period_days * DAY;

  // 1) Keep active ads, count each ad once (an ad can be listed under google and youtube).
  const youtubeIds = new Set(report.ads.filter((a) => a.source === 'youtube').map((a) => a.id));
  const seen = new Set<string>();
  const ads = report.ads.filter((a) => {
    if (a.status && a.status !== 'Active') return false;
    const k = `${a.source === 'youtube' ? 'google' : a.source}:${a.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // 2) Group identical ads into creatives.
  type Group = { ads: RawAd[]; text: string; title: string };
  const groups = new Map<string, Group>();
  let skippedAds = 0;
  for (const a of ads) {
    // Google/YouTube ads with no body only carry the advertiser name as title, so they can't be grouped.
    const hasText = a.source === 'meta' || (a.text_source !== null && !!a.body);
    const text = [a.title, a.body].filter(Boolean).join('\n').trim();
    if (!hasText || !text) { skippedAds++; continue; }
    const key = `${a.competitor}|${a.recruitment ? 'H' : 'C'}|${normalize(text)}`;
    // A title that is only the brand name says nothing, so fall back to the first line of the body.
    const genericTitle = !a.title || [a.competitor, a.account].some((n) => n && normalize(n) === normalize(a.title!));
    const title = genericTitle ? (a.body ?? a.title ?? '').split('\n').find((l) => l.trim())?.trim() ?? a.competitor : a.title!;
    const g = groups.get(key) ?? { ads: [], text, title };
    g.ads.push(a);
    groups.set(key, g);
  }

  const creatives: Creative[] = [];
  for (const [key, g] of Array.from(groups.entries())) {
    const first = Math.min(...g.ads.map((a) => Date.parse(a.first_shown ?? report.generated_at)));
    const googleDays = Math.max(0, ...g.ads.map((a) => a.days_shown ?? 0));
    const daysLive = Math.max(daysBetween(first, reportTime), googleDays);
    const ranks = g.ads.map((a) => a.ranks?.meta_most_viewed).filter((r): r is number => typeof r === 'number');
    const sample = g.ads[0];
    creatives.push({
      key,
      competitor: sample.competitor,
      type: sample.recruitment ? 'Hiring' : 'Customer',
      title: g.title.slice(0, 120),
      text: g.text.replace(/\s+/g, ' ').slice(0, 220),
      language: detectLanguage(g.text),
      sources: Array.from(new Set(g.ads.flatMap((a) => (a.source === 'google' && youtubeIds.has(a.id) ? ['google', 'youtube'] : [a.source])))),
      format: sample.format,
      cta: sample.cta,
      firstSeen: new Date(first).toISOString().slice(0, 10),
      versions: g.ads.length,
      daysLive,
      isNew: first >= windowStart,
      isLongRunner: daysLive >= 30,
      topRank: ranks.length ? Math.min(...ranks) : null,
      offers: extractCodes(g.text).map((c) => c.code),
      adUrl: sample.ad_url,
    });
  }

  // 3) Offers: promo codes and rider payouts, merged per competitor.
  const offerMap = new Map<string, Offer & { _first: number; _langs: Set<string> }>();
  const addOffer = (c: Creative, kind: Offer['kind'], label: string, detail: string, firstMs: number) => {
    const k = `${c.competitor}|${kind}|${label}`;
    const o = offerMap.get(k) ?? {
      competitor: c.competitor, kind, label, detail, languages: [], firstSeen: '', daysLive: 0, ads: 0, isNew: false,
      _first: firstMs, _langs: new Set<string>(),
    };
    o._first = Math.min(o._first, firstMs);
    o._langs.add(c.language);
    o.ads += c.versions;
    if (!o.detail && detail) o.detail = detail;
    offerMap.set(k, o);
  };
  for (const [key, g] of Array.from(groups.entries())) {
    const c = creatives.find((x) => x.key === key)!;
    const firstMs = Date.parse(c.firstSeen);
    if (c.type === 'Hiring') {
      for (const p of extractPayouts(g.text)) {
        addOffer(c, 'Rider payout', `Up to ₹${fmtINR(p.amount)}/${p.unit}`, 'Rider / partner hiring ads', firstMs);
      }
    } else {
      for (const { code, detail } of extractCodes(g.text)) addOffer(c, 'Customer offer', code, detail, firstMs);
    }
  }
  const offers: Offer[] = Array.from(offerMap.values())
    .map(({ _first, _langs, ...o }) => ({
      ...o,
      languages: Array.from(_langs),
      firstSeen: new Date(_first).toISOString().slice(0, 10),
      daysLive: daysBetween(_first, reportTime),
      isNew: _first >= windowStart,
    }))
    .sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.ads - a.ads);

  // 4) Per-competitor stats, using the report's own counts for volume.
  const allAds = report.competitors.reduce((s, c) => s + (c.counts.meta ?? 0) + (c.counts.google ?? 0) + (c.counts.youtube ?? 0), 0);
  const competitors: CompetitorStat[] = report.competitors
    .map((c) => {
      const mine = creatives.filter((x) => x.competitor === c.name);
      const total = (c.counts.meta ?? 0) + (c.counts.google ?? 0) + (c.counts.youtube ?? 0);
      return {
        name: c.name,
        isSelf: c.name === SELF,
        meta: c.counts.meta ?? 0,
        google: c.counts.google ?? 0,
        youtube: c.counts.youtube ?? 0,
        total,
        sharePct: allAds ? round1((total / allAds) * 100) : 0,
        creatives: mine.length,
        newCreatives: mine.filter((x) => x.isNew).length,
        hiringCreatives: mine.filter((x) => x.type === 'Hiring').length,
        longRunners: mine.filter((x) => x.isLongRunner).length,
        languages: Array.from(new Set(mine.map((x) => x.language))),
      };
    })
    .sort((a, b) => b.total - a.total);

  const us = competitors.find((c) => c.isSelf);
  const rivals = competitors.filter((c) => !c.isSelf);
  const leader = rivals[0];
  const totals = {
    allAds,
    competitorAds: rivals.reduce((s, c) => s + c.total, 0),
    ourAds: us?.total ?? 0,
    ourSharePct: us?.sharePct ?? 0,
    leader: leader?.name ?? '',
    leaderSharePct: leader?.sharePct ?? 0,
    leaderVsUs: us && us.total ? round1((leader?.total ?? 0) / us.total) : null,
  };

  // 5) Signals: the few moves worth a manager's attention.
  const signals: Signal[] = [];
  const reportYear = new Date(reportTime).getUTCFullYear();
  const fmtDate = (d: string) => {
    const dt = new Date(d + 'T00:00:00Z');
    return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(dt.getUTCFullYear() !== reportYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
  };
  for (const comp of rivals) {
    const name = comp.name;
    const newPayouts = offers.filter((o) => o.competitor === name && o.kind === 'Rider payout' && o.isNew);
    if (newPayouts.length) {
      const langs = Array.from(new Set(newPayouts.flatMap((o) => o.languages)));
      signals.push({
        competitor: name, kind: 'Hiring push', priority: 'Act',
        headline: `New rider hiring ads: ${newPayouts.map((o) => o.label.toLowerCase()).join(', ')}`,
        detail: `In ${langs.join(', ')} since ${fmtDate(newPayouts[0].firstSeen)}. Competes for the same riders as our Supply campaigns.`,
      });
    }
    for (const o of offers.filter((o) => o.competitor === name && o.kind === 'Customer offer' && o.isNew)) {
      signals.push({
        competitor: name, kind: 'New offer', priority: 'Act',
        headline: `New offer code ${o.label}${o.detail ? `: ${o.detail}` : ''}`,
        detail: `First seen ${fmtDate(o.firstSeen)} across ${o.ads} ads.`,
      });
    }
    const fresh = creatives.filter((c) => c.competitor === name && c.isNew);
    if (fresh.length >= 5) {
      signals.push({
        competitor: name, kind: 'Creative burst', priority: 'Watch',
        headline: `${fresh.length} new creatives this week`,
        detail: `Including “${Array.from(new Set(fresh.sort((a, b) => b.versions - a.versions).map((c) => c.title))).slice(0, 3).join('”, “')}”.`,
      });
    }
    // Meta's most-viewed rank is per competitor page, so it only means something for advertisers with real volume.
    const topNew = comp.meta >= 30 ? fresh.filter((c) => c.topRank !== null && c.topRank <= 10).sort((a, b) => a.topRank! - b.topRank!) : [];
    if (topNew.length) {
      signals.push({
        competitor: name, kind: 'New top ad', priority: 'Watch',
        headline: topNew.length === 1
          ? `New ad already #${topNew[0].topRank} in their most viewed: “${topNew[0].title}”`
          : `${topNew.length} new ads already in their top 10 most viewed`,
        detail: `Best: “${topNew[0].title}” at #${topNew[0].topRank}, first seen ${fmtDate(topNew[0].firstSeen)}.`,
      });
    }
    // Only the most-used long-running offer per competitor, so old offers don't crowd out news.
    const proven = offers
      .filter((o) => o.competitor === name && o.kind === 'Customer offer' && o.daysLive >= 60)
      .sort((a, b) => b.ads - a.ads)[0];
    if (proven) {
      signals.push({
        competitor: name, kind: 'Proven offer', priority: 'Watch',
        headline: `${proven.label} has been running for ${proven.daysLive} days`,
        detail: `${proven.detail || 'Offer'} kept live since ${fmtDate(proven.firstSeen)} across ${proven.ads} ads: likely working for them.`,
      });
    }
  }
  const KIND_ORDER: Signal['kind'][] = ['Hiring push', 'New offer', 'New top ad', 'Creative burst', 'Proven offer'];
  const rank = (s: Signal) => KIND_ORDER.indexOf(s.kind);
  const share = (name: string) => rivals.find((c) => c.name === name)?.total ?? 0;
  signals.sort((a, b) => rank(a) - rank(b) || share(b.competitor) - share(a.competitor));

  // Keep the payload small: newest and biggest creatives first, capped per competitor.
  const trimmed = competitors.flatMap((comp) =>
    creatives
      .filter((c) => c.competitor === comp.name)
      .sort((a, b) => Number(b.isNew) - Number(a.isNew) || (a.topRank ?? 99) - (b.topRank ?? 99) || b.versions - a.versions)
      .slice(0, maxPer),
  );

  return {
    generatedAt: report.generated_at,
    periodDays: report.period_days,
    region: report.region,
    totals,
    competitors,
    creatives: trimmed,
    offers,
    signals: signals.slice(0, 10),
    skippedAds,
  };
}
