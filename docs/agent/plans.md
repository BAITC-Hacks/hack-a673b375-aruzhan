# Planning and handoff

Use for work with several dependent milestones, significant design uncertainty, or a likely session handoff. Skip it for small bounded edits.
This is a repository convention, not a special file Codex automatically executes.

Create a task-specific Markdown plan under docs/plans/ only when needed. Keep it sufficient for another session to continue without the chat history.

## Minimal plan

1. Outcome: user-visible behavior and explicit acceptance evidence.
2. Scope: files or components involved, constraints, and excluded work.
3. Facts and unknowns: inspected files, required inputs, and decisions still missing.
4. Milestones: a short sequence, each with a check and expected result.
5. Progress: completed work, relevant check results, failures, and remaining work.
6. Decisions: material choice, reason, and evidence; update when new facts change it.
7. Resume point: exact next step and any concrete blocker.

Update at meaningful milestones or before handoff, not after every command. Link to durable evidence; do not paste full logs or secrets.
Mark proposed commands separately from executed commands. A completed plan requires evidence for its acceptance criteria.

## Context and delegation

Read the plan and relevant code to resume; do not rely on conversation memory alone. Recheck facts made stale by new changes.
When delegation is authorized, assign non-overlapping scopes, expected outputs, and integration ownership. The main agent remains responsible for the result.
Use an isolated checkout when concurrent edits require it; do not create parallel work solely to fill available agent slots.
