// STARK 2.0: the two businesses it covers, and everything that differs between them.
// To change an ad account, competitor list or result metric, edit this file only.
import { cookies } from 'next/headers';

export type BusinessKey = 'lm' | 'quick';

export type Business = {
  key: BusinessKey;
  name: string;
  metaAccountId: string;
  // Meta action types that count as one "result", in order of preference.
  // Only the first one found on a row is counted, so the same event is never counted twice.
  resultActions: string[];
  result: { one: string; many: string; costShort: string; costLong: string };
  googleCustomerId: string;
  googleCampaignType: 'search' | 'app';
  // Competitors as named in the competitor tracker's file. Missing ones are listed as "not tracked yet".
  competitors: string[];
};

const fromEnv = (name: string) => (process.env[name] || '').split(',').map((s) => s.trim()).filter(Boolean);

export const BUSINESSES: Record<BusinessKey, Business> = {
  lm: {
    key: 'lm',
    name: 'Shiprocket LM',
    metaAccountId: 'act_1498024237140289',
    resultActions: fromEnv('META_LM_RESULT_ACTIONS').length
      ? fromEnv('META_LM_RESULT_ACTIONS')
      : ['complete_registration', 'offsite_conversion.fb_pixel_complete_registration', 'omni_complete_registration', 'onsite_web_complete_registration'],
    result: { one: 'sign-up', many: 'sign-ups', costShort: 'Cost/sign-up', costLong: 'Cost per sign-up' },
    googleCustomerId: '946-728-7563',
    googleCampaignType: 'search',
    competitors: ['Delhivery', 'NimbusPost', 'Shadowfax', 'Ekart', 'Amazon Shipping', 'Shipway'],
  },
  quick: {
    key: 'quick',
    name: 'Shiprocket Quick',
    metaAccountId: 'act_596746546417726',
    resultActions: ['mobile_app_install'],
    result: { one: 'install', many: 'installs', costShort: 'CPI', costLong: 'Cost per install' },
    googleCustomerId: '439-284-6000',
    googleCampaignType: 'app',
    competitors: ['Porter', 'Delhivery on-demand', 'Uncle Delivery'],
  },
};

export const BUSINESS_ORDER: BusinessKey[] = ['lm', 'quick'];
export const BUSINESS_COOKIE = 'stark_business';

const isKey = (v: unknown): v is BusinessKey => v === 'lm' || v === 'quick';

// The business on screen: ?b= in the link wins (so links can be shared), then the switch's cookie, then Quick.
export function currentBusiness(fromQuery?: string): Business {
  if (isKey(fromQuery)) return BUSINESSES[fromQuery];
  const c = cookies().get(BUSINESS_COOKIE)?.value;
  return BUSINESSES[isKey(c) ? c : 'quick'];
}

export function businessByKey(key: string | null | undefined): Business {
  return BUSINESSES[isKey(key) ? key : 'quick'];
}
