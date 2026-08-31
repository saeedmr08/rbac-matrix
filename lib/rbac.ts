/**
 * RBAC Matrix — pure policy engine (demo / educational).
 * Synthetic roles and actions only. No production identity binding.
 */

export const ROLES = [
  "Owner",
  "Admin",
  "Approver",
  "Member",
  "Auditor",
] as const;

export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  "create_request",
  "approve",
  "deny",
  "revoke",
  "view_audit",
  "export",
  "manage_members",
] as const;

export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  create_request: "Create request",
  approve: "Approve",
  deny: "Deny",
  revoke: "Revoke",
  view_audit: "View audit",
  export: "Export",
  manage_members: "Manage members",
};

/** Permission grant: role may perform action when true. */
export type PermissionMatrix = Record<Role, Record<Action, boolean>>;

export type DecisionEffect = "Allow" | "Deny";

export interface DecisionInput {
  actorId: string;
  role: Role;
  action: Action;
  /** When set, used for self-approval / self-action checks. */
  resourceOwnerId?: string;
}

export interface DecisionResult {
  effect: DecisionEffect;
  role: Role;
  action: Action;
  explanation: string;
  flags: string[];
}

export type ConflictSeverity = "info" | "warning" | "critical";

export interface PolicyConflict {
  id: string;
  severity: ConflictSeverity;
  title: string;
  detail: string;
  role?: Role;
  action?: Action;
}

export interface GeneratedTestCase {
  id: string;
  name: string;
  role: Role;
  action: Action;
  expect: DecisionEffect;
  /** Optional scenario hint for self-approval cases. */
  notes?: string;
}

export interface PolicyDocument {
  version: 1;
  name: string;
  generatedAt: string;
  roles: Role[];
  actions: Action[];
  matrix: PermissionMatrix;
  conflicts: PolicyConflict[];
}

/** Sensible demo defaults — not a production template. */
export function createDefaultMatrix(): PermissionMatrix {
  const empty = (): Record<Action, boolean> =>
    Object.fromEntries(ACTIONS.map((a) => [a, false])) as Record<
      Action,
      boolean
    >;

  const matrix = Object.fromEntries(
    ROLES.map((r) => [r, empty()])
  ) as PermissionMatrix;

  // Owner: full control
  for (const action of ACTIONS) {
    matrix.Owner[action] = true;
  }

  // Admin: operational control, no revoke of ownership-level by default still allowed here for demo
  matrix.Admin.create_request = true;
  matrix.Admin.approve = true;
  matrix.Admin.deny = true;
  matrix.Admin.revoke = true;
  matrix.Admin.view_audit = true;
  matrix.Admin.export = true;
  matrix.Admin.manage_members = true;

  // Approver: decision lane only
  matrix.Approver.approve = true;
  matrix.Approver.deny = true;
  matrix.Approver.view_audit = true;

  // Member: request + read-ish
  matrix.Member.create_request = true;
  matrix.Member.view_audit = false;

  // Auditor: observe + export
  matrix.Auditor.view_audit = true;
  matrix.Auditor.export = true;

  return matrix;
}

export function cloneMatrix(matrix: PermissionMatrix): PermissionMatrix {
  const next = createDefaultMatrix();
  for (const role of ROLES) {
    for (const action of ACTIONS) {
      next[role][action] = matrix[role][action];
    }
  }
  return next;
}

export function setPermission(
  matrix: PermissionMatrix,
  role: Role,
  action: Action,
  allowed: boolean
): PermissionMatrix {
  const next = cloneMatrix(matrix);
  next[role][action] = allowed;
  return next;
}

export function isAllowed(
  matrix: PermissionMatrix,
  role: Role,
  action: Action
): boolean {
  return Boolean(matrix[role]?.[action]);
}

/**
 * Evaluate a single authorization decision against the matrix.
 * Self-approval: if actor owns the resource and role has approve, flag and Deny
 * when `denySelfApproval` is true (default).
 */
