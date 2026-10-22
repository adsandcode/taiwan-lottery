/**
 * Records real responses from the official Taiwan Lottery API into fixtures/.
 * The selftest and the smoke test run against these files, so they never need
 * the network. Run this by hand when the API shape changes; it is not part of CI.
 *
 *   node scripts/record-fixtures.mjs
 *
 * One request per file, one after another, with a pause in between.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://api.taiwanlottery.com/TLCAPIWeB/Lottery/";
const UA = "mcp-server-taiwan-lottery fixture recorder";

// Months are fixed so a re-recording is reproducible. The two games that are
// no longer in the official schedule are recorded from their last month.
const RECORD = [
  ["539.json", "Daily539Result?period=&month=2026-10&pageNum=1&pageSize=5"],
  ["lotto649.json", "Lotto649Result?period=&month=2026-10&pageNum=1&pageSize=5"],
  ["superlotto.json", "SuperLotto638Result?period=&month=2026-10&pageNum=1&pageSize=5"],
  ["3d.json", "3DResult?period=&month=2026-10&pageNum=1&pageSize=5"],
  ["4d.json", "4DResult?period=&month=2026-10&pageNum=1&pageSize=5"],
  ["39m.json", "39M5Result?period=&month=2026-10&pageNum=1&pageSize=5"],
  ["49m.json", "49M6Result?period=&month=2026-10&pageNum=1&pageSize=5"],
  ["38m.json", "38M6Result?period=&month=2023-12&pageNum=1&pageSize=5"],
  ["lotto1224.json", "Lotto1224Result?period=&month=2023-12&pageNum=1&pageSize=5"],
  ["bingo.json", "BingoResult?openDate=2026-10-22&pageNum=1&pageSize=3"],
  ["bingo-latest.json", "LatestBingoResult"],
  ["next-draw-date.json", "NextDrawDate"],
];

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

for (const [file, path] of RECORD) {
  const res = await fetch(BASE + path, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const body = await res.json();
  if (body.rtCode !== 0) throw new Error(`${path}: rtCode ${body.rtCode} ${body.rtMsg}`);
  const out = { recorded_at: new Date().toISOString(), request: path, response: body };
  writeFileSync(resolve(root, "fixtures", file), JSON.stringify(out, null, 2) + "\n");
  console.log(`${file}  <-  ${path}`);
  await sleep(400);
}
