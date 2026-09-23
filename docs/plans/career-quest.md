# Career Quest — four-hour build plan

## Outcome

Build a runnable employee-development MVP for the Halyk Career Quest case. An employee can inspect a profile, receive 1–3 recommendations grounded in grade requirements, skill gaps, event rules, and participation history, complete an activity, and see progress update. HR can inspect skill gaps across the dataset. A judge can import unseen profiles and history in the supplied format.

The differentiator is a visible, bounded agent that uses real tools to compare valid activities and explain its choice with verifiable data. The application, not the model, calculates eligibility and skill gains.

## Direction choices

1. **Recommended — Career Decision Agent.** One agent calls profile/history, eligible-event, and event-simulation tools; it compares candidates and returns evidence-backed recommendations. Best fit for the rubric's recommendation core and the request for agentic AI.
2. **Career Quest with richer gamification.** Add streaks, points, badges, and challenges. Attractive, but gamification is optional and it leaves less time for recommendation quality and judge profiles.
3. **HR development analyst.** Focus on skill-gap trends, inactivity, and program coverage. Useful secondary view, but weaker as the main story because the employee recommendation flow is the stated core.

Choose option 1. Keep HR analytics as a compact required screen. Defer rewards, chat, calendar integration, multi-agent orchestration, model training, and forecasting.

## Architecture decisions and constraints

- Inspect the event starter kit before choosing a framework or data adapter. This checkout currently has no application code or manifest. If no starter is supplied, choose the stack you can run most reliably in four hours; a simple server-rendered or Python app is preferable to introducing a complex stack.
- Preserve the supplied JSON/CSV schemas. Keep recommendation calculations as ordinary, deterministic domain functions over those files.
- Start with one model/provider and a small tool-calling loop. Use three read/compute tools: get_employee_context, find_eligible_events, and simulate_events. Validate tool inputs and outputs, cap the number of tool turns, and show tool activity in the interface.
- The agent proposes a choice and explanation. The server verifies event IDs and evidence against computed results before displaying it. Completing an activity is a user action.
- Read API credentials from server-side environment variables. Test the non-AI path with fixtures so provider failure does not erase the profile or progress flow. Probe provider tool support and latency before relying on it; a second model/provider is a stretch only.
- Store progress locally for the demo. Do not use real employee data, expose one employee's engagement history to other employees, or add public employee rankings.

## Task list

### Phase 0 — Fast project and data discovery (0:00–0:20)

- [ ] **Task 1: Inspect the starter kit and settle the run path.** Locate the issued kit, read its README and data schema, identify its existing stack, and run the smallest supplied example. If it is not available, choose a familiar stack and create the smallest runnable app.
  - Acceptance: exact run command, input schema, and available provider credentials are recorded; app opens or the missing dependency is stated clearly.
  - Verification: run the app or starter example once.
  - Dependencies: none.
  - Likely files: README, manifests/config, data files.
  - Scope: S.

### Phase 1 — A working employee journey (0:20–1:30)

- [ ] **Task 2: Load a profile and calculate its career gaps.** Parse the supplied schema and show one employee, current skills, next-grade requirements, and history.
  - Acceptance: select an employee; displayed gaps match a hand-calculated fixture.
  - Verification: compare one sample profile against the dataset.
  - Dependencies: Task 1.
  - Likely files: data adapter, domain calculation, employee view.
  - Scope: M.

- [ ] **Task 3: Rank eligible activities deterministically.** Filter by the actual event rules and score progress toward the next grade, expected skill gain, and relevant participation history. Exclude unsuitable events and explain the factors in the result.
  - Acceptance: returns up to three valid activities; does not blindly choose the lowest current skill; every displayed number traces to input data.
  - Verification: include the public-speaking/system-design counterexample from the brief.
  - Dependencies: Task 2.
  - Likely files: recommendation domain module and focused fixtures.
  - Scope: M.

- [ ] **Task 4: Add the agent tool loop.** Let one LLM call the profile, eligible-event, and simulation tools, then return a schema-validated recommendation with references to tool results.
  - Acceptance: demo shows real tool calls; server rejects unknown event IDs or unsupported claims; finite step/time limits stop runaway calls.
  - Verification: normal, missing-profile, provider-timeout, and invalid-event cases.
  - Dependencies: Task 3 and successful provider probe in Task 1.
  - Likely files: agent adapter, tool definitions, recommendation response UI.
  - Scope: M.

- [ ] **Task 5: Complete an activity and show updated progress.** On user confirmation, apply the dataset's gain and max-level rules, persist the result, and refresh the trajectory.
  - Acceptance: one click completes a valid event; progress updates once and respects the cap.
  - Verification: check before/after levels and duplicate-click behavior.
  - Dependencies: Task 2.
  - Likely files: progress service and employee view.
  - Scope: M.

