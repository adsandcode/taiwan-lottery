/**
 * Recorded official API responses (fixtures/*.json), used by the selftest so
 * that it never needs the network. scripts/record-fixtures.mjs records them.
 */

import { readFileSync } from "node:fs";

export interface Fixture {
  recorded_at: string;
  request: string;
  response: unknown;
}

export const FIXTURE_FILES: Record<string, string> = {
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

const cache = new Map<string, Fixture>();

export function loadFixture(file: string): Fixture {
  let f = cache.get(file);
  if (!f) {
    f = JSON.parse(readFileSync(new URL(`../fixtures/${file}`, import.meta.url), "utf8")) as Fixture;
    cache.set(file, f);
  }
  // Callers may modify what they get; hand out a copy.
  return JSON.parse(JSON.stringify(f)) as Fixture;
}

export const fixtureResponse = (file: string): unknown => loadFixture(file).response;
