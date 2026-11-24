import { currentBusiness } from '../../lib/stark/businesses';
import StarkHeader from '../../components/stark-header';

export const dynamic = 'force-dynamic';

// Placeholder until the Google Ads script is installed. Shows what this page will hold for each business.
const PANELS = {
  search: [
    { title: 'Wasted search terms', what: 'Searches spending with zero sign-ups. You confirm before any is added as a negative keyword.' },
    { title: 'Missed winners', what: 'Searches that convert well but aren’t keywords yet.' },
    { title: 'Losing visibility', what: 'Quality Score or impression share falling on key terms.' },
    { title: 'Brand under attack', what: 'Competitors showing on Shiprocket brand searches.' },
  ],
  app: [
    { title: 'Wasted spend', what: 'Spend outside the service area and on placements that install but rarely place a first order.' },
    { title: 'App campaign asset health', what: 'Assets Google rates Low, missing vertical video, tired creatives.' },
    { title: 'Missed searches', what: 'High-intent searches a small Search campaign could capture, e.g. “3 wheeler booking delhi”.' },
    { title: 'Brand defense', what: 'Competitors showing on “shiprocket quick” searches.' },
  ],
};

export default function GoogleGapPage({ searchParams }: { searchParams: { b?: string } }) {
  const business = currentBusiness(searchParams.b);
  const panels = PANELS[business.googleCampaignType];
  return (
    <>
      <StarkHeader business={business} path="/google-gap" />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6 text-slate-900 lg:p-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Google Keywords Gap &amp; Wasted Spend</h1>
          <p className="mt-1 text-sm text-slate-600">
            {business.name} · Google Ads account {business.googleCustomerId} ·{' '}
            {business.googleCampaignType === 'app' ? 'App campaigns (no keywords)' : 'Search campaigns'}
          </p>
        </div>
        <p className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">
          <span className="font-semibold">Coming soon.</span> This page goes live once the Google Ads data script is installed in this account by an
          account admin (about 10 minutes).
        </p>
        <ul className="grid gap-3 md:grid-cols-2">
          {panels.map((p) => (
            <li key={p.title} className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="font-semibold">{p.title}</p>
              <p className="mt-1 text-sm text-slate-600">{p.what}</p>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