### Checkpoint — Employee journey (target 1:30)

- [ ] A fresh start loads a supplied profile.
- [ ] Recommendation handles the counterexample and shows data-backed evidence.
- [ ] Completing an activity updates progress.
- [ ] Provider failure has a clear fallback/error state.

### Phase 2 — Judge-ready input and HR view (1:30–2:35)

- [ ] **Task 6: Support judge-provided profiles.** Add import using the exact starter-kit schema and keep imported records in the same calculation path as seed records.
  - Acceptance: unseen profile and history load without code edits; malformed input returns a useful error.
  - Verification: import one supplied-format test profile and one invalid fixture.
  - Dependencies: Task 1 and Task 2.
  - Likely files: import/validation module and upload/select UI.
  - Scope: M.

- [ ] **Task 7: Add the compact HR overview.** Calculate most-missing skills, activity participation, and employees with no recommendation from the same data.
  - Acceptance: metrics change when the loaded dataset changes and do not expose private individual history on the employee view.
  - Verification: compare counts to a tiny known fixture.
  - Dependencies: Task 1.
  - Likely files: aggregate calculations and HR view.
  - Scope: M.

### Checkpoint — Rubric coverage (target 2:35)

- [ ] Employee profile, recommendation, explanation, and progress work.
- [ ] Judge can load a new profile in the issued schema.
- [ ] HR sees required aggregate signals.
- [ ] No optional gamification feature has displaced a must-have.

### Phase 3 — Reproducibility and demo (2:35–4:00)

- [ ] **Task 8: Make a clean one-command demo.** Document setup, environment variables, data format, tool architecture, limitations, and run steps. Keep a synthetic fallback profile.
  - Acceptance: a fresh start follows README without private keys or undocumented manual setup.
  - Verification: follow the README from a clean terminal.
  - Dependencies: Tasks 1–7.
  - Likely files: README, example environment file, small setup fixes.
  - Scope: S/M.

- [ ] **Task 9: Rehearse the five-minute story.** Demo the tricky profile, show tool calls and why the top recommendation wins over the obvious lowest-skill choice, complete it, show progress, then import a judge profile and open HR.
  - Acceptance: the flow fits five minutes and works without editing source data live.
  - Verification: timed rehearsal; keep a short recorded backup only if event rules allow.
  - Dependencies: Tasks 4–8.
  - Likely files: README/demo notes and fixtures.
  - Scope: S.

## Parallel work

This is a solo four-hour build. Do not split coding across shared files or introduce multi-agent orchestration. After Task 1 defines the data schema, these are independent lanes if Codex can work while you handle a separate task:

- **Lane A — core:** Tasks 2–5 (profile, deterministic recommendation, agent, completion).
- **Lane B — separate files:** Task 7 (HR aggregates/view) can proceed against agreed fixture JSON and a fixed aggregate interface.
- **Lane C — separate files:** Task 8's README outline and Task 9's demo script can be drafted while the app is being built; fill in exact commands only after they have actually run.

Task 6 depends on the data schema and profile loader; do not start it before Task 1. Integrate each lane at the checkpoint. If parallel editing feels confusing, do Tasks 1–7 in order; a working complete flow beats unfinished concurrency.

## Suggested commit sequence

1. **Next code commit: feat: add runnable Career Quest foundation** — project manifest/start command, one profile loaded from the supplied schema, a simple employee screen, and README run instructions. Commit only after the app launches from the documented command.
2. feat: rank career activities with evidence — deterministic ranking and the adversarial counterexample.
3. feat: add career recommendation agent tools — bounded tool loop, validation, and visible trace.
4. feat: update skill progress on activity completion — verified event gain and persistence.
5. feat: support judge profiles and HR insights — import plus required aggregates.
6. docs: add reproducible hackathon demo — tested setup steps and five-minute demo path.

Keep each commit focused. Do not include the existing deletions of CLAUDE.md and GEMINI.md, or the untracked .agents/ and skills-lock.json, unless you independently decide those belong in a separate commit. Do not commit API keys.

## Risks and open questions

| Risk | Mitigation |
|---|---|
| Event kit/schema arrives late or differs from this PDF | Make Task 1 a strict 20-minute gate; adapt to the actual kit before building features. |
| Agent recommendation looks like a prompt over a hard-coded answer | Show real tool calls, dataset evidence, an adversarial profile, and recomputation after completion. |
| Provider/tool call fails or takes too long | Probe early; keep the deterministic path and a clear error/fallback. |
| Import or HR view consumes the remaining build time | Prioritize all employee must-haves first; use a compact table/summary for HR. |
| UI polish expands scope | Build one employee journey and one compact HR view; skip optional reward mechanics. |

## Resume point

The next action is Task 1: locate the event starter kit and inspect its README/schema. This repository has only project guidance right now, so do not guess the framework or invent final event field names yet.

