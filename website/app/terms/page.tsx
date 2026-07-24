import Link from "next/link";

export const metadata = {
  title: 'Terms of Use',
  description: 'The terms for using Our Cosy Corner, kept plain.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
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
        <div className="eyebrow">terms of use</div>
        <h1>The fine print,<br /><em>kept plain.</em></h1>
        <p>Last updated: 18 July 2026</p>
      </section>

      <section className="legal-panel shell">
        <article>
          <section>
            <h2>Acceptance</h2>
            <p>By downloading, installing, or using Our Cosy Corner, you agree to these terms. If you don’t agree with them, please don’t use the app.</p>
          </section>

          <section>
            <h2>The service</h2>
            <p>Our Cosy Corner is a personal, non-commercial shared workspace designed for small private groups — a couple, a few friends, or a family (up to eight people per corner). It’s provided as-is, and we’re a small project doing our best to keep it running well and honestly.</p>
          </section>

          <section>
            <h2>Your account</h2>
            <p>You sign in with your Google account. You’re responsible for keeping your device and your Google account secure — anyone with access to either could access your corner.</p>
          </section>

          <section>
            <h2>Your content</h2>
            <p>Everything you create — pages, notes, to-dos, sliders, files, bookmarks — stays yours. We only store and sync it so everyone in your corner can see it. We don’t claim ownership over it.</p>
            <p>Please don’t upload illegal content, or content you don’t have the right to share. Individual files are limited to 15 MB.</p>
          </section>

          <section>
            <h2>Acceptable use</h2>
            <ul>
              <li>No abusing the service or other users.</li>
              <li>No attempting to access corners that aren’t yours.</li>
              <li>No reverse-engineering the service in ways intended to harm it or its users.</li>
            </ul>
          </section>

          <section>
            <h2>Availability and changes</h2>
            <p>We may update, change, or discontinue features over time as the app evolves. Since nothing is guaranteed to stay exactly as it is forever, we’d recommend keeping backups of anything important using the export feature.</p>
          </section>

          <section>
            <h2>Liability</h2>
            <div className="callout">
              <p>The app is provided as-is, without warranty of any kind. To the extent permitted by law, our liability for any issues arising from your use of the app is limited.</p>
            </div>
          </section>

          <section>
            <h2>Termination</h2>
            <p>We may suspend or terminate accounts that break these terms.</p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>Questions about these terms? Reach us at <a href="mailto:ourcosycorner.help@gmail.com">ourcosycorner.help@gmail.com</a>.</p>
          </section>
        </article>

        <p className="dl-legal"><Link href="/privacy">Privacy Policy</Link></p>
      </section>
    </main>
  );
}