export function evaluateDecision(
  matrix: PermissionMatrix,
  input: DecisionInput,
  options: { denySelfApproval?: boolean } = {}
): DecisionResult {
  const denySelfApproval = options.denySelfApproval ?? true;
  const flags: string[] = [];
  const granted = isAllowed(matrix, input.role, input.action);

  const isSelf =
    Boolean(input.resourceOwnerId) &&
    input.resourceOwnerId === input.actorId;

  if (isSelf && input.action === "approve") {
    flags.push("self-approval possible");
  }

  if (isSelf && (input.action === "deny" || input.action === "revoke")) {
    flags.push("self-action on own resource");
  }

  if (!granted) {
    return {
      effect: "Deny",
      role: input.role,
      action: input.action,
      explanation: `Role "${input.role}" does not have permission for "${ACTION_LABELS[input.action]}".`,
      flags,
    };
  }

  if (
    denySelfApproval &&
    isSelf &&
    (input.action === "approve" ||
      input.action === "deny" ||
      input.action === "revoke")
  ) {
    return {
      effect: "Deny",
      role: input.role,
      action: input.action,
      explanation: `Permission exists for "${input.role}" → "${ACTION_LABELS[input.action]}", but the actor owns the resource. Self-${input.action} is blocked by policy.`,
      flags,
    };
  }

  return {
    effect: "Allow",
    role: input.role,
    action: input.action,
    explanation: `Role "${input.role}" is granted "${ACTION_LABELS[input.action]}".`,
    flags,
  };
}

/**
 * Static analysis of the matrix for risky / inconsistent grants.
 * Member + approve is always flagged as "self-approval possible" conceptually
 * (requester equals actor in the common request workflow).
 */
export function detectConflicts(matrix: PermissionMatrix): PolicyConflict[] {
  const conflicts: PolicyConflict[] = [];

  if (matrix.Member.approve) {
    conflicts.push({
      id: "member-self-approval",
      severity: "critical",
      title: "Self-approval possible",
      detail:
        'Role "Member" can approve. In a typical request workflow the requester is a Member, so the same actor could approve their own request.',
      role: "Member",
      action: "approve",
    });
  }

  if (matrix.Member.deny) {
    conflicts.push({
      id: "member-self-deny",
      severity: "warning",
      title: "Member can deny",
      detail:
        'Role "Member" can deny decisions. Combined with create_request this may allow self-service rejection of peers\' or own workflow paths.',
      role: "Member",
      action: "deny",
    });
  }

  if (matrix.Member.revoke) {
    conflicts.push({
      id: "member-revoke",
      severity: "critical",
      title: "Member can revoke",
      detail:
        'Role "Member" can revoke. Revocation is usually reserved for Admin/Owner to prevent privilege churn.',
      role: "Member",
      action: "revoke",
    });
  }

  if (matrix.Member.manage_members) {
    conflicts.push({
      id: "member-manage-members",
      severity: "critical",
      title: "Member can manage members",
      detail:
        'Role "Member" can manage members — a privilege escalation path to Admin-equivalent control.',
      role: "Member",
      action: "manage_members",
    });
  }

  if (matrix.Auditor.approve || matrix.Auditor.deny || matrix.Auditor.revoke) {
    const which = (
      ["approve", "deny", "revoke"] as Action[]
    ).filter((a) => matrix.Auditor[a]);
    conflicts.push({
      id: "auditor-mutation",
      severity: "warning",
      title: "Auditor has mutating permissions",
      detail: `Auditor should be read-only. Currently granted: ${which
        .map((a) => ACTION_LABELS[a])
        .join(", ")}.`,
      role: "Auditor",
    });
  }

  if (matrix.Auditor.manage_members) {
    conflicts.push({
      id: "auditor-manage-members",
      severity: "critical",
      title: "Auditor can manage members",
      detail:
        "Auditors with membership control can alter the population they are meant to observe independently.",
      role: "Auditor",
      action: "manage_members",
    });
  }

  if (!matrix.Owner.manage_members) {
    conflicts.push({
      id: "owner-no-members",
      severity: "info",
      title: "Owner cannot manage members",
      detail:
        "Unusual: Owner lacks manage_members. Ensure at least one role retains membership control.",
      role: "Owner",
      action: "manage_members",
    });
  }

  const someoneManages = ROLES.some((r) => matrix[r].manage_members);
  if (!someoneManages) {
    conflicts.push({
      id: "no-member-manager",
      severity: "critical",
      title: "No role can manage members",
      detail:
        "The matrix has no grant for manage_members. Membership changes would be impossible.",
    });
  }

  const someoneAudits = ROLES.some((r) => matrix[r].view_audit);
  if (!someoneAudits) {
    conflicts.push({
      id: "no-audit-viewer",
      severity: "warning",
      title: "No role can view audit",
      detail: "Audit trail is opaque to every role — compliance blind spot.",
    });
  }

  if (matrix.Approver.approve && !matrix.Approver.deny) {
    conflicts.push({
      id: "approver-approve-only",
      severity: "info",
      title: "Approver can approve but not deny",
      detail:
        "Asymmetric decision lane: Approver may only approve. Confirm this matches the intended workflow.",
      role: "Approver",
    });
  }

  if (matrix.Admin.export && !matrix.Admin.view_audit) {
    conflicts.push({
      id: "admin-export-without-audit",
      severity: "info",
      title: "Admin can export without view audit",
      detail:
        "Export without audit visibility can hide what left the system.",
      role: "Admin",
    });
  }

  return conflicts;
}

