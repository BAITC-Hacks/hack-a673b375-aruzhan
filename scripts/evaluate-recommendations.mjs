import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv, rankLearningActivities } from "../recommendations.mjs";

const data = name => new URL(`../data/career_quest/${name}`, import.meta.url);
const load = name => JSON.parse(readFileSync(data(name), "utf8"));
const employees = load("employees.json").employees;
const { skills, role_profiles: roleProfiles, meta } = load("skills.json");
const events = load("events.json").events;
const history = parseCsv(readFileSync(data("activity_history.csv"), "utf8"));
const eventById = new Map(events.map(event => [event.event_id, event]));
const results = employees.map(employee => ({ employee, result: rankLearningActivities({
  employee, events, skills, roleProfiles, history, asOfDate: meta.as_of_date
}) }));
const counts = {};
const byRole = {};
let verifiedRecommendations = 0;
let prerequisiteCount = 0;
let allEligibleCandidatesChecked = 0;

function validateActivity(employee, result, item) {
  const event = eventById.get(item.event.event_id);
  assert.ok(event, "Activity must exist in the supplied catalog");
  assert.equal(event.mandatory, false);
  assert.ok(event.target_roles.includes(employee.role));
  assert.ok(event.target_grades.includes(employee.grade));
  assert.ok(Object.entries(event.prerequisites).every(([skillId, minimum]) =>
    (result.effectiveSkills[skillId] ?? 0) >= minimum));
  const eventHistory = history.filter(record => record.employee_id === employee.employee_id && record.event_id === event.event_id);
  assert.ok(event.event_id === "EV_036" || !eventHistory.some(record => record.status === "completed"));
  const latest = eventHistory.slice().sort((a, b) => a.date.localeCompare(b.date) || a.record_id.localeCompare(b.record_id)).at(-1);
  assert.notEqual(latest?.status, "in_progress");
  assert.ok(event.format === "self_paced"
    ? item.nextSession === null
    : event.upcoming_sessions.includes(item.nextSession) && item.nextSession >= meta.as_of_date);
  assert.ok(item.evidence.references.includes(`events.json#${event.event_id}`));
  assert.ok(item.evidence.references.includes(`employees.json#${employee.employee_id}`));
  for (const improvement of item.improvements) {
    const development = event.develops_skills.find(skill => skill.skill_id === improvement.skill_id);
    const before = result.effectiveSkills[improvement.skill_id] ?? 0;
    const after = Math.max(before, Math.min(development.max_level, before + development.gain));
    assert.equal(improvement.afterEvent, after);
    assert.equal(improvement.gain, Math.min(improvement.requirement, after) - Math.min(improvement.requirement, before));
    assert.ok(improvement.gain > 0);
  }
}

function validatePrerequisite(employee, result, item) {
    assert.equal(item.requiresReassessment, true);
    assert.ok(item.unlocks.length > 0);
    for (const unlocked of item.unlocks) {
      const blocked = eventById.get(unlocked.eventId);
      assert.ok(blocked.develops_skills.some(development =>
        (result.effectiveSkills[development.skill_id] ?? 0) < (result.targetProfile.required_skills[development.skill_id] ?? 0)));
      for (const missing of unlocked.missingPrerequisites) {
        const change = item.event.develops_skills.find(development => development.skill_id === missing.skillId);
        const before = result.effectiveSkills[missing.skillId] ?? 0;
        assert.ok(change && Math.max(before, Math.min(change.max_level, before + change.gain)) >= missing.required);
      }
    }
}

