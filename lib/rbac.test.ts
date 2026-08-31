import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  ROLES,
  cloneMatrix,
  countGrants,
  createDefaultMatrix,
  detectConflicts,
  evaluateDecision,
  exportPolicy,
  generateTestCases,
  isAllowed,
  setPermission,
} from "./rbac";

describe("createDefaultMatrix", () => {
  it("covers every role and action cell", () => {
    const matrix = createDefaultMatrix();
    for (const role of ROLES) {
      for (const action of ACTIONS) {
        expect(typeof matrix[role][action]).toBe("boolean");
      }
    }
  });

  it("gives Owner full grants", () => {
    const matrix = createDefaultMatrix();
    for (const action of ACTIONS) {
      expect(matrix.Owner[action]).toBe(true);
    }
  });

  it("keeps Member without approve by default", () => {
    expect(createDefaultMatrix().Member.approve).toBe(false);
  });

  it("keeps Auditor read-oriented", () => {
    const m = createDefaultMatrix();
    expect(m.Auditor.view_audit).toBe(true);
    expect(m.Auditor.export).toBe(true);
    expect(m.Auditor.approve).toBe(false);
    expect(m.Auditor.manage_members).toBe(false);
  });
});

describe("setPermission / isAllowed / cloneMatrix", () => {
  it("toggles a cell immutably", () => {
    const base = createDefaultMatrix();
    const next = setPermission(base, "Member", "approve", true);
    expect(base.Member.approve).toBe(false);
    expect(next.Member.approve).toBe(true);
    expect(isAllowed(next, "Member", "approve")).toBe(true);
  });

  it("cloneMatrix deep-copies grants", () => {
    const a = createDefaultMatrix();
    const b = cloneMatrix(a);
    b.Member.export = true;
    expect(a.Member.export).toBe(false);
  });
});

describe("evaluateDecision", () => {
  it("allows Admin approve when granted", () => {
    const matrix = createDefaultMatrix();
    const result = evaluateDecision(matrix, {
      actorId: "u-admin",
      role: "Admin",
      action: "approve",
      resourceOwnerId: "u-other",
    });
    expect(result.effect).toBe("Allow");
    expect(result.flags).toEqual([]);
  });

  it("denies when role lacks permission", () => {
    const matrix = createDefaultMatrix();
    const result = evaluateDecision(matrix, {
      actorId: "u-member",
      role: "Member",
      action: "approve",
    });
    expect(result.effect).toBe("Deny");
    expect(result.explanation).toMatch(/does not have permission/i);
  });

  it("flags and denies self-approval when actor owns resource", () => {
    const matrix = setPermission(createDefaultMatrix(), "Member", "approve", true);
    const result = evaluateDecision(matrix, {
      actorId: "u-member",
      role: "Member",
      action: "approve",
      resourceOwnerId: "u-member",
    });
    expect(result.effect).toBe("Deny");
    expect(result.flags).toContain("self-approval possible");
    expect(result.explanation).toMatch(/Self-approve is blocked/i);
  });

  it("allows approve on another user's resource when granted", () => {
    const matrix = setPermission(createDefaultMatrix(), "Member", "approve", true);
    const result = evaluateDecision(matrix, {
      actorId: "u-member",
      role: "Member",
      action: "approve",
      resourceOwnerId: "u-other",
    });
    expect(result.effect).toBe("Allow");
    expect(result.flags).not.toContain("self-approval possible");
  });

  it("can allow self-approval when denySelfApproval is false", () => {
    const matrix = setPermission(createDefaultMatrix(), "Member", "approve", true);
    const result = evaluateDecision(
      matrix,
      {
        actorId: "u-member",
        role: "Member",
        action: "approve",
        resourceOwnerId: "u-member",
      },
      { denySelfApproval: false }
    );
    expect(result.effect).toBe("Allow");
    expect(result.flags).toContain("self-approval possible");
  });
});

describe("detectConflicts", () => {
  it("flags Member approve as self-approval possible", () => {
    const matrix = setPermission(createDefaultMatrix(), "Member", "approve", true);
    const conflicts = detectConflicts(matrix);
    const hit = conflicts.find((c) => c.id === "member-self-approval");
    expect(hit).toBeDefined();
    expect(hit?.severity).toBe("critical");
    expect(hit?.title).toMatch(/Self-approval possible/i);
  });

  it("has no member-self-approval on the default matrix", () => {
    const conflicts = detectConflicts(createDefaultMatrix());
    expect(conflicts.find((c) => c.id === "member-self-approval")).toBeUndefined();
  });

  it("flags Auditor mutating grants", () => {
    const matrix = setPermission(createDefaultMatrix(), "Auditor", "approve", true);
    const conflicts = detectConflicts(matrix);
    expect(conflicts.some((c) => c.id === "auditor-mutation")).toBe(true);
  });

  it("flags empty manage_members surface", () => {
    let matrix = createDefaultMatrix();
    for (const role of ROLES) {
      matrix = setPermission(matrix, role, "manage_members", false);
    }
    const conflicts = detectConflicts(matrix);
    expect(conflicts.some((c) => c.id === "no-member-manager")).toBe(true);
  });
});

describe("generateTestCases", () => {
  it("emits one case per role×action plus optional self-approval case", () => {
    const base = createDefaultMatrix();
    const baseCases = generateTestCases(base);
    expect(baseCases).toHaveLength(ROLES.length * ACTIONS.length);

    const withApprove = setPermission(base, "Member", "approve", true);
    const extended = generateTestCases(withApprove);
    expect(extended).toHaveLength(ROLES.length * ACTIONS.length + 1);
    expect(extended.at(-1)?.expect).toBe("Deny");
  });

  it("expects Allow for Owner create_request", () => {
    const cases = generateTestCases(createDefaultMatrix());
    const hit = cases.find(
      (c) => c.role === "Owner" && c.action === "create_request"
    );
    expect(hit?.expect).toBe("Allow");
  });
});

describe("exportPolicy / countGrants", () => {
  it("exports versioned document with conflicts", () => {
    const matrix = createDefaultMatrix();
    const doc = exportPolicy(matrix, "unit-test-policy");
    expect(doc.version).toBe(1);
    expect(doc.name).toBe("unit-test-policy");
    expect(doc.roles).toEqual([...ROLES]);
    expect(doc.actions).toEqual([...ACTIONS]);
    expect(doc.matrix.Owner.approve).toBe(true);
    expect(Array.isArray(doc.conflicts)).toBe(true);
    expect(doc.generatedAt).toMatch(/^\d{4}-/);
  });

  it("counts grants on default matrix", () => {
    expect(countGrants(createDefaultMatrix())).toBeGreaterThan(10);
  });
});
