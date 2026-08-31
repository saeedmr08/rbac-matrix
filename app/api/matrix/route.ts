import { NextRequest, NextResponse } from "next/server";
import {
  ACTIONS,
  ROLES,
  type PermissionMatrix,
} from "@/lib/rbac";
import { readMatrix, writeMatrix } from "@/lib/store";

export const runtime = "nodejs";

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

/** GET /api/matrix — load persisted permission matrix. */
export async function GET() {
  const matrix = readMatrix();
  return NextResponse.json({ matrix });
}

/** PUT /api/matrix — replace and persist the matrix. */
export async function PUT(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON" },
      { status: 400 },
    );
  }

  const candidate =
    raw && typeof raw === "object" && "matrix" in (raw as object)
      ? (raw as { matrix: unknown }).matrix
      : raw;

  if (!isMatrix(candidate)) {
    return NextResponse.json(
      {
        error:
          "Body must be a full role×action boolean matrix (or { matrix: ... })",
      },
      { status: 400 },
    );
  }

  const matrix = writeMatrix(candidate);
  return NextResponse.json({ matrix, saved: true });
}
