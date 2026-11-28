import { describe, expect, test } from "vitest";
import { cadenceLabel } from "./labels";

describe("cadenceLabel", () => {
  test("a possible yearly series with several charges does not claim one charge", () => {
    expect(cadenceLabel("annual-possible")).toBe("Possibly yearly");
  });
  test("a single-charge candidate says one charge so far", () => {
    expect(cadenceLabel("annual-possible", true)).toBe(
      "Yearly? (one charge so far)",
    );
  });
  test("other cadences ignore the single-charge flag", () => {
    expect(cadenceLabel("monthly", true)).toBe("Monthly");
  });
});
