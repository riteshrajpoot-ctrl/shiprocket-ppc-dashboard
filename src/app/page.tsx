import { redirect } from 'next/navigation';

// The site opens straight on STARK 2.0. Older pages are listed on /tools.
export default function Home() {
  redirect('/creative-fatigue');
}
