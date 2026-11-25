import type { Brand } from "./types";

/** An alias is a brand plus the public page that shows its descriptor (ADR-021). */
export interface Alias extends Brand {
  readonly source: string;
}

/**
 * DEMO ONLY: fictional services used by tests and the demo. No public source naming a real
 * service's descriptor was recorded in docs/RESEARCH.md or ADR-021, so no real alias is shipped
 * (ADR-021 requires one per entry). `example.invalid` never resolves.
 */
export const DEMO_ALIASES: readonly Alias[] = [
  ["Acme Coffee", ["ACME COFFEE"]],
  ["Northwind Gym", ["NORTHWIND GYM"]],
  ["QuickFuel", ["QUICKFUEL"]],
  ["Mapleview Grocers", ["MAPLEVIEW GROCERS", "MAPLEVIEW"]],
  ["Pinewood Pharmacy", ["PINEWOOD PHARMACY", "PINEWOOD PHARM"]],
  ["Streamly", ["STREAMLY"]],
  ["CloudBox", ["CLOUDBOX"]],
  ["TuneHive", ["TUNEHIVE"]],
  ["GameShelf", ["GAMESHELF"]],
  ["FakeMart", ["FAKEMART"]],
  ["Bluejay Studio", ["BLUEJAY STUDIO"]],
  ["Demo Tickets", ["DEMO TICKETS"]],
].map(([name, match]) => ({
  name: name as string,
  match: match as string[],
  source: "https://example.invalid/demo-descriptor",
}));
