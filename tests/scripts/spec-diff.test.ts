import { describe, expect, it } from "vitest";
import { diffSpecs } from "../../scripts/spec-diff.js";

interface TestSpec {
  info: { version: string };
  paths: Record<string, unknown>;
  components: { schemas: Record<string, unknown> };
}

const baseSpec: TestSpec = {
  info: { version: "0.0.2" },
  paths: {
    "/v2/hex/{hex}": { get: { operationId: "hex" } },
    "/v2/point/{lat}/{lon}/{radius}": { get: { operationId: "point" } },
  },
  components: {
    schemas: {
      PlaneList: { type: "object", properties: { ac: { type: "array" } } },
      V2Response_AcItem: {
        type: "object",
        properties: { hex: { type: "string" }, alt_baro: { type: "integer" } },
      },
      HTTPValidationError: { type: "object" },
    },
  },
};

const emptyDiff = {
  addedPaths: [],
  removedPaths: [],
  addedSchemas: [],
  removedSchemas: [],
  changedSchemas: [],
  changed: false,
};

function clone(spec: TestSpec): TestSpec {
  return JSON.parse(JSON.stringify(spec)) as TestSpec;
}

describe("diffSpecs", () => {
  it("reports no changes for identical specs", () => {
    expect(diffSpecs(baseSpec, clone(baseSpec))).toEqual(emptyDiff);
  });

  it("reports a new path", () => {
    const next = clone(baseSpec);
    next.paths["/v2/foo"] = { get: { operationId: "foo" } };

    expect(diffSpecs(baseSpec, next)).toEqual({
      ...emptyDiff,
      addedPaths: ["/v2/foo"],
      changed: true,
    });
  });

  it("reports a removed schema", () => {
    const next = clone(baseSpec);
    delete next.components.schemas.PlaneList;

    expect(diffSpecs(baseSpec, next)).toEqual({
      ...emptyDiff,
      removedSchemas: ["PlaneList"],
      changed: true,
    });
  });

  it("reports a changed property in a schema", () => {
    const next = clone(baseSpec);
    next.components.schemas.V2Response_AcItem = {
      type: "object",
      properties: { hex: { type: "string" }, alt_baro: { type: "number" } },
    };

    expect(diffSpecs(baseSpec, next)).toEqual({
      ...emptyDiff,
      changedSchemas: ["V2Response_AcItem"],
      changed: true,
    });
  });

  it("flags a version-only change as changed without listing any entries", () => {
    const next = clone(baseSpec);
    next.info.version = "0.0.3";

    expect(diffSpecs(baseSpec, next)).toEqual({ ...emptyDiff, changed: true });
  });

  it("ignores key order when comparing schemas", () => {
    const next = clone(baseSpec);
    next.components.schemas.V2Response_AcItem = {
      properties: { alt_baro: { type: "integer" }, hex: { type: "string" } },
      type: "object",
    };

    expect(diffSpecs(baseSpec, next)).toEqual(emptyDiff);
  });
});
