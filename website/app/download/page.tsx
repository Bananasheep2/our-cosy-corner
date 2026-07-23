import Link from "next/link";
import { APP_VERSION, WIN_VERSION, DL_MAC_ARM, DL_MAC_INTEL, DL_WIN } from "../downloads";

export default function DownloadPage() {
  return (
    <main className="simple-page download-page">
      <header className="page-nav shell">
        <Link className="brand" href="/">
          <span><img className="brand-logo" src="/brand-mark.png" alt="" width={64} height={64} /></span>{" "}
          Our Cosy Corner
        </Link>
        <Link href="/">Back home <b>→</b></Link>
      </header>

      <section className="simple-hero shell">
        <div className="eyebrow">free download · version {APP_VERSION}</div>
        <h1>Bring your corner<br /><em>home.</em></h1>
        <p>Pick your platform below — Our Cosy Corner is free for your whole corner, forever.</p>
      </section>

      <section className="download-panel shell">
        <h2>Choose your download</h2>
        <div className="dl-list">
          <a className="dl-row" href={encodeURI(DL_MAC_ARM)}>
            <div>
              <strong>macOS — Apple Silicon (M1 or later)</strong>
              <small>~120 MB · .dmg</small>
            </div>
            <span className="button small">Download <b>→</b></span>
          </a>
          <a className="dl-row" href={encodeURI(DL_MAC_INTEL)}>
            <div>
              <strong>macOS — Intel</strong>
              <small>~120 MB · .dmg</small>
            </div>
            <span className="button small">Download <b>→</b></span>
          </a>
          <a className="dl-row" href={encodeURI(DL_WIN)}>
            <div>
              <strong>Windows 10/11</strong>
              <small>~96 MB · installer · version {WIN_VERSION} — {APP_VERSION} lands shortly</small>
            </div>
            <span className="button small">Download <b>→</b></span>
          </a>
        </div>

        <div className="dl-help">
          <h3>First launch on macOS</h3>
          <p><strong>macOS 15 (Sequoia):</strong> open the app — it will say it’s blocked, so click <em>Done</em>. Then open System Settings → Privacy &amp; Security, scroll down to the “Our Cosy Corner was blocked” notice, click <em>Open Anyway</em>, and confirm.</p>
          <p><strong>macOS 13/14:</strong> right-click the app → <em>Open</em> → <em>Open</em>.</p>
          <p><strong>If macOS says the app “is damaged”:</strong> open Terminal and run:</p>
          <pre className="dl-code">xattr -cr &quot;/Applications/Our Cosy Corner.app&quot;</pre>
          <p>Then relaunch the app.</p>

          <h3>First launch on Windows</h3>
          <p>Windows SmartScreen may say the app is unrecognized — click <em>More info</em>, then <em>Run anyway</em>.</p>

          <p className="dl-why">None of this means anything is wrong — Our Cosy Corner just isn’t notarized with Apple (or signed with a paid Windows certificate) yet, so both operating systems show an extra warning for a brand-new, independently-made app.</p>
        </div>

        <div className="dl-notes">
          <h3>Release notes — v{APP_VERSION}</h3>
          <ul>
            <li>Corners for couples, friends or families — 2 to 8 people</li>
            <li>Sign in with Google or email</li>
            <li>Pages &amp; sub-pages with a rich editor</li>
            <li>To-dos, sliders, files, PDFs, and bookmarks</li>
            <li>Seven hand-tuned themes</li>
            <li>Invite-code joining · JSON export + restore</li>
          </ul>
        </div>

        <p className="dl-legal">By downloading, you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.</p>
      </section>
    </main>
  );
}
