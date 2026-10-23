import assert from "node:assert/strict";
import test from "node:test";
import { loader } from "./helpers.mjs";

const load = loader();

test("CSV exports neutralise formulas, including ones hidden behind spaces", () => {
  const { csvCell } = load("lib/admin/records.ts");
  for (const value of ["=1+1", "+1", "-1", "@SUM(A1)", "\t=1", "  =HYPERLINK(1)", "\n=1"]) {
    assert.match(csvCell(value), /^"?'/, JSON.stringify(value));
  }
  assert.equal(csvCell("Ada"), "Ada");
  assert.equal(csvCell("a=b"), "a=b");
  assert.equal(csvCell("one, two"), '"one, two"');
});
