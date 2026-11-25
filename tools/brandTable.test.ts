import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { BRANDS } from "../src/core/merchant/brands";
import { decodeDescription } from "../src/core/merchant/decode";
import { buildBrands, renderBrands } from "./brandTable";

const item = (
  displayName: string,
  include: string[],
  extra: Record<string, unknown> = {},
) => ({ displayName, locationSet: { include }, ...extra });

const nsi = {
  "brands/shop/supermarket": {
    items: [
      item("Loblaws", ["ca"]),
      item("Tesco", ["gb"]),
      item("Costco", ["001"], { matchNames: ["costco wholesale"] }),
      item("Aldi", ["001"], {
        locationSet: { include: ["001"], exclude: ["ca"] },
      }),
      item("A&W", ["ca"]),
    ],
  },
  "brands/amenity/cafe": { items: [item("Tim Hortons", ["ca", "us"])] },
  "brands/amenity/bank": { items: [item("Big Bank", ["ca"])] },
};

describe("buildBrands", () => {
  const brands = buildBrands(nsi);
  const names = brands.map((b) => b.name);

  test("keeps Canadian and worldwide brands of the chosen kinds only", () => {
    expect(names).toEqual(["Costco", "Loblaws", "Tim Hortons"]);
  });

  test("drops a brand that excludes Canada, other countries and other kinds", () => {
    expect(names).not.toContain("Aldi");
    expect(names).not.toContain("Tesco");
    expect(names).not.toContain("Big Bank");
  });

  test("drops match forms shorter than four characters", () => {
    expect(names).not.toContain("A&W");
  });

  test("drops forms that are ordinary English words", () => {
    const out = buildBrands({
      "brands/shop/x": { items: [item("Away", ["ca"]), item("Pilot", ["ca"])] },
    });
    expect(out).toEqual([]);
  });

  test("a matchNames form of one word is dropped, a multi-word one kept", () => {
    const out = buildBrands({
      "brands/amenity/fuel": {
        items: [
          item("Mobil", ["ca"], { matchNames: ["mobile", "mobil mart"] }),
        ],
      },
    });
    expect(out).toEqual([{ name: "Mobil", match: ["MOBIL", "MOBIL MART"] }]);
  });

  test("a form claimed by two brands is dropped from both", () => {
    const out = buildBrands({
      "brands/shop/x": {
        items: [
          item("Hudson Group", ["ca"], { matchNames: ["hudson news"] }),
          item("Hudson News", ["ca"]),
        ],
      },
    });
    expect(out).toEqual([{ name: "Hudson Group", match: ["HUDSON GROUP"] }]);
  });

  test("case-duplicate names merge and non-Latin forms are dropped", () => {
    const out = buildBrands({
      "brands/shop/x": {
        items: [
          item("Bugatti", ["ca"]),
          item("bugatti", ["ca"]),
          item("セイコー", ["ca"]),
        ],
      },
    });
    expect(out).toEqual([{ name: "Bugatti", match: ["BUGATTI"] }]);
  });

  test("match forms are normalised, deduplicated and include matchNames", () => {
    expect(brands.find((b) => b.name === "Costco")?.match).toEqual([
      "COSTCO",
      "COSTCO WHOLESALE",
    ]);
  });

  test("output order does not depend on input order", () => {
    const reversed = Object.fromEntries(Object.entries(nsi).reverse());
    expect(buildBrands(reversed)).toEqual(brands);
  });

  test("a generated brand decodes a cleaned description", () => {
    const r = decodeDescription("TIM HORTONS #1234 TORONTO ON_V", { brands });
    expect(r.reading).toMatchObject({
      kind: "name",
      name: "Tim Hortons",
      source: "brand",
    });
  });

  test("never throws and never yields an empty or short form", () => {
    fc.assert(
      fc.property(fc.string(), fc.array(fc.string()), (name, more) => {
        const out = buildBrands({
          "brands/shop/x": {
            items: [item(name, ["ca"], { matchNames: more })],
          },
        });
        for (const b of out)
          for (const m of b.match) expect(m.length).toBeGreaterThanOrEqual(4);
      }),
    );
  });
});

describe("renderBrands", () => {
  test("carries the BSD notice and is valid, stable source", () => {
    const src = renderBrands(buildBrands(nsi));
    expect(src).toContain("BSD 3-Clause");
    expect(src).toContain("name-suggestion-index");
    expect(src).toContain('"Tim Hortons"');
    expect(renderBrands(buildBrands(nsi))).toBe(src);
  });
});

describe("generated BRANDS", () => {
  test("banking and common-word lines never get a brand name", () => {
    for (const d of [
      "MOBILE DEPOSIT",
      "INTERNATIONAL TRANSFER FEE",
      "FOREIGN CURRENCY CONVERSION",
      "DISCOVERY CHANNEL",
      "MOBILE PAYMENT",
      "MOBILE CHEQUE DEPOSIT",
      "CASINO NIAGARA",
      "GARAGE DOOR REPAIR",
      "EXPERT PLUMBING",
      "E-TRANSFER SENT",
      "PAYMENT THANK YOU",
      "INTEREST CHARGE",
      "SERVICE CHARGE",
      "MONTHLY ACCOUNT FEE",
    ]) {
      const r = decodeDescription(d, { brands: BRANDS }).reading;
      expect(r.kind === "name" ? r.source : "unknown", d).not.toBe("brand");
    }
  });
});
