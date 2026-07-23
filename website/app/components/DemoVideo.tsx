"use client";
import { useEffect, useRef, useState } from "react";

// Replaces the 531 KB /demo.gif with the same clip encoded as an 141 KB
// h264 mp4. SSR renders a plain, paused <video preload="metadata" poster>
// with no `autoplay` attribute at all — identical markup on server and
// first client paint, so there is no hydration mismatch. Once mounted,
// client JS checks prefers-reduced-motion and either starts ambient
// looping playback (the normal case — looks identical to the old GIF) or
// leaves it paused with visible native controls so a reduced-motion
// visitor gets a still poster plus a real, keyboard-operable play button
// instead of motion they didn't ask for.
export default function DemoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [controls, setControls] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");

    function apply(reduced: boolean) {
      setControls(reduced);
      const el = videoRef.current;
      if (!el) return;
      if (reduced) el.pause();
      else el.play().catch(() => {});
    }

    apply(mql.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return (
    <video
      ref={videoRef}
      className="demo-video"
      src="/demo.mp4"
      poster="/demo-poster.jpg"
      muted
      loop
      playsInline
      preload="metadata"
      controls={controls}
      width={880}
      height={550}
      aria-label="A short demo of Our Cosy Corner: adding a note, ticking a to-do, switching themes"
    />
  );
}
