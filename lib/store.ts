import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ACTIONS,
  ROLES,
  cloneMatrix,
  createDefaultMatrix,
  type PermissionMatrix,
} from "./rbac";

const DATA_FILE = path.join(process.cwd(), "data", "rbac.json");

function isMatrix(value: unknown): value is PermissionMatrix {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  for (const role of ROLES) {
    const row = obj[role];
    if (!row || typeof row !== "object") return false;
    const actions = row as Record<string, unknown>;
    for (const action of ACTIONS) {
      if (typeof actions[action] !== "boolean") return false;
    }
  }
  return true;
}

export function readMatrix(): PermissionMatrix {
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as unknown;
    if (isMatrix(raw)) return cloneMatrix(raw);
  } catch {
    // first boot or corrupt file
  }
  const defaults = createDefaultMatrix();
  writeMatrix(defaults);
  return defaults;
}

export function writeMatrix(matrix: PermissionMatrix): PermissionMatrix {
  const next = cloneMatrix(matrix);
  mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  writeFileSync(DATA_FILE, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
