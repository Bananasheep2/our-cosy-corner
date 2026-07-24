import Link from "next/link";

export const metadata = {
  title: 'Privacy Policy',
  description: 'What Our Cosy Corner collects, where it’s stored, and who can see it — kept as small and plain as your corner.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <main className="simple-page legal-page">
      <header className="page-nav shell">
        <Link className="brand" href="/">
          <span><img className="brand-logo" src="/brand-mark.png" alt="" width={64} height={64} /></span>{" "}
          Our Cosy Corner
        </Link>
        <Link href="/">Back home <b>→</b></Link>
      </header>

      <section className="simple-hero shell">
        <div className="eyebrow">privacy policy</div>
        <h1>Just as small<br /><em>as your corner.</em></h1>
        <p>Last updated: 18 July 2026</p>
      </section>

      <section className="legal-panel shell">
        <article>
          <section>
            <h2>What this policy covers</h2>
            <p>This policy explains what information Our Cosy Corner collects when you use the desktop app, where that information is stored, and who can see it. Our Cosy Corner is a small private workspace built for a couple, a few friends, or a family — we’ve tried to keep this policy just as small and plain.</p>
          </section>

          <section>
            <h2>What we collect</h2>
            <p>When you sign in with Google, we receive the basics of your Google account: your name, email address, and profile photo. This is used only to show who’s who inside your corner, so everyone always knows which of you wrote what.</p>
            <p>Beyond that, we store the content you actually create inside the app: pages, notes, blocks, to-dos, sliders, bookmarks, and any files or PDFs you upload.</p>
            <p>That’s it. We do not run analytics, we do not show ads, and we do not track or profile you in any way.</p>
          </section>

          <section>
            <h2>Where it lives</h2>
            <p>Your corner’s data lives in a hosted database and private file storage, operated on Supabase. Everything is transmitted over HTTPS.</p>
            <p>Each corner is isolated by database row-level security, so only its members — the people you share it with — can ever read its data. No other user of the app, and no unrelated corner, has access.</p>
            <p>If the app is running in local-only mode (not connected to a hosted backend), none of this applies: everything stays on your own device and nothing is transmitted anywhere.</p>
          </section>

          <section>
            <h2>Who can see your data</h2>
            <p>Only the people in your corner can see what you create together. Nobody else — not other users, not us for casual browsing. We do not sell your data, and we do not share it with third parties.</p>
          </section>

          <section>
            <h2>Data retention and deletion</h2>
            <p>Leaving a corner removes your membership in it. Deleting your account removes your data from our systems.</p>
            <div className="callout">
              <p>You can delete your account directly in the app at any time. This permanently removes your account and associated personal data from our systems.</p>
            </div>
          </section>

          <section>
            <h2>Your choices</h2>
            <p>You can export your entire corner as a JSON file from the app’s settings at any time, so your notes, pages, and to-dos are always yours to keep — inside the app or out of it.</p>
          </section>

          <section>
            <h2>Changes to this policy</h2>
            <p>If we make meaningful changes to how we handle your data, we’ll update this page and update the “last updated” date above.</p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>Questions about this policy or your data? Reach us at <a href="mailto:ourcosycorner.help@gmail.com">ourcosycorner.help@gmail.com</a>.</p>
          </section>
        </article>

        <p className="dl-legal"><Link href="/terms">Terms of Use</Link></p>
      </section>
    </main>
  );
}
