import assert from "node:assert/strict";
import test from "node:test";
import { ships } from "../src/data/since.ts";

test("every ship log entry has a real date, and none is in the future", () => {
  assert.ok(Array.isArray(ships));
  assert.ok(ships.length > 0);
  const today = new Date().toISOString().slice(0, 10);

  for (const ship of ships) {
    assert.equal(typeof ship?.date, "string", "entry is missing a date");
    assert.match(ship.date, /^\d{4}-\d{2}-\d{2}$/);
    const [year, month, day] = ship.date.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    assert.equal(Number.isNaN(parsed.getTime()), false);
    assert.equal(parsed.getUTCFullYear(), year);
    assert.equal(parsed.getUTCMonth() + 1, month);
    assert.equal(parsed.getUTCDate(), day);
    assert.ok(ship.date <= today, `${ship.date} is after ${today}`);
  }
});
