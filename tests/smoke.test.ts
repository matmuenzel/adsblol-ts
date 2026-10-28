import { expect, it } from "vitest";
import * as lib from "../src/index.js";

it("loads the package entry point", () => {
  expect(lib).toBeTypeOf("object");
});
