import Link from "next/link";

export const metadata = {
  title: 'Pricing — free, forever',
  description: 'Our Cosy Corner is completely free: shared and individual dashboards, live sync, no ads and no hidden upgrades.',
  alternates: { canonical: '/pricing' },
};

export default function PricingPage() {
  return <main className="simple-page"><header className="page-nav shell"><Link className="brand" href="/"><span><img className="brand-logo" src="/brand-mark.png" alt="" width={64} height={64} /></span> Our Cosy Corner</Link><Link href="/">Back home <b>→</b></Link></header><section className="simple-hero shell"><div className="eyebrow">simple, by design</div><h1>One cosy corner.<br/><em>Completely free.</em></h1><p>Our Cosy Corner is free for everyone in your corner, forever.</p></section><section className="pricing-panel shell"><span className="free-badge">FREE, ALWAYS</span><strong>$0</strong><h2>Full access for everyone.</h2><p>No subscriptions. No paywalls. No locked-away features. Create your shared dashboard, your individual spaces, and keep your whole little world together without paying a cent.</p><ul><li>Shared and individual dashboards</li><li>Photos, PDFs, links, documents, and little notes</li><li>Live syncing between everyone in your corner</li><li>No ads and no hidden upgrades</li></ul><Link className="button" href="/">Make your corner <b>→</b></Link></section></main>;
}
