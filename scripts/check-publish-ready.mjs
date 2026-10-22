/**
 * Refuse to publish a package that is missing what a package needs, or whose
 * registry metadata disagrees with itself.
 *
 * `mcpName` in package.json must equal `name` in server.json, or the MCP
 * Registry rejects the server. Versions must agree, or the registry entry
 * points at a package version that does not exist. The homepage and the
 * registry website must be the tool page constant in src/links.ts, and the
 * README must document every tool and every game. None of this is noticed
 * until a version is published and immutable, so it is checked here.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const load = (f) => import(pathToFileURL(resolve(root, "dist", f)).href);

const problems = [];
const PLACEHOLDER = /OWNER|example\.com|CHANGE_?ME|TODO/i;

for (const field of ["homepage", "repository", "author", "bugs"]) {
  const value = pkg[field];
  if (!value) {
    problems.push(`package.json is missing "${field}"`);
    continue;
  }
  const asText = typeof value === "string" ? value : JSON.stringify(value);
  if (PLACEHOLDER.test(asText)) problems.push(`package.json "${field}" is still a placeholder: ${asText}`);
}

for (const f of ["LICENSE", "README.md", "dist/index.js", "dist/cli.js", "dist/selftest.js", "dist/lib.js", "dist/links.js", "dist/tools.js"])
  if (!existsSync(resolve(root, f))) problems.push(`${f} is missing; run the build first`);

// The selftest reads fixtures/ at runtime, so it has to ship.
if (!(pkg.files ?? []).includes("fixtures")) problems.push('"fixtures" must be in the npm files list (the selftest reads it)');
const fixtureCount = existsSync(resolve(root, "fixtures")) ? readdirSync(resolve(root, "fixtures")).filter((f) => f.endsWith(".json")).length : 0;
if (fixtureCount < 12) problems.push(`fixtures/ has ${fixtureCount} JSON files, expected 12`);

let AI_TOOL_PAGE = null;
if (existsSync(resolve(root, "dist/links.js"))) ({ AI_TOOL_PAGE } = await load("links.js"));
if (AI_TOOL_PAGE && pkg.homepage !== AI_TOOL_PAGE)
  problems.push(`package.json homepage "${pkg.homepage}" differs from AI_TOOL_PAGE "${AI_TOOL_PAGE}" in src/links.ts`);

// MCP Registry metadata.
const serverPath = resolve(root, "server.json");
if (!existsSync(serverPath)) {
  problems.push("server.json is missing");
} else {
  const server = JSON.parse(readFileSync(serverPath, "utf8"));
  if (!pkg.mcpName) problems.push('package.json is missing "mcpName"');
  else if (pkg.mcpName !== server.name)
    problems.push(`package.json mcpName "${pkg.mcpName}" differs from server.json name "${server.name}"`);
  if (server.version !== pkg.version)
    problems.push(`server.json version "${server.version}" differs from package.json version "${pkg.version}"`);
  const npmEntries = (server.packages ?? []).filter((p) => p.registryType === "npm");
  if (!npmEntries.length) problems.push("server.json has no npm package entry");
  for (const p of npmEntries) {
    if (p.identifier !== pkg.name)
      problems.push(`server.json package identifier "${p.identifier}" differs from package.json name "${pkg.name}"`);
    if (p.version !== pkg.version)
      problems.push(`server.json package version "${p.version}" differs from package.json version "${pkg.version}"`);
  }
  if (typeof server.description !== "string" || server.description.length > 100)
    problems.push("server.json description must be a string of at most 100 characters");
  if (AI_TOOL_PAGE && server.websiteUrl !== AI_TOOL_PAGE)
    problems.push(`server.json websiteUrl "${server.websiteUrl}" differs from AI_TOOL_PAGE "${AI_TOOL_PAGE}"`);
  if ((pkg.files ?? []).includes("server.json")) problems.push("server.json must not be in the npm files list");
}

// The README must link the tool page near the top, document every tool and
// every game id, carry the official-announcement disclaimer, and say that
// draws are independent.
if (existsSync(resolve(root, "README.md")) && existsSync(resolve(root, "dist/tools.js")) && AI_TOOL_PAGE) {
  const readme = readFileSync(resolve(root, "README.md"), "utf8").replace(/\r\n/g, "\n");
  const { TOOL_NAMES } = await load("tools.js");
  const { GAME_IDS } = await load("games.js");
  const toolLine = `說明與完整開獎資料：[${new URL(AI_TOOL_PAGE).host}](${AI_TOOL_PAGE})`;
  const at = readme.indexOf(toolLine);
  if (at < 0) problems.push(`README.md is missing the line: ${toolLine}`);
  else if (readme.slice(0, at).split("\n").length > 12) problems.push("README.md: the tool page line must be near the top (first 12 lines)");
  for (const name of TOOL_NAMES) if (!readme.includes("`" + name + "`")) problems.push(`README.md does not document the tool \`${name}\``);
  for (const id of GAME_IDS) if (!readme.includes("`" + id + "`")) problems.push(`README.md does not list the game id \`${id}\``);
  if (!readme.includes("以台灣彩券官方公告為準")) problems.push("README.md is missing 以台灣彩券官方公告為準");
  if (!readme.includes("獨立")) problems.push("README.md must say that each draw is independent");
  // The delay follows the official FAQ only; a single observation must be labelled as one.
  if (readme.includes("20 分鐘以上")) problems.push("README.md still claims a 20-minute delay; use the official 21:30 / 22:00 times");
  if (!readme.includes("21:30 以前")) problems.push("README.md must say that before 21:30 the day's draw is normally missing");
  if (readme.includes("20:53") && !readme.includes("一次觀察")) problems.push("README.md: the 20:53 note must be marked as a one-time observation (一次觀察)");
  // Say plainly what the links are.
  const host = new URL(AI_TOOL_PAGE).host;
  if (!new RegExp(`${host.replace(/\./g, "\\.")}[^\\n]*廣告`).test(readme)) problems.push(`README.md must say in Chinese that ${host} carries ads`);
  if (!new RegExp(`${host.replace(/\./g, "\\.")}[^\\n]*\\bads\\b`).test(readme)) problems.push(`README.md must say in English that ${host} carries ads`);
  // Node 18: the SDK pulls in a package that declares Node 20.
  for (const word of ["EBADENGINE", "engine-strict", "Node.js 20"])
    if (!readme.includes(word)) problems.push(`README.md must explain the Node 18 install warning (missing "${word}")`);
}

// What npm would actually publish: no source maps pointing at src/ that is not shipped, no src/, fixtures included.
{
  const r = spawnSync("npm pack --dry-run --json --ignore-scripts", { cwd: root, encoding: "utf8", shell: true });
  let files = null;
  try { files = JSON.parse(r.stdout)[0].files.map((f) => f.path); } catch { problems.push(`npm pack --dry-run failed: ${(r.stderr || "").slice(0, 200)}`); }
  if (files) {
    const maps = files.filter((f) => f.endsWith(".map"));
    if (maps.length) problems.push(`the package would ship ${maps.length} source map(s) pointing at src/, which is not published (e.g. ${maps[0]})`);
    if (files.some((f) => f.startsWith("src/"))) problems.push("the package would ship src/");
    if (!files.some((f) => f.startsWith("fixtures/"))) problems.push("the package would not ship fixtures/ (the selftest needs it)");
  }
}

// "exports" must point at the side-effect-free library, and importing the package by name must work.
{
  const dot = pkg.exports?.["."];
  if (!dot) problems.push('package.json has no "exports" entry for "."');
  else {
    if (dot.import !== "./" + pkg.main) problems.push(`exports["."].import "${dot.import}" differs from main "${pkg.main}"`);
    if (dot.types !== "./" + pkg.types) problems.push(`exports["."].types "${dot.types}" differs from types "${pkg.types}"`);
  }
  // Inside the package directory Node resolves the package's own name through "exports" (self-reference).
  const probe = `const m = await import(${JSON.stringify(pkg.name)}); process.stdout.write(typeof m.checkTicket);`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", probe], { cwd: root, encoding: "utf8", timeout: 10_000 });
  if (r.stdout !== "function") problems.push(`import ${JSON.stringify(pkg.name)} does not resolve to the library (${(r.stderr || "").split("\n").find((l) => l.includes("Error")) ?? r.stdout})`);
}

// `main` is what `import "mcp-server-taiwan-lottery"` loads. It must have no
// side effects: importing it must not start a server, print, or keep the
// process alive. stdin stays open, so a module that starts the stdio server
// would never exit and is caught by the timeout.
if (!pkg.main) {
  problems.push('package.json is missing "main"');
} else if (existsSync(resolve(root, pkg.main))) {
  const mainUrl = pathToFileURL(resolve(root, pkg.main)).href;
  const probe = `const m = await import(${JSON.stringify(mainUrl)}); process.stderr.write([typeof m.checkTicket, typeof m.LotteryService, typeof m.resolveGame].join(","));`;
  const result = await new Promise((done) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", probe], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => { child.kill(); done({ timedOut: true, out, err }); }, 10_000);
    child.on("exit", (code) => { clearTimeout(timer); done({ timedOut: false, code, out, err }); });
  });
  if (result.timedOut) problems.push(`importing "main" (${pkg.main}) did not finish within 10 s: it has side effects such as starting a server`);
  else if (result.out) problems.push(`importing "main" (${pkg.main}) printed to stdout: ${result.out.slice(0, 80)}`);
  else if (result.err !== "function,function,function") problems.push(`importing "main" (${pkg.main}) does not export checkTicket, LotteryService and resolveGame (stderr: ${result.err.slice(0, 160)})`);
  if (pkg.types && pkg.types.replace(/\.d\.ts$/, ".js") !== pkg.main) problems.push(`"types" (${pkg.types}) does not match "main" (${pkg.main})`);
}

if (problems.length) {
  console.error("not ready to publish:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("publish checks passed");
