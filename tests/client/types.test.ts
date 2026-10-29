import { describe, expectTypeOf, it } from "vitest";
import type { components } from "../../src/generated/schema.js";
import type { Aircraft, AircraftResponse, LastPosition } from "../../src/client/types.js";

type Schemas = components["schemas"];

describe("public types cover the spec", () => {
  it("Aircraft knows every V2Response_AcItem property", () => {
    type Missing = Exclude<keyof Schemas["V2Response_AcItem"], keyof Aircraft>;
    expectTypeOf<Missing>().toEqualTypeOf<never>();
  });

  it("AircraftResponse knows every V2Response_Model property", () => {
    type Missing = Exclude<keyof Schemas["V2Response_Model"], keyof AircraftResponse>;
    expectTypeOf<Missing>().toEqualTypeOf<never>();
  });

  it("LastPosition knows every V2Response_LastPosition property", () => {
    type Missing = Exclude<keyof Schemas["V2Response_LastPosition"], keyof LastPosition>;
    expectTypeOf<Missing>().toEqualTypeOf<never>();
  });

  it("keeps the spec's required fields required", () => {
    expectTypeOf<Aircraft["hex"]>().toEqualTypeOf<string>();
    expectTypeOf<Aircraft["messages"]>().toEqualTypeOf<number>();
    expectTypeOf<Aircraft["mlat"]>().toEqualTypeOf<string[]>();
    expectTypeOf<Aircraft["rssi"]>().toEqualTypeOf<number>();
    expectTypeOf<Aircraft["seen"]>().toEqualTypeOf<number>();
    expectTypeOf<Aircraft["tisb"]>().toEqualTypeOf<string[]>();
    expectTypeOf<Aircraft["type"]>().not.toBeUndefined();
  });

  it("alt_baro is a number, the literal ground or absent", () => {
    expectTypeOf<Aircraft["alt_baro"]>().toEqualTypeOf<number | "ground" | undefined>();
  });
});
