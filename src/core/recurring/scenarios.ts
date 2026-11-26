import { addDays, addMonths } from "../plainDate";
import type { Transaction } from "../types";
import type { SeriesCadence } from "./types";

/** AC-6 labelled suite: invented ledgers, each with the series a reader would list (ADR-014). */
export interface Scenario {
  readonly name: string;
  readonly transactions: readonly Transaction[];
  /** Cleaned description (the decoder's key) and cadence of every series that should be found. */
  readonly expected: readonly {
    readonly key: string;
    readonly cadence: SeriesCadence;
  }[];
}

function prng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const START = "2025-01-05";
let counter = 0;
const tx = (
  date: string,
  description: string,
  amount: number,
): Transaction => ({
  id: `sc${counter++}`,
  date,
  description,
  amount,
  source: { statementId: "suite", input: "csv", row: counter },
});

const monthly = (
  desc: string,
  amounts: readonly number[],
  day = 10,
  jitter: (i: number) => number = () => 0,
) =>
  amounts.map((a, i) =>
    tx(
      addDays(
        addMonths(`2025-01-${String(day).padStart(2, "0")}`, i),
        jitter(i),
      ),
      desc,
      a,
    ),
  );
const every = (
  days: number,
  desc: string,
  count: number,
  amount: (i: number) => number,
  start = START,
  jitter: (i: number) => number = () => 0,
) =>
  Array.from({ length: count }, (_, i) =>
    tx(addDays(start, i * days + jitter(i)), desc, amount(i)),
  );
const same = (n: number, a: number) => Array.from({ length: n }, () => a);

/** Irregular everyday spending: groceries, coffee, a bookshop. None of it is a subscription. */
function noise(seed: number, months = 12): Transaction[] {
  const rand = prng(seed);
  const between = (lo: number, hi: number) =>
    lo + Math.floor(rand() * (hi - lo + 1));
  const out: Transaction[] = [];
  for (let i = 0; i < months; i++) {
    const m = addMonths("2025-01-01", i);
    const on = (d: number) => addDays(m, d - 1);
    for (let k = between(3, 5); k > 0; k--)
      out.push(tx(on(between(1, 28)), "FRESHMART", -between(2000, 12000)));
    for (let k = between(4, 8); k > 0; k--)
      out.push(tx(on(between(1, 28)), "CORNER CAFE", -between(350, 900)));
    out.push(tx(on(between(1, 28)), "HARBOUR BOOKS", -between(1500, 6000)));
  }
  return out;
}

const sc = (
  name: string,
  seed: number,
  series: Transaction[],
  expected: Scenario["expected"],
): Scenario => ({ name, transactions: [...series, ...noise(seed)], expected });
const m = (key: string): Scenario["expected"][number] => ({
  key,
  cadence: "monthly",
});

const MONTHLY_FIXED: [string, number, number][] = [
  ["STREAMLY", 1699, 5],
  ["IRONWORKS GYM", 4500, 12],
  ["CLOUDBOX", 299, 1],
  ["TUNEHIVE", 1099, 20],
  ["NORTHWIND INTERNET", 7999, 3],
  ["NORTHWIND MOBILE", 5500, 17],
  ["PINEWOOD INSURANCE", 12450, 28],
  ["MAPLE STORAGE", 8900, 9],
];