for (const { employee, result } of results) {
  counts[result.status] = (counts[result.status] ?? 0) + 1;
  byRole[employee.role] ??= { total: 0, withGoal: 0, covered: 0, withPrerequisite: 0 };
  const group = byRole[employee.role];
  group.total += 1;
  if (employee.career_goal) group.withGoal += 1;
  if (result.recommendations.length) group.covered += 1;
  if (result.prerequisiteSteps.length) group.withPrerequisite += 1;
  assert.ok(result.recommendations.length <= 3);
  assert.deepEqual(result.assessedSkills, employee.skills);
  if (result.targetProfile) {
    assert.equal(result.diagnostics.initialCount - result.diagnostics.eligibleCount,
      result.diagnostics.stages.reduce((sum, stage) => sum + stage.rejected, 0));
    assert.equal(result.diagnostics.rejectedEvents.length,
      result.diagnostics.initialCount - result.diagnostics.eligibleCount);
    assert.ok(result.progress.earned >= result.assessedProgress.earned);
  }
  for (const item of result.recommendations) {
    validateActivity(employee, result, item);
    assert.ok(item.improvements.every(improvement =>
      result.targetProfile.required_skills[improvement.skill_id] === improvement.requirement));
    verifiedRecommendations += 1;
  }
  for (const item of result.prerequisiteSteps) {
    validateActivity(employee, result, item);
    validatePrerequisite(employee, result, item);
    prerequisiteCount += 1;
  }
  // The radar and coach can inspect candidates beyond the three displayed steps.
  const all = rankLearningActivities({
    employee, events, skills, roleProfiles, history,
    asOfDate: meta.as_of_date, limit: events.length
  });
  const allCandidates = [...all.recommendations, ...all.prerequisiteSteps];
  assert.equal(new Set(allCandidates.map(item => item.event.event_id)).size, allCandidates.length,
    "An event must not appear as both a direct and a prerequisite candidate");
  for (const item of allCandidates) {
    validateActivity(employee, all, item);
    if (item.kind === "prerequisite") validatePrerequisite(employee, all, item);
    else assert.ok(item.improvements.every(improvement =>
      all.targetProfile.required_skills[improvement.skill_id] === improvement.requirement));
    allEligibleCandidatesChecked += 1;
  }
}

const summarize = ({ employee, result }) => ({
  employeeId: employee.employee_id, role: employee.role, grade: employee.grade,
  goal: employee.career_goal, status: result.status,
  assessedProgress: result.assessedProgress?.percent ?? null,
  estimatedProgress: result.progress?.percent ?? null,
  recommendations: result.recommendations.map(item => ({
    id: item.event.event_id, title: item.event.title,
    improvements: item.improvements.map(skill => `${skill.name}: ${skill.current}->${skill.afterEvent}, target ${skill.requirement}, critical=${skill.critical}`),
    session: item.nextSession, participationFriction: item.factors.participationFriction
  })),
  prerequisites: result.prerequisiteSteps.map(item => ({ id: item.event.event_id, unlocks: item.unlocks.map(course => course.eventId) })),
  waterfall: result.diagnostics.stages.map(stage => `${stage.code}: ${stage.before}->${stage.remaining}`)
});
const chosen = new Set(["E0101"]);
for (const role of Object.keys(byRole)) {
  const example = results.find(item => item.employee.role === role && item.result.recommendations.length);
  if (example) chosen.add(example.employee.employee_id);
}
for (const status of ["career_goal_missing", "no_eligible_activities", "requirements_met"]) {
  const example = results.find(item => item.result.status === status);
  if (example) chosen.add(example.employee.employee_id);
}
const prerequisiteExample = results.find(item => item.result.prerequisiteSteps.length && !item.result.recommendations.length);
if (prerequisiteExample) chosen.add(prerequisiteExample.employee.employee_id);
console.log(JSON.stringify({
  asOfDate: meta.as_of_date, employees: employees.length,
  counts, byRole, verifiedRecommendations, prerequisiteCount, allEligibleCandidatesChecked,
  eligibilityViolations: 0,
  limitation: "Constraint checks and coverage are not measured recommendation accuracy; no ground-truth relevance or career outcome labels were supplied.",
  examples: results.filter(item => chosen.has(item.employee.employee_id)).map(summarize)
}, null, 2));
