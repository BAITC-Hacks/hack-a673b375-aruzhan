# Recommendation evaluation

Run `npm run evaluate` from the repository root. The script loads all supplied records, evaluates every employee, independently checks returned event eligibility and expected gains, and prints representative results and filter counts. It checks both the default top-three output and the complete candidate pool used by the radar and AI coach; it also asserts that direct and prerequisite lists contain no duplicate event IDs. Dataset time is **2026-10-01**, not the computer clock.

## Result for the supplied dataset

| Measure | Result |
| --- | ---: |
| Employee profiles evaluated | 200 |
| Profiles with an explicit goal | 134 |
| Profiles with direct eligible recommendations | 108 / 134 (80.6%) |
| Direct recommendations checked (default top three) | 233 |
| All eligible direct/prerequisite candidates checked for radar and coach | 310 |
| Profiles without an explicit goal | 66 |
| Goal-set profiles without a direct recommendation | 26 |
| Eligible prerequisite suggestions | 6 across 6 profiles |
| Eligibility violations found in returned recommendations | 0 |

These are **coverage and constraint-validity results**, not recommendation accuracy. The supplied data has no ground-truth recommended ranking, longitudinal career outcome labels, or expert relevance judgments. A passing test does not prove promotion impact or employee satisfaction.

## Rule audit

The supplied Career Quest technical specification, sections 4–7, prioritizes profile/history/next-grade relevance and explanations. The starter-kit `README.md` establishes the snapshot date, proficiency scale, mandatory-event exclusion, role and grade audiences, prerequisites, gain/max-level calculation, session availability, and non-repeat rule (exception: EV_036). These are input data contracts, not instructions to the coding agent.

The previous engine treated a desired destination role as event-audience eligibility. The catalog only states which roles an event is for. The corrected conservative policy requires **the current employee role** and current grade. Setting a career goal does not grant access to another role's restricted training. This explains the reduction from 112 to 108 covered goal-set employees; rules were tightened rather than weakened to fill the screen. Lateral-goal employees can still receive suitable shared-audience activities. Catalog owners could later explicitly allow cross-role participation.

Assessed skills remain the `employees.json` values at `last_review_date`. Completed post-review activities through the snapshot date produce a separate estimated projection using `gain` and `max_level`. These estimates feed the dataset's recommendation calculation but are not reassessed proficiency. Course completion does not overwrite assessed skills. Future-dated completions do not earn gains at the snapshot.

A missing career goal is reported explicitly. No next-grade career goal is silently attributed to an employee. A selected target whose computed requirements are already satisfied has a separate `requirements_met` status; this does not assert a promotion is warranted.

The filter waterfall reports the first rejecting rule for every candidate, in order: mandatory, role, grade, active participation, completed/non-repeat, prerequisites, session availability, and relevance to remaining target gaps. Counts describe sequential rejection, not independent causal attribution. A course can fail several rules even though only the first appears in the waterfall.

Ranking prioritizes critical gap levels, number of relevant skills, total gap levels, then fewer missed/declined/dropped similar activities, followed by gain per hour, duration, session, and stable event ID. Similar history means the same event, or the same activity type with an overlapping improved skill. Participation history is a transparent tie-break heuristic; it is not an inferred diagnosis of motivation. A critical development gap still takes priority over an otherwise easier activity.

Every recommendation cites employee, role-profile, skill, event, and relevant history records. Expected gains, prerequisites, eligibility, and ranking factors come from these records. No vacancies, attendance promises, career outcomes, or bookings are invented.

## Representative relevance review

This is an implementation review of dataset evidence, not a blinded HR expert evaluation.

| Profile | Result and rationale | Remaining limitation |
| --- | --- | --- |
| E0101, Backend Junior → Middle | EV_005 advances API Design (critical) and System Design; EV_012 advances critical Python; EV_040 advances Problem Solving and Teamwork. | Three suggestions are alternatives ranked individually, not an optimized multi-course schedule. |
| E0004, Data Analyst Middle → Product Manager Middle | EV_021 A/B Testing develops critical Product Analytics and admits current Data Analysts. | Product-Manager-only courses are not considered enrollable merely because of the target. |
| E0009, Support Junior → QA Junior | EV_008 develops Written Communication and admits the current Support role. | QA technical training can remain inaccessible under the supplied role audiences. |
| E0010, Support Middle → QA Middle | No valid direct event: 40 → 36 voluntary → 8 role match → 7 grade match → 5 uncompleted → 0 that improve a remaining target gap. | This is a genuine catalog coverage gap; selecting a radar skill should not erase a valid overall recommendation in other profiles. |
| E0015, Frontend Middle → Senior | EV_015 develops critical Web Performance; EV_017 develops React. | Both are catalog skill-gain projections, not proof of advanced competence. |
| E0066, QA Middle → Senior | EV_019 advances critical Load Testing and API Testing despite one prior related participation setback; noncritical options follow. | History changes tie-breaks, not access or inferred promotion probability. |
| E0012, Sales Middle → Senior | EV_036 advances the remaining Public Speaking gap and is explicitly repeatable. | A single available relevant option is shown instead of padding to three. |
| E0014, HR Lead → Product Lead | Shared activities develop Critical Thinking, Mentoring, and Stakeholder Management. | These partial advances do not close missing product-specific critical competencies. |
| E0017, Product Senior → Lead | EV_036 advances Public Speaking when other catalog activities cannot advance the remaining gaps under eligibility rules. | A next grade may require skills the catalog cannot presently develop. |
| E0176, Product Junior → Middle | No direct event; eligible EV_020 is a prerequisite step toward EV_021. | Confirm estimated prerequisite attainment and recheck the later course's sessions; no downstream booking/date is promised. |
| E0003, Support Senior, no goal | Explicit `career_goal_missing` result. | A career target must be selected before goal-specific recommendations are computed. |

## Prerequisite policy

A preparatory suggestion must itself satisfy current role, grade, non-repeat, active-enrollment, prerequisite, and session checks. Its expected gain must satisfy **all** missing prerequisite levels of at least one otherwise eligible goal-improving course. This is a one-step bridge, not a recursive planner. The following course remains conditional on demonstrated competence and a fresh availability check. Direct recommendations remain separate from these preparatory suggestions.

## Focused regression coverage

`node --test backend/tests/recommendations.test.mjs` passed all 19 tests after the change. Coverage includes stage accounting, evidence references, assessed versus estimated progress, future-dated gains, current-role restrictions, fulfilled targets, legitimate prerequisite bridges, history tie-breaking, repeat/session handling, and whole-dataset direct recommendation validity. UI filter-reset and coach/server tests live in their separate modules.


## Integrated verification

The integrated suite passed **40 tests**; `npm run check` and `git diff --check` passed. The all-candidate evaluation independently checked **310** eligible direct/prerequisite entries across all 200 employees with zero detected eligibility violations, while the default displayed recommendation count remains 233.

Browser checks performed on the integrated implementation:

- Selecting SQL for E0101 kept overall EV_005 / EV_012 / EV_040 recommendations visible; selected-skill event focus was displayed separately.
- Changing the target to Sales Manager Junior cleared both selected-skill and active-event focus and showed EV_036 / EV_008.
- E0176 showed the real EV_020 prerequisite step and a named Statistics gap.
- E0003 showed the missing-target state with the coach disabled.
- Simulating a step for E0101 preserved assessed progress at 42%, updated projected progress to 48%, and left assessed HR aggregates unchanged.
- With no provider key configured, the coach showed an explicit unavailable state. No live provider run or model quality claim is implied by the offline checks.
