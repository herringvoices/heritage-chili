import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("successful chili saves synchronously disarm the unload warning before navigation", async () => {
  const source = await readFile(new URL("../components/dashboard-and-chili.tsx", import.meta.url), "utf8");

  assert.match(source, /if \(dirtyRef\.current\) event\.preventDefault\(\)/);
  assert.match(source, /dirtyRef\.current = false; setDirty\(false\); window\.location\.assign\("\/dashboard"\)/);
});

