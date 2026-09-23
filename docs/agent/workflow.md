# Development workflow

Read when implementing, debugging, reviewing, or verifying a change.

## Scope and execute

- For substantive work, name the observable result and how to verify it. A small edit needs no separate planning document.
- Inspect affected code, callers, relevant instructions, and the working-tree diff. Preserve the user's unrelated work.
- Prefer existing patterns and dependencies. Keep the patch limited to the requested behavior.
- Use verified project commands from [project.md](project.md) or current manifests. An unknown command is a gap to resolve, not a reason to invent one.
- If a check fails, distinguish a regression from a pre-existing or environmental failure. Use new evidence to choose the next attempt; do not repeat an unchanged failed approach.

## Verify proportionately

| Change | Appropriate evidence |
| --- | --- |
| Instructions or documentation | Links resolve, facts match files, no conflicting requirements, compatibility copies agree |
| Behavior or bug fix | Focused regression check for observable behavior; affected integration checks |
| UI | Launch it, inspect the relevant flow, and verify the changed visual state when tools permit |
| Agent tools or provider behavior | Relevant cases in [runtime.md](runtime.md); separate offline checks from live API checks |

Run established required checks. Broaden or repeat checks when changed code, failures, or unresolved risk justify it; do not rerun passing checks on unchanged content just for ceremony.
Do not weaken assertions or disable checks to obtain a passing result. Tests should protect behavior, not restate implementation details.

## Finish and hand off

Review the final diff for scope and accidental secrets. Report what changed, commands actually run and their outcomes, and any unverified behavior.
For a blocker, identify what was tried, the missing condition, and what would unlock progress. Continue independent authorized work.
When interrupted during substantial work, save the resume point following [plans.md](plans.md). There is no mandatory reset after a fixed number of failures.
