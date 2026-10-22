import { readFileSync } from "node:fs";

/** Package version, read from package.json so it is never out of step. */
export const VERSION: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
