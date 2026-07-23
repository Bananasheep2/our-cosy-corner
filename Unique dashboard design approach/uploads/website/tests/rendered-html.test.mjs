import assert from "node:assert/strict";
import test from "node:test";
import { DL_MAC_ARM, DL_MAC_INTEL, DL_WIN } from "../app/downloads.ts";

// Smoke-tests the built worker's server-rendered HTML for the real product
// pages (landing, download, privacy, terms). The harness below can only
// exercise routes the app-router-entry worker serves per-request — it does
// not do a full browser render, so assertions stick to markup/text that
// shows up in the raw SSR HTML.
async function render(path) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function renderHtml(path) {
  const response = await render(path);
  assert.equal(response.status, 200, `${path} should respond 200`);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
    `${path} should respond with text/html`,
  );
  return response.text();
}

test("landing page renders the hero and links to /download", async () => {
  const html = await renderHtml("/");

  assert.match(html, /Keep your little.*?<em>world<\/em> close\./s);
  assert.match(html, /href="\/download"/);
  assert.match(html, /\/demo\.gif/);
});

test("download page lists all three installer links", async () => {
  const html = await renderHtml("/download");

  for (const href of [DL_MAC_ARM, DL_MAC_INTEL, DL_WIN]) {
    assert.ok(
      html.includes(encodeURI(href)),
      `expected download page to link to ${href}`,
    );
  }
});

test("privacy and terms pages render and list the support email", async () => {
  const privacy = await renderHtml("/privacy");
  const terms = await renderHtml("/terms");

  assert.match(privacy, /ourcosycorner\.help@gmail\.com/);
  assert.match(terms, /ourcosycorner\.help@gmail\.com/);
});
