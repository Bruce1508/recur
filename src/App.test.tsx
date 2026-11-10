import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { App } from "./App";

test("placeholder page renders the product name", () => {
  expect(renderToString(<App />)).toContain("Recur");
});
