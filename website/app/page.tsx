"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Stars from "./components/Stars";
import LiveTodo from "./components/LiveTodo";
import ThemeSwitcher from "./components/ThemeSwitcher";
import DemoVideo from "./components/DemoVideo";

function subscribeNoop() {
  return () => {};
}
function getDownloadLabel() {
  const ua = navigator.userAgent;
  if (/Mac|iPhone|iPad/.test(ua)) return "Download for macOS";
  if (/Win/.test(ua)) return "Download for Windows";
  return "Download the app";
}
function getServerDownloadLabel() {
  return "Download the app";
}

function useDownloadLabel() {
  return useSyncExternalStore(subscribeNoop, getDownloadLabel, getServerDownloadLabel);
}

// Small inline line icons — replace the emoji this page used to render.
// All share the .icon CSS class (1.5px stroke, currentColor, sized to 1em).
// The real product logo, used for the brand lockup in the nav and footer.
function BrandLogo() {
  return <img className="brand-logo" src="/brand-mark.png" alt="" width={64} height={64} />;
}
// A line-art house kept ONLY for the decorative flourish inside the coloured
// CTA panel, where the logo's own parchment background would read as a pasted
// square rather than a mark.
function HomeMark() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9h12v-9" />
    </svg>
  );
}
function FlourishIcon() {
  // A small pen-drawn swash — replaces the sparkle glyphs under the pull
  // quote. An ink flourish belongs to the paper world; a twinkling star does not.
  return (
    <svg className="icon" viewBox="0 0 40 12" aria-hidden="true">
      <path d="M1 7 C5.5 1 9 1 11.5 6 S18 11 20.5 6 27 1 29.5 6 36 11 39 5.5" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7l1.6-2.5h4.8L16 7" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  );
}
function EnvelopeIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}
function BookmarkIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h12v18l-6-4-6 4V3Z" />
    </svg>
  );
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const downloadLabel = useDownloadLabel();

  return (
    <main>
      <Stars />
      <header className="nav-bar">
        <div className="nav shell">
          <a className="brand" href="#top" aria-label="Our Cosy Corner home"><span><BrandLogo /></span> Our Cosy Corner</a>
          <button className="menu-button" aria-label="Toggle navigation" onClick={() => setMenuOpen(!menuOpen)}>
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" style={{ width: "1.2em", height: "1.2em" }}>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <nav className={menuOpen ? "open" : ""}>
            <a href="/pricing">Pricing</a>
            <a href="/about">About Us</a>
          </nav>
        </div>
      </header>

      <section className="hero shell" id="top">
        <div className="hero-grid">
          <div className="hero-copy-col">
            <div className="eyebrow hero-enter enter-1">Our Cosy Corner</div>
            <h1 className="hero-enter enter-2">Keep your little<br /><em>world</em> close.</h1>
            <p className="hero-copy hero-enter enter-3"><strong>Our Cosy Corner is a free desktop app for couples, friends and families.</strong> A small group shares one private workspace to plan together, keep notes and to-do lists, and save photos, files and links — synced live between everyone&rsquo;s computers on macOS and Windows.</p>
            <div className="actions hero-enter enter-4">
              <Link className="button" href="/download">{downloadLabel} <b>→</b></Link>
              <a className="quiet-link" href="#how">See how it works <span>↓</span></a>
            </div>
          </div>
          <div className="hero-art" aria-label="A preview of a shared dashboard">
            <div className="hero-photo rv">
              <div className="hero-gif-mat">
                <div className="hero-gif-card">
                  <DemoVideo />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="peek-section" id="make-it-yours">
        <div className="shell">
          <div className="center">
            <div className="eyebrow">make it yours</div>
            <h2>Make the room feel like <em>yours.</em></h2>
            <p className="peek-intro">Choose one of seven built-in themes, then tune the accent colour and the shape of every corner until it feels like yours. This is exactly what it looks like inside your own corner — customising early just means it&rsquo;s yours from the start.</p>
          </div>
          <ThemeSwitcher />
        </div>
      </section>

      <section className="what shell" id="what">
        <div className="center">
          <h2>What Our Cosy Corner does</h2>
        </div>
        <div className="feature-grid stagger">
          <article className="rv">
            <h3>One shared workspace</h3>
            <p>You and the people you share with get a single private corner. Anything anyone writes appears on everyone else&apos;s computer within seconds.</p>
          </article>
          <article className="rv">
            <h3>Plans, notes and files in one place</h3>
            <p>Write notes, tick off shared to-do lists, and keep photos, PDFs, links and documents together instead of scattered across chat threads.</p>
          </article>
          <article className="rv">
            <h3>Private by default</h3>
            <p>Only the people you invite can open your corner. There are no ads, no tracking, and no third parties reading your data.</p>
          </article>
        </div>
      </section>

      <section className="intro" id="how">
        <div className="shell split">
          <div className="rv rv-rise-lg">
            <div className="eyebrow">more than a shared folder</div>
            <h2>One home.<br /><em>Room for everyone.</em></h2>
          </div>
          <p className="rv rv-fade-sm">Make room for the things you build together, while still keeping a cosy nook that belongs to each of you.</p>
        </div>
      </section>

      <section className="spaces shell" id="spaces">
        <article className="space-card shared rv rv-left">
          <div className="space-copy">
            <span className="mini-icon"><SunIcon /></span>
            <small>THE SHARED DASHBOARD</small>
            <h3>Everything<br />you’re making<br /><em>together.</em></h3>
            <p>Plan weekends, save memories, and leave little notes for one another.</p>
            <a href="#memories">Explore your shared space <b>→</b></a>
          </div>
          <div className="mini-window shared-window">
            <div className="window-head">Our home <span>•••</span></div>
            <div className="mini-columns">
              <div>
                <small>UP NEXT</small>
                <LiveTodo />
              </div>
              <div>
                <small>RECENTLY ADDED</small>
                <div className="photo"></div>
                <b>July on film</b>
              </div>
            </div>
          </div>
        </article>
        <article className="space-card private rv rv-right">
          <div className="space-copy">
            <span className="mini-icon"><MoonIcon /></span>
            <small>YOUR OWN LITTLE NOOK</small>
            <h3>Yours, with<br />a door only<br /><em>you can open.</em></h3>
            <p>Private pages for your thoughts, your plans, and the things you’re not ready to share yet.</p>
            <a href="#memories">Discover your own space <b>→</b></a>
          </div>
          <div className="mini-window private-window">
            <div className="window-head">Maya’s space <span>•••</span></div>
            <p className="script">just for me —</p>
            <p className="letter">the small plans I’m keeping close until they’re ready.</p>
            <div className="letter-sign">— m</div>
          </div>
        </article>
      </section>

      <section className="features" id="memories">
        <div className="shell">
          <div className="center">
            <div className="eyebrow">a place for your real life</div>
            <h2>Made for the things<br />you’ll want to <em>keep.</em></h2>
          </div>
          <div className="feature-grid stagger">
            <article className="rv">
              <span><CameraIcon /></span>
              <h3>Memories, gathered</h3>
              <p>Drop in photos, voice notes, and the small moments worth returning to.</p>
            </article>
            <article className="rv">
              <span><EnvelopeIcon /></span>
              <h3>Letters with a heartbeat</h3>
              <p>Write a note for now, or seal one away until exactly the right day.</p>
            </article>
            <article className="rv">
              <span><BookmarkIcon /></span>
              <h3>All your important bits</h3>
              <p>Keep links, PDFs, docx files, lists, and ideas right where you can both find them.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="quote shell rv">
        <div className="quote-mark">“</div>
        <blockquote>We made it for the quiet, ordinary<br />days that end up meaning <em>everything.</em></blockquote>
        <div className="quote-flourish"><FlourishIcon /></div>
      </section>

      <section className="cta">
        <div className="shell rv rv-settle">
          <span className="big-heart"><HomeMark /></span>
          <div className="eyebrow">your corner is waiting</div>
          <h2>Start your little<br /><em>world</em> today.</h2>
          <p>All the space you need for the life you’re building together.</p>
          <Link className="button" href="/download">{downloadLabel} <b>→</b></Link>
        </div>
      </section>

      <footer className="shell">
        <a className="brand" href="#top"><span><BrandLogo /></span> Our Cosy Corner</a>
        <p>Made with care.</p>
        <div>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="mailto:ourcosycorner.help@gmail.com">Support</a>
        </div>
      </footer>
    </main>
  );
}