export const SCENARIOS: readonly Scenario[] = [
  ...MONTHLY_FIXED.map(([key, cents, day], i) =>
    sc(`monthly fixed: ${key}`, 100 + i, monthly(key, same(12, -cents), day), [
      m(key),
    ]),
  ),
  sc(
    "monthly with the date drifting by up to two days",
    120,
    monthly(
      "STREAMLY",
      same(12, -1699),
      10,
      (i) => [0, 1, -1, 2, 0, -2, 1, 0, 2, -1, 0, 1][i] ?? 0,
    ),
    [m("STREAMLY")],
  ),
  sc(
    "monthly price increase after six months",
    121,
    monthly("IRONWORKS GYM", [...same(6, -4500), ...same(6, -4900)]),
    [m("IRONWORKS GYM")],
  ),
  sc(
    "monthly price increase after four months",
    122,
    monthly("CLOUDBOX", [...same(4, -299), ...same(8, -399)]),
    [m("CLOUDBOX")],
  ),
  sc(
    "a missed month in the middle",
    123,
    [
      ...monthly("TUNEHIVE", same(4, -1099)),
      ...monthly("TUNEHIVE", same(7, -1099))
        .slice(5)
        .map((t) => ({ ...t, id: `x${counter++}` })),
    ],
    [m("TUNEHIVE")],
  ),
  sc(
    "variable monthly bill (utility)",
    124,
    monthly(
      "CITY HYDRO",
      [
        -6000, -9500, -14000, -7000, -12000, -8000, -11000, -6500, -10000,
        -13500, -7500, -9000,
      ],
      14,
    ),
    [m("CITY HYDRO")],
  ),
  sc(
    "variable monthly bill (phone with usage)",
    125,
    monthly(
      "NORTHWIND MOBILE",
      [-6500, -7200, -9900, -6800, -8800, -7400, -10500, -6600],
      21,
    ),
    [m("NORTHWIND MOBILE")],
  ),
  sc(
    "only three months of history",
    126,
    monthly("STREAMLY", same(3, -1699)).concat([]),
    [m("STREAMLY")],
  ),
  sc(
    "two subscriptions side by side",
    127,
    [
      ...monthly("STREAMLY", same(12, -1699), 5),
      ...monthly("TUNEHIVE", same(12, -1099), 19),
    ],
    [m("STREAMLY"), m("TUNEHIVE")],
  ),
  sc(
    "a subscription on the 31st",
    128,
    monthly("NIGHT OWL", same(12, -2000), 31),
    [m("NIGHT OWL")],
  ),
  sc(
    "weekly class",
    130,
    every(7, "CLIMB CLUB", 40, () => -1800),
    [{ key: "CLIMB CLUB", cadence: "weekly" }],
  ),
  sc(
    "weekly with a day of jitter",
    131,
    every(
      7,
      "PILATES HALL",
      30,
      () => -2200,
      START,
      (i) => [0, 1, 0, -1][i % 4] ?? 0,
    ),
    [{ key: "PILATES HALL", cadence: "weekly" }],
  ),
  sc(
    "weekly with a price rise",
    132,
    every(7, "LAUNDRY CLUB", 30, (i) => (i < 15 ? -1500 : -1700)),
    [{ key: "LAUNDRY CLUB", cadence: "weekly" }],
  ),
  sc(
    "every two weeks",
    133,
    every(14, "CLEANING CREW", 24, () => -8000),
    [{ key: "CLEANING CREW", cadence: "biweekly" }],
  ),
  sc(
    "twice a month on the 1st and 15th",
    134,
    Array.from({ length: 24 }, (_, i) =>
      tx(
        addMonths(i % 2 === 0 ? "2025-01-01" : "2025-01-15", Math.floor(i / 2)),
        "PET SITTER",
        -4000,
      ),
    ),
    [{ key: "PET SITTER", cadence: "biweekly" }],
  ),
  sc(
    "every two weeks, amount varies (a variable recurring bill)",
    135,
    every(14, "MEAL PREP", 20, (i) => -(5500 + (i % 3) * 900)),
    [{ key: "MEAL PREP", cadence: "biweekly" }],
  ),
  sc(
    "a monthly and a weekly series together",
    136,
    [
      ...monthly("STREAMLY", same(12, -1699), 5),
      ...every(7, "CLIMB CLUB", 40, () => -1800),
    ],
    [m("STREAMLY"), { key: "CLIMB CLUB", cadence: "weekly" }],
  ),
  sc("no subscriptions at all", 140, [], []),
  sc(
    "refunds and a refunded subscription month",
    141,
    [
      ...monthly("STREAMLY", same(12, -1699), 5),
      tx("2025-06-20", "STREAMLY", 1699),
    ],
    [m("STREAMLY")],
  ),
  sc(
    "a monthly e-transfer is not a charge",
    142,
    monthly("E-TRANSFER SENT", same(12, -50000), 1),
    [],
  ),
  sc(
    "a monthly credit card payment is not a charge",
    143,
    monthly("CREDIT CARD PAYMENT", same(12, -45000), 25),
    [],
  ),
  sc(
    "cash withdrawals",
    144,
    every(7, "ATM WITHDRAWAL", 20, () => -6000),
    [],
  ),
  sc(
    "pay in is not a charge",
    145,
    monthly("ACME PAYROLL", same(12, 240000), 1),
    [],
  ),
  sc(
    "one-off purchases",
    146,
    [
      tx("2025-03-02", "FURNITURE HOUSE", -45000),
      tx("2025-08-20", "BIKE WORKS", -30000),
    ],
    [],
  ),
  sc(
    "a purchase twice, months apart, different amounts",
    147,
    [
      tx("2025-02-01", "SHOE SHOP", -8000),
      tx("2025-03-02", "SHOE SHOP", -13000),
    ],
    [],
  ),
  sc(
    "same merchant twice on one day each month counts once",
    148,
    [
      ...monthly("IRONWORKS GYM", same(12, -2000), 12),
      ...monthly("IRONWORKS GYM", same(12, -2500), 12),
    ],
    [m("IRONWORKS GYM")],
  ),
  sc(
    "irregular visits to one place",
    149,
    [
      "2025-01-02",
      "2025-01-09",
      "2025-01-11",
      "2025-01-30",
      "2025-02-14",
      "2025-02-15",
      "2025-03-27",
    ].map((d) => tx(d, "TOOL LIBRARY", -1200)),
    [],
  ),
  sc(
    "weekly groceries on irregular days",
    150,
    every(
      5,
      "BIG BASKET",
      30,
      (i) => -(4000 + ((i * 37) % 5000)),
      START,
      (i) => (i * 7) % 4,
    ),
    [],
  ),
  sc(
    "monthly subscription and a noisy neighbour name",
    151,
    [
      ...monthly("STREAMLY", same(12, -1699), 5),
      ...monthly("STREAMLY KIDS", [-899, -899, -899, -899, -899, -899], 22),
    ],
    [m("STREAMLY"), m("STREAMLY KIDS")],
  ),
];
