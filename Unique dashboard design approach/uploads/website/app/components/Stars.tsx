"use client";
import { useEffect, useRef } from "react";

// Rising-star parallax field + scroll-reveal + floating-emblem parallax,
// all driven off one rAF-throttled scroll loop. Mount once on the landing page.

// A small 4-point sparkle line icon, drawn once and reused for every drift
// star (replaces the old text glyphs, which were pictographs).
const SPARKLE_SVG =
  '<svg class="icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z"/></svg>';

const LAYERS = [
  { className: "star-far", count: 10, size: 9, opacity: 0.25, color: "#b8543f", factor: 0.15 },
  { className: "star-mid", count: 9, size: 13, opacity: 0.4, color: "#fec89a", factor: 0.3 },
  { className: "star-near", count: 7, size: 18, opacity: 0.6, color: "#ffb5a7", factor: 0.5 },
];

const FLOAT_FACTORS = [-0.06, -0.1, -0.08];
const FLOAT_MAX = 40;

export default function Stars() {
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rvEls = Array.from(document.querySelectorAll<HTMLElement>(".rv"));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      // Disable everything — content simply visible.
      rvEls.forEach((el) => el.classList.add("in"));
      return;
    }

    const field = fieldRef.current;
    const layerEls: HTMLElement[] = [];

    if (field) {
      LAYERS.forEach((layer) => {
        const layerEl = document.createElement("div");
        layerEl.className = `star-layer ${layer.className}`;
        for (let i = 0; i < layer.count; i++) {
          const star = document.createElement("span");
          star.className = "star";
          star.innerHTML = SPARKLE_SVG;
          star.style.left = `${Math.random() * 100}%`;
          star.style.top = `${Math.random() * 200}vh`;
          star.style.fontSize = `${layer.size}px`;
          star.style.opacity = String(layer.opacity);
          star.style.color = layer.color;
          star.style.animationDelay = `${(3 + Math.random() * 3).toFixed(2)}s`;
          star.style.animationDuration = `${(4 + Math.random() * 3).toFixed(2)}s`;
          layerEl.appendChild(star);
        }
        field.appendChild(layerEl);
        layerEls.push(layerEl);
      });
    }

    const floatingEls = Array.from(document.querySelectorAll<HTMLElement>(".floating"));

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
      const y = window.scrollY;
      const span = window.innerHeight * 2; // matches the ~200vh star spread

      LAYERS.forEach((layer, i) => {
        const el = layerEls[i];
        if (!el) return;
        const offset = (y * layer.factor) % span;
        el.style.transform = `translateY(-${offset}px)`;
      });

      floatingEls.forEach((el, i) => {
        const factor = FLOAT_FACTORS[i] ?? 0;
        const val = Math.max(-FLOAT_MAX, Math.min(FLOAT_MAX, y * factor));
        el.style.transform = `translateY(${val}px)`;
      });
    }

    function onScroll() {
      if (!raf) raf = requestAnimationFrame(tick);
    }

    tick();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      if (field) field.innerHTML = "";
    };
  }, []);

  return <div className="stars-field" ref={fieldRef} aria-hidden="true" />;
}
