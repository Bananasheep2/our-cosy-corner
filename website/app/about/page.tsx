import Link from "next/link";

export const metadata = {
  title: 'About',
  description: 'Why Our Cosy Corner exists — a small, quiet space for the people closest to you to plan life together.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return <main className="simple-page about-page"><header className="page-nav shell"><Link className="brand" href="/"><span><img className="brand-logo" src="/brand-mark.png" alt="" width={64} height={64} /></span> Our Cosy Corner</Link><Link href="/">Back home <b>→</b></Link></header><section className="simple-hero shell"><div className="eyebrow">why our cosy corner exists</div><h1>Made for the life<br/><em>you’re building.</em></h1><p>A small, quiet space for the people closest to you to plan a big life together.</p></section><section className="about-panel shell"><div className="about-letter"><span className="quote-mark">“</span><p>I created Our Cosy Corner because I wanted a shared dashboard with the people I&rsquo;m closest to — somewhere we could plan the future together, our own individual futures, our resumes, work, life, school, and all the in-between things that matter to us.</p><p>The name came from the feeling I wanted it to have: a cosy, small space for us to collaborate without being interrupted by ads, paywalls, or noise. Just a quiet corner that belongs to us.</p><p>Our Cosy Corner is made to hold the practical things and the tender things side by side — the plan for next year, the link to a CV, the photo from last weekend, and the note you&rsquo;re not ready to send yet.</p></div></section></main>;
}
