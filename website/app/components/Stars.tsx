"use client";
import { useEffect, useRef } from "react";

// The scroll system: reveal-on-scroll for `.rv` elements, plus one quiet
// ambient touch that belongs to the paper world — a "margin rule," like a
// bookmark ribbon, that lengthens down the fixed viewport as you read
// further into the page. Replaces the old 26-glyph twinkle field and the
// three floating orbs entirely: paper doesn't twinkle, so nothing here
// does either. The grain wash in .ambient-field::before is static CSS —
// no JS, no motion, just texture.

export default function Stars() {
  const ribbonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rvEls = Array.from(document.querySelectorAll<HTMLElement>(".rv"));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      // Disable everything — content simply visible, ribbon stays at rest.
      rvEls.forEach((el) => el.classList.add("in"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    rvEls.forEach((el) => io.observe(el));

    let raf = 0;
    function tick() {
      raf = 0;
      const ribbon = ribbonRef.current;
      if (!ribbon) return;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, window.scrollY / max));
      // transform is compositor-only (no layout/paint per frame) — see the
      // .margin-rule comment in globals.css for why this isn't `height`.
      ribbon.style.transform = `scaleY(${progress})`;
    }

    function onScroll() {
      if (!raf) raf = requestAnimationFrame(tick);
    }

    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  return (
    <div className="ambient-field" aria-hidden="true">
      <div className="margin-rule" ref={ribbonRef} />
    </div>
  );
}
