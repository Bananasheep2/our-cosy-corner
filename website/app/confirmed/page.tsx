import Link from "next/link";

export default function ConfirmedPage() {
  return (
    <main className="simple-page auth-page">
      <header className="page-nav shell">
        <Link className="brand" href="/">
          <span><img className="brand-logo" src="/brand-mark.png" alt="" width={64} height={64} /></span>{" "}
          Our Cosy Corner
        </Link>
        <Link href="/">Back home <b>→</b></Link>
      </header>

      <section className="simple-hero shell">
        <div className="eyebrow">email confirmed</div>
        <h1>You&rsquo;re all<br /><em>set.</em></h1>
      </section>

      <section className="auth-panel shell">
        <p className="auth-result">
          Your email&rsquo;s confirmed. Head back to <strong>Our Cosy Corner</strong> and sign in.
        </p>
      </section>
    </main>
  );
}
