/** Result of comparing two OpenAPI documents. */
export interface SpecDiff {
  /** Paths present in the new spec only. */
  addedPaths: string[];
  /** Paths present in the old spec only. */
  removedPaths: string[];
  /** Component schemas present in the new spec only. */
  addedSchemas: string[];
  /** Component schemas present in the old spec only. */
  removedSchemas: string[];
  /** Component schemas present in both specs whose content differs. */
  changedSchemas: string[];
  /** True if the whole document differs, including fields the lists do not cover (e.g. `info.version`). */
  changed: boolean;
}

type Obj = Record<string, unknown>;

function isObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Serializes a value with sorted object keys, so key order does not count as a change. */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (isObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function recordAt(spec: unknown, ...keys: string[]): Obj {
  let current: unknown = spec;
  for (const key of keys) {
    if (!isObject(current)) {
      return {};
    }
    current = current[key];
  }
  return isObject(current) ? current : {};
}

function keysOnly(from: Obj, other: Obj): string[] {
  return Object.keys(from)
    .filter((key) => !(key in other))
    .sort();
}

function keysChanged(oldRecord: Obj, newRecord: Obj): string[] {
  return Object.keys(oldRecord)
    .filter(
      (key) => key in newRecord && canonicalize(oldRecord[key]) !== canonicalize(newRecord[key]),
    )
    .sort();
}

/**
 * Compares two OpenAPI documents by paths and component schemas.
 * `changed` compares the whole document, so any difference shows up there.
 */
export function diffSpecs(oldSpec: unknown, newSpec: unknown): SpecDiff {
  const oldPaths = recordAt(oldSpec, "paths");
  const newPaths = recordAt(newSpec, "paths");
  const oldSchemas = recordAt(oldSpec, "components", "schemas");
  const newSchemas = recordAt(newSpec, "components", "schemas");

  return {
    addedPaths: keysOnly(newPaths, oldPaths),
    removedPaths: keysOnly(oldPaths, newPaths),
    addedSchemas: keysOnly(newSchemas, oldSchemas),
    removedSchemas: keysOnly(oldSchemas, newSchemas),
    changedSchemas: keysChanged(oldSchemas, newSchemas),
    changed: canonicalize(oldSpec) !== canonicalize(newSpec),
  };
}
