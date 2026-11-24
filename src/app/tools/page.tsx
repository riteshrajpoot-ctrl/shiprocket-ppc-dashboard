import Link from 'next/link';

// Hidden page for the team: every older tool, still live. Not linked from the STARK 2.0 sidebar.
const TOOLS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Meta Ads (Growth Overview)', href: '/growth-overview' },
  { label: 'Branch', href: '/branch' },
  { label: 'Affiliate', href: '/affiliate' },
  { label: 'Google Ads', href: '/google-ads' },
  { label: 'Budget optimizer', href: '/budget-optimizer' },
  { label: 'AI Sidekick', href: '/ai-sidekick' },
  { label: 'Creative Intelligence', href: '/intelligence' },
  { label: 'Search term miner', href: '/search-terms' },
];

export const metadata = { robots: { index: false, follow: false } };

export default function ToolsPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-8 text-slate-900">
      <h1 className="text-2xl font-semibold">All tools</h1>
      <p className="text-sm text-slate-600">Older PPC Command pages. They stay live but are hidden from the STARK 2.0 sidebar.</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <li key={t.href}>
            <Link href={t.href} className="block rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium hover:border-slate-400">
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
