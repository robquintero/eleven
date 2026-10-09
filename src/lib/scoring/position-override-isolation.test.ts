import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/**
 * Pass 3 requirement 4: "Protect settled historical fantasy scores from
 * position-sensitive recalculation before activating overrides."
 *
 * The chosen protection is architectural, not a runtime guard: the
 * scoring pipeline (backfill/replay/calibration) never reads
 * `canonical_position` at all -- only the raw, provider `players.position`
 * -- so a position override can never change what a fixture that already
 * happened is worth, no matter how many times it's replayed. This test
 * guards that boundary: if a future change ever makes any of these three
 * files reference `canonical_position`, this test fails and says why,
 * rather than letting history silently start drifting with position
 * corrections.
 */
const SCORING_FILES = ["backfill.ts", "replay.ts", "calibration.ts"];

for (const file of SCORING_FILES) {
  test(`${file} never reads canonical_position -- settled scores must stay independent of position overrides`, async () => {
    const source = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    assert.equal(
      source.includes("canonical_position"),
      false,
      `${file} must keep reading raw players.position only; wiring canonical_position into scoring would let an approved position override retroactively change a settled fixture's points`
    );
  });
}
