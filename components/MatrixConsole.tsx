"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACTIONS,
  ACTION_LABELS,
  DEMO_USERS,
  ROLES,
  type Action,
  type DecisionResult,
  type PermissionMatrix,
  type Role,
  countGrants,
  createDefaultMatrix,
  detectConflicts,
  evaluateDecision,
  exportPolicy,
  generateTestCases,
  setPermission,
} from "@/lib/rbac";

type Panel = "matrix" | "preview" | "conflicts" | "tests" | "export";
type SaveState = "idle" | "loading" | "saving" | "saved" | "error";

export default function MatrixConsole() {
  const [matrix, setMatrix] = useState<PermissionMatrix>(() =>
    createDefaultMatrix()
  );
  const [panel, setPanel] = useState<Panel>("matrix");
  const [userId, setUserId] = useState(DEMO_USERS[3].id);
  const [overrideRole, setOverrideRole] = useState<Role | "">(DEMO_USERS[3].role);
  const [previewAction, setPreviewAction] = useState<Action>("approve");
  const [resourceOwnerId, setResourceOwnerId] = useState(DEMO_USERS[3].id);
  const [denySelfApproval, setDenySelfApproval] = useState(true);
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const hydrated = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/matrix");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { matrix: PermissionMatrix };
        if (!cancelled && data.matrix) {
          setMatrix(data.matrix);
        }
        if (!cancelled) setSaveState("idle");
      } catch {
        if (!cancelled) setSaveState("error");
      } finally {
        hydrated.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function persist(next: PermissionMatrix) {
    if (!hydrated.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/matrix", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matrix: next }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1200);
      } catch {
        setSaveState("error");
      }
    }, 250);
  }

  const conflicts = useMemo(() => detectConflicts(matrix), [matrix]);
  const tests = useMemo(() => generateTestCases(matrix), [matrix]);
  const grants = useMemo(() => countGrants(matrix), [matrix]);
  const policyJson = useMemo(
    () => JSON.stringify(exportPolicy(matrix), null, 2),
    [matrix]
  );

  const selectedUser =
    DEMO_USERS.find((u) => u.id === userId) ?? DEMO_USERS[0];
  const effectiveRole: Role = overrideRole || selectedUser.role;

  const decision: DecisionResult = useMemo(
    () =>
      evaluateDecision(
        matrix,
        {
          actorId: selectedUser.id,
          role: effectiveRole,
          action: previewAction,
          resourceOwnerId,
        },
        { denySelfApproval }
      ),
    [
      matrix,
      selectedUser.id,
      effectiveRole,
      previewAction,
      resourceOwnerId,
      denySelfApproval,
    ]
  );

  function toggle(role: Role, action: Action) {
    setMatrix((prev) => {
      const next = setPermission(prev, role, action, !prev[role][action]);
      persist(next);
      return next;
    });
  }

  function reset() {
    const next = createDefaultMatrix();
    setMatrix(next);
    persist(next);
  }

  async function copyPolicy() {
    try {
      await navigator.clipboard.writeText(policyJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function downloadPolicy() {
    const blob = new Blob([policyJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rbac-matrix-policy.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const criticalCount = conflicts.filter((c) => c.severity === "critical").length;

  const saveLabel =
    saveState === "loading"
      ? "Loading…"
      : saveState === "saving"
        ? "Saving…"
        : saveState === "saved"
          ? "Saved"
          : saveState === "error"
            ? "Save error"
            : "Synced";

  return (
    <div className="shell">
      <header className="masthead">
        <div className="masthead-brand">
          <p className="kicker">Operations · Authorization lab</p>
          <h1>RBAC Matrix</h1>
          <p className="lede">
            Design role × action grants, surface conflicts, preview decisions,
            and export a testable policy — synthetic demo roles only.
          </p>
        </div>
        <aside className="masthead-stats" aria-label="Matrix summary">
          <div className="stat">
            <span className="stat-label">Grants</span>
            <span className="stat-value">{grants}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Conflicts</span>
            <span className="stat-value">{conflicts.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Critical</span>
            <span className="stat-value warn">{criticalCount}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Test cases</span>
            <span className="stat-value">{tests.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Persist</span>
            <span className="stat-value">{saveLabel}</span>
          </div>
        </aside>
      </header>

      <nav className="rail" aria-label="Console panels">
        {(
          [
            ["matrix", "Matrix"],
            ["preview", "Preview"],
            ["conflicts", "Conflicts"],
            ["tests", "Test cases"],
            ["export", "Export"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={panel === id ? "rail-btn active" : "rail-btn"}
            onClick={() => setPanel(id)}
          >
            {label}
            {id === "conflicts" && conflicts.length > 0 ? (
              <span className="badge">{conflicts.length}</span>
            ) : null}
          </button>
        ))}
        <button type="button" className="rail-btn ghost" onClick={reset}>
          Reset defaults
        </button>
      </nav>

      <main className="stage">
        {panel === "matrix" && (
          <section className="panel" aria-labelledby="matrix-heading">
            <div className="panel-head">
              <h2 id="matrix-heading">Permission matrix</h2>
              <p>
                Click a cell to toggle Allow. Changes save to{" "}
                <code>data/rbac.json</code> via <code>PUT /api/matrix</code>.
              </p>
            </div>
            <div className="table-scroll">
              <table className="matrix">
                <thead>
                  <tr>
                    <th scope="col">Role</th>
                    {ACTIONS.map((action) => (
                      <th key={action} scope="col">
                        {ACTION_LABELS[action]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROLES.map((role) => (
                    <tr key={role} data-role={role}>
                      <th scope="row">{role}</th>
                      {ACTIONS.map((action) => {
                        const on = matrix[role][action];
                        const conflicted = conflicts.some(
                          (c) => c.role === role && c.action === action
                        );
                        return (
                          <td key={action}>
                            <button
                              type="button"
                              className={[
                                "cell",
                                on ? "on" : "off",
                                conflicted ? "conflicted" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              aria-pressed={on}
                              aria-label={`${role} ${ACTION_LABELS[action]}: ${
                                on ? "Allow" : "Deny"
                              }`}
                              onClick={() => toggle(role, action)}
                            >
                              {on ? "Allow" : "—"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {panel === "preview" && (
          <section className="panel" aria-labelledby="preview-heading">
            <div className="panel-head">
              <h2 id="preview-heading">Decision preview</h2>
              <p>
                Pick a demo user, optional role override, action, and resource
                owner to simulate Allow / Deny with an explanation.
              </p>
            </div>
            <div className="preview-grid">
              <label className="field">
                <span>User</span>
                <select
                  value={userId}
                  onChange={(e) => {
                    setUserId(e.target.value);
                    const u = DEMO_USERS.find((x) => x.id === e.target.value);
                    if (u) setOverrideRole(u.role);
                  }}
                >
                  {DEMO_USERS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {u.role}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Role (override)</span>
                <select
                  value={overrideRole}
                  onChange={(e) =>
                    setOverrideRole(e.target.value as Role | "")
                  }
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Action</span>
                <select
                  value={previewAction}
                  onChange={(e) =>
                    setPreviewAction(e.target.value as Action)
                  }
                >
                  {ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {ACTION_LABELS[a]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Resource owner</span>
                <select
                  value={resourceOwnerId}
                  onChange={(e) => setResourceOwnerId(e.target.value)}
                >
                  {DEMO_USERS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field check">
                <input
                  type="checkbox"
                  checked={denySelfApproval}
                  onChange={(e) => setDenySelfApproval(e.target.checked)}
                />
                <span>Block self-approve / self-deny / self-revoke</span>
              </label>
            </div>

            <div
              className={
                decision.effect === "Allow"
                  ? "verdict allow"
                  : "verdict deny"
              }
              role="status"
            >
              <p className="verdict-effect">{decision.effect}</p>
              <p className="verdict-meta">
                {selectedUser.name} as <strong>{decision.role}</strong> →{" "}
                {ACTION_LABELS[decision.action]}
              </p>
              <p className="verdict-explain">{decision.explanation}</p>
              {decision.flags.length > 0 ? (
                <ul className="flags">
                  {decision.flags.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        )}

        {panel === "conflicts" && (
          <section className="panel" aria-labelledby="conflicts-heading">
            <div className="panel-head">
              <h2 id="conflicts-heading">Conflict analysis</h2>
              <p>
                Static checks for risky grants — including Member + approve as
                conceptual self-approval.
              </p>
            </div>
            {conflicts.length === 0 ? (
              <p className="empty">No conflicts detected for the current matrix.</p>
            ) : (
              <ul className="conflict-list">
                {conflicts.map((c) => (
                  <li key={c.id} data-severity={c.severity}>
                    <div className="conflict-top">
                      <span className="sev">{c.severity}</span>
                      <strong>{c.title}</strong>
                    </div>
                    <p>{c.detail}</p>
                    {(c.role || c.action) && (
                      <p className="conflict-meta">
                        {c.role ? `Role: ${c.role}` : null}
                        {c.role && c.action ? " · " : null}
                        {c.action ? `Action: ${ACTION_LABELS[c.action]}` : null}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {panel === "tests" && (
          <section className="panel" aria-labelledby="tests-heading">
            <div className="panel-head">
              <h2 id="tests-heading">Generated test cases</h2>
              <p>
                One expectation per matrix cell, plus a self-approval scenario
                when Member can approve.
              </p>
            </div>
            <div className="table-scroll">
              <table className="cases">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>Expect</th>
                  </tr>
                </thead>
                <tbody>
                  {tests.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <code>{t.id}</code>
                      </td>
                      <td>
                        {t.name}
                        {t.notes ? (
                          <span className="note">{t.notes}</span>
                        ) : null}
                      </td>
                      <td>{t.role}</td>
                      <td>{ACTION_LABELS[t.action]}</td>
                      <td>
                        <span
                          className={
                            t.expect === "Allow" ? "tag allow" : "tag deny"
                          }
                        >
                          {t.expect}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {panel === "export" && (
          <section className="panel" aria-labelledby="export-heading">
            <div className="panel-head row">
              <div>
                <h2 id="export-heading">Export policy JSON</h2>
                <p>
                  Versioned document with matrix grants and current conflict
                  report.
                </p>
              </div>
              <div className="actions">
                <button type="button" className="btn" onClick={copyPolicy}>
                  {copied ? "Copied" : "Copy JSON"}
                </button>
                <button type="button" className="btn primary" onClick={downloadPolicy}>
                  Download
                </button>
              </div>
            </div>
            <pre className="codeblock" tabIndex={0}>
              {policyJson}
            </pre>
          </section>
        )}
      </main>

      <footer className="colophon">
        <span>Demo only · Synthetic roles · data/rbac.json</span>
        <span>Saeed Rumaneh · 2026</span>
      </footer>
    </div>
  );
}
