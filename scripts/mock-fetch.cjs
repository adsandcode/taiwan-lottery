/**
 * Preload for scripts/smoke.mjs:  node -r ./scripts/mock-fetch.cjs dist/index.js
 *
 * Replaces the global fetch with one that answers from the recorded official
 * responses in fixtures/, so the smoke test exercises the real server and CLI
 * without the network. Each request is appended to MOCK_FETCH_LOG (one JSON
 * line: url and User-Agent) so the smoke test can check what was asked for.
 * MOCK_FETCH_FAIL=500 makes every request fail with HTTP 500.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const FIXTURES = path.resolve(__dirname, "..", "fixtures");
const FILES = {
  Daily539Result: "539.json",
  Lotto649Result: "lotto649.json",
  SuperLotto638Result: "superlotto.json",
  "3DResult": "3d.json",
  "4DResult": "4d.json",
  "39M5Result": "39m.json",
  "49M6Result": "49m.json",
  "38M6Result": "38m.json",
  Lotto1224Result: "lotto1224.json",
  BingoResult: "bingo.json",
  LatestBingoResult: "bingo-latest.json",
  NextDrawDate: "next-draw-date.json",
};

const respond = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

globalThis.fetch = async function mockFetch(url, init = {}) {
  const headers = init.headers || {};
  if (process.env.MOCK_FETCH_LOG)
    fs.appendFileSync(process.env.MOCK_FETCH_LOG, JSON.stringify({ url: String(url), ua: headers["User-Agent"] || null }) + "\n");
  if (process.env.MOCK_FETCH_FAIL === "500") return respond(500, {});
  const u = new URL(String(url));
  if (u.hostname !== "api.taiwanlottery.com") return respond(404, {});
  const endpoint = u.pathname.split("/").pop();
  if (endpoint === "ExceptionNotice") return respond(200, { rtCode: 0, rtMsg: null, content: { exceptions: [] } });
  const file = FILES[endpoint];
  if (!file) return respond(404, {});
  const body = JSON.parse(fs.readFileSync(path.join(FIXTURES, file), "utf8")).response;
  const period = u.searchParams.get("period");
  const pageSize = Number(u.searchParams.get("pageSize") || 0);
  for (const key of Object.keys(body.content || {})) {
    if (!Array.isArray(body.content[key])) continue;
    let list = body.content[key];
    if (period) list = list.filter((d) => String(d.period) === period);
    if (pageSize) list = list.slice(0, pageSize);
    body.content[key] = list;
    if (period) body.content.totalSize = list.length;
  }
  return respond(200, body);
};
