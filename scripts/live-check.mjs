/**
 * Calls the real official API once per game and prints the newest draw.
 * Not part of CI: it needs the network and the answers change every day.
 * Use it after an API change, or before a release.
 *
 *   npm run build && node scripts/live-check.mjs
 *
 * Requests go one after another with a short pause, through the same client
 * the server uses (User-Agent, timeout, parser).
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const { LotteryService, GAME_IDS, GAMES, USER_AGENT } = await import(pathToFileURL(resolve(dist, "lib.js")).href);

const service = new LotteryService();
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
let failures = 0;

console.log(`User-Agent: ${USER_AGENT}`);
for (const id of GAME_IDS) {
  const started = Date.now();
  try {
    const r = await service.latestDraw({ game: id });
    const d = r.draw;
    const nums = d.digits ? d.digits.join("") : d.numbers.map((n) => String(n).padStart(2, "0")).join(" ");
    const extra =
      d.special_number !== undefined ? ` 特別號 ${d.special_number}` :
      d.second_zone !== undefined ? ` 第二區 ${d.second_zone}` :
      d.super_number !== undefined ? ` 超級獎號 ${d.super_number}` : "";
    const prizes = d.prizes ? ` | ${d.prizes.length} 個獎項` : "";
    console.log(
      `  [ok] ${id.padEnd(10)} ${GAMES[id].name.padEnd(6, "　")} 第 ${d.period} 期 ${d.date}${d.draw_time ? " " + d.draw_time : ""}  ${nums}${extra}${prizes}  (${Date.now() - started} ms)`,
    );
  } catch (err) {
    failures++;
    console.log(`  [FAIL] ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
  await sleep(300);
}
console.log(failures ? `\n${failures} game(s) failed` : "\nall games answered");
process.exit(failures ? 1 : 0);