/** Flatten matrix into positive/negative decision test cases. */
export function generateTestCases(
  matrix: PermissionMatrix
): GeneratedTestCase[] {
  const cases: GeneratedTestCase[] = [];
  let n = 0;

  for (const role of ROLES) {
    for (const action of ACTIONS) {
      n += 1;
      const allowed = isAllowed(matrix, role, action);
      cases.push({
        id: `tc-${String(n).padStart(3, "0")}`,
        name: `${role} ${allowed ? "may" : "may not"} ${ACTION_LABELS[action]}`,
        role,
        action,
        expect: allowed ? "Allow" : "Deny",
      });
    }
  }

  // Extra scenario: Member self-approval when grant exists
  if (matrix.Member.approve) {
    cases.push({
      id: `tc-${String(n + 1).padStart(3, "0")}`,
      name: "Member self-approval must be blocked when actor owns resource",
      role: "Member",
      action: "approve",
      expect: "Deny",
      notes:
        "Evaluate with actorId === resourceOwnerId and denySelfApproval=true",
    });
  }

  return cases;
}

export function exportPolicy(
  matrix: PermissionMatrix,
  name = "demo-rbac-policy"
): PolicyDocument {
  return {
    version: 1,
    name,
    generatedAt: new Date().toISOString(),
    roles: [...ROLES],
    actions: [...ACTIONS],
    matrix: cloneMatrix(matrix),
    conflicts: detectConflicts(matrix),
  };
}

export function countGrants(matrix: PermissionMatrix): number {
  let count = 0;
  for (const role of ROLES) {
    for (const action of ACTIONS) {
      if (matrix[role][action]) count += 1;
    }
  }
  return count;
}

/** Demo actors for the preview console. */
export const DEMO_USERS: { id: string; name: string; role: Role }[] = [
  { id: "u-owner", name: "Nora Hale", role: "Owner" },
  { id: "u-admin", name: "Chris Okonkwo", role: "Admin" },
  { id: "u-approver", name: "Sam Rivera", role: "Approver" },
  { id: "u-member", name: "Alex Kim", role: "Member" },
  { id: "u-auditor", name: "Jordan Lee", role: "Auditor" },
];
