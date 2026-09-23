import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCsv, rankCareerOptions, rankLearningActivities } from "../recommendations.mjs";

const asOfDate = "2026-10-01";
const employee = {
  employee_id: "E-1",
  role: "Backend Engineer",
  grade: "Junior",
  career_goal: { target_role: "Backend Engineer", target_grade: "Middle" },
  last_review_date: "2026-09-01",
  skills: { SK_CORE: 1, SK_API: 0, SK_TEAM: 0, SK_UNUSED: 0 }
};
const roleProfiles = [
  { role: "Backend Engineer", grade: "Junior", required_skills: { SK_CORE: 1 }, critical_skills: ["SK_CORE"] },
  { role: "Backend Engineer", grade: "Middle", required_skills: { SK_CORE: 2, SK_API: 2, SK_TEAM: 1 }, critical_skills: ["SK_CORE", "SK_API"] },
  { role: "Data Analyst", grade: "Junior", required_skills: { SK_API: 1, SK_TEAM: 1 }, critical_skills: ["SK_API"] },
  { role: "QA Engineer", grade: "Junior", required_skills: { SK_TEAM: 1 }, critical_skills: [] }
];
const event = (id, changes, options = {}) => ({
  event_id: id,
  title: id,
  mandatory: false,
  type: "course",
  format: "online",
  duration_hours: 4,
  target_roles: ["Backend Engineer"],
  target_grades: ["Junior"],
  prerequisites: {},
  develops_skills: changes.map(([skill_id, gain = 1, max_level = 5]) => ({ skill_id, gain, max_level })),
  upcoming_sessions: ["2026-11-01"],
  ...options
});
const history = [];

function getResults(events, employeeOverride = employee, historyOverride = history) {
  return rankLearningActivities({
    employee: employeeOverride,
    events,
    roleProfiles,
    skills: [
      { skill_id: "SK_CORE", name: "Core" },
      { skill_id: "SK_API", name: "API Design" },
      { skill_id: "SK_TEAM", name: "Teamwork" },
      { skill_id: "SK_UNUSED", name: "Unused" }
    ],
    history: historyOverride,
    asOfDate
  });
}

test("ranks critical target skill improvement ahead of unrelated low-level skills", () => {
  const results = getResults([
    event("EV_IRRELEVANT", [["SK_UNUSED"]], { duration_hours: 1 }),
    event("EV_BROAD", [["SK_API"], ["SK_TEAM"]], { duration_hours: 4 }),
    event("EV_CRITICAL", [["SK_CORE"], ["SK_API"]], { duration_hours: 16 })
  ]);

  assert.equal(results.recommendations[0].event.event_id, "EV_CRITICAL");
  assert.deepEqual(results.recommendations[0].improvements.map(item => item.skill_id), ["SK_CORE", "SK_API"]);
  assert.ok(results.recommendations.every(item => item.event.event_id !== "EV_IRRELEVANT"));
});

test("filters wrong audience, mandatory, unmet prerequisites, expired sessions, and completed events", () => {
  const completed = [
    { employee_id: "E-1", event_id: "EV_COMPLETED", status: "completed", date: "2026-09-01" }
  ];
  const results = getResults([
    event("EV_OK", [["SK_CORE"]]),
    event("EV_WRONG_ROLE", [["SK_CORE"]], { target_roles: ["Sales Manager"] }),
    event("EV_WRONG_GRADE", [["SK_CORE"]], { target_grades: ["Senior"] }),
    event("EV_MANDATORY", [["SK_CORE"]], { mandatory: true }),
    event("EV_PREREQUISITE", [["SK_CORE"]], { prerequisites: { SK_API: 1 } }),
    event("EV_EXPIRED", [["SK_CORE"]], { upcoming_sessions: ["2026-09-30"] }),
    event("EV_COMPLETED", [["SK_CORE"]])
  ], employee, completed);

  assert.deepEqual(results.recommendations.map(item => item.event.event_id), ["EV_OK"]);
});

test("allows a self-paced event without scheduled sessions", () => {
  const results = getResults([event("EV_SELF", [["SK_CORE"]], { format: "self_paced", upcoming_sessions: [] })]);
  assert.equal(results.recommendations.length, 1);
  assert.equal(results.recommendations[0].nextSession, null);
});

test("replays completed post-review activity gains before checking gaps and prerequisites", () => {
  const employeeWithGap = { ...employee, skills: { SK_CORE: 1, SK_API: 0, SK_TEAM: 0 }, last_review_date: "2026-09-01" };
  const training = event("EV_TRAINING", [["SK_API", 1, 3]]);
  const results = getResults([
    event("EV_NEEDS_API", [["SK_CORE"]], { prerequisites: { SK_API: 1 } }),
    training
  ], employeeWithGap, [
    { employee_id: "E-1", event_id: "EV_TRAINING", status: "completed", date: "2026-09-15" }
  ]);

  assert.deepEqual(results.recommendations.map(item => item.event.event_id), ["EV_NEEDS_API"]);
  assert.equal(results.effectiveSkills.SK_API, 1);
});

test("allows the explicitly recurring speaking club after prior completion", () => {
  const results = getResults([
    event("EV_036", [["SK_TEAM"]], { target_roles: ["Backend Engineer"] })
  ], employee, [
    { employee_id: "E-1", event_id: "EV_036", status: "completed", date: "2026-08-01" }
  ]);
  assert.equal(results.recommendations[0].event.event_id, "EV_036");
});

test("suggests lateral roles from matching grade profiles and labels vacancies unknown", () => {
  const results = rankCareerOptions({ employee, roleProfiles, skills: [
    { skill_id: "SK_CORE", name: "Core" },
    { skill_id: "SK_API", name: "API Design" },
    { skill_id: "SK_TEAM", name: "Teamwork" }
  ] });

  assert.ok(results.length > 0);
  assert.ok(results.some(item => item.pathType === "lateral" && item.grade === "Junior" && item.role !== employee.role));
  assert.ok(results.some(item => item.pathType === "upward" && item.role === employee.role && item.grade === "Middle"));
  assert.ok(results.every(item => item.openingStatus === "unknown"));
  assert.ok(results[0].readinessPercent >= results.at(-1).readinessPercent);
});



test("parses quoted CSV values, escaped quotes, and a UTF-8 BOM", () => {
  const parsed = parseCsv('\uFEFFid,note\r\n1,"career, path"\r\n2,"said ""grow"""\r\n');
  assert.deepEqual(parsed, [
    { id: "1", note: "career, path" },
    { id: "2", note: 'said "grow"' }
  ]);
});

test("keeps every recommendation valid across the complete supplied dataset", t => {
  const dataPath = relative => fileURLToPath(new URL(`../data/career_quest/${relative}`, import.meta.url));
  const employees = JSON.parse(readFileSync(dataPath("employees.json"), "utf8")).employees;
  const roleProfiles = JSON.parse(readFileSync(dataPath("skills.json"), "utf8")).role_profiles;
  const skills = JSON.parse(readFileSync(dataPath("skills.json"), "utf8")).skills;
  const events = JSON.parse(readFileSync(dataPath("events.json"), "utf8")).events;
  const history = parseCsv(readFileSync(dataPath("activity_history.csv"), "utf8"));
  const asOfDate = "2026-10-01";
  assert.equal(employees.length, 200);
  assert.equal(roleProfiles.length, 32);
  assert.equal(skills.length, 60);
  assert.equal(events.length, 40);
  assert.equal(history.length, 2743);

  let goalCount = 0;
  let coveredCount = 0;
  let recommendationCount = 0;
  for (const person of employees) {
    const result = rankLearningActivities({ employee: person, roleProfiles, skills, events, history, asOfDate });
    assert.ok(result.recommendations.length <= 3);
    if (!person.career_goal) {
      assert.equal(result.status, "career_goal_missing");
      assert.equal(result.recommendations.length, 0);
      continue;
    }
    goalCount += 1;
    if (result.recommendations.length) coveredCount += 1;
    recommendationCount += result.recommendations.length;
    const personHistory = history.filter(row => row.employee_id === person.employee_id);
    for (const recommendation of result.recommendations) {
      const item = recommendation.event;
      assert.equal(item.mandatory, false);
      assert.ok(item.target_roles.includes(person.role));
      assert.ok(item.target_grades.includes(person.grade));
      assert.ok(!personHistory.some(row => row.event_id === item.event_id
        && row.status === "completed" && item.event_id !== "EV_036"));
      assert.ok(Object.entries(item.prerequisites ?? {}).every(([id, min]) => result.effectiveSkills[id] >= min));
      assert.ok(recommendation.improvements.length > 0);
      assert.ok(recommendation.improvements.every(change =>
        result.targetProfile.required_skills[change.skill_id] >= change.afterEvent
        && change.gain > 0));
      assert.ok(recommendation.nextSession === null || recommendation.nextSession >= asOfDate);
    }
  }
  assert.ok(goalCount > 0);
  assert.ok(coveredCount > 0);
  t.diagnostic(`${coveredCount}/${goalCount} employees with goals have at least one eligible recommendation; ${recommendationCount} verified recommendations across the dataset.`);
});


test("uses the latest enrollment state for recurring events", () => {
  const results = getResults([
    event("EV_036", [["SK_TEAM"]], { upcoming_sessions: ["2026-11-01", "2026-12-01"] })
  ], { ...employee, last_review_date: "2026-09-20" }, [
    { employee_id: "E-1", event_id: "EV_036", status: "in_progress", date: "2026-08-01" },
    { employee_id: "E-1", event_id: "EV_036", status: "completed", date: "2026-09-15" }
  ]);
  assert.equal(results.recommendations[0].event.event_id, "EV_036");
  assert.equal(results.recommendations[0].nextSession, "2026-11-01");
});

test("skips the session date already recorded in an attendance history", () => {
  const results = getResults([
    event("EV_SESSIONS", [["SK_TEAM"]], { upcoming_sessions: ["2026-11-01", "2026-12-01"] })
  ], employee, [
    { employee_id: "E-1", event_id: "EV_SESSIONS", status: "no_show", date: "2026-11-01" }
  ]);
  assert.equal(results.recommendations[0].nextSession, "2026-12-01");
});


test("does not invent an employee career goal", () => {
  const result = getResults([event("EV_OK", [["SK_CORE"]])], { ...employee, career_goal: null });
  assert.equal(result.status, "career_goal_missing");
  assert.equal(result.targetProfile, null);
  assert.equal(result.recommendations.length, 0);
});

test("post-review course caps never lower an already higher assessed skill", () => {
  const person = { ...employee, skills: { ...employee.skills, SK_API: 2 } };
  const cappedCourse = event("EV_CAP", [["SK_API", 1, 1]]);
  const result = getResults([cappedCourse], person, [
    { employee_id: "E-1", event_id: "EV_CAP", status: "completed", date: "2026-09-15" }
  ]);
  assert.equal(result.effectiveSkills.SK_API, 2);
});

test("reports exact rejection stages, reasons and evidence without hiding eligible candidates", () => {
  const result = getResults([
    event("EV_GOOD", [["SK_CORE"]]),
    event("EV_MANDATORY", [["SK_CORE"]], { mandatory: true }),
    event("EV_OTHER_ROLE", [["SK_CORE"]], { target_roles: ["QA Engineer"] }),
    event("EV_PREREQ", [["SK_CORE"]], { prerequisites: { SK_API: 1 } }),
    event("EV_NO_SESSION", [["SK_CORE"]], { upcoming_sessions: [] }),
    event("EV_NOT_RELEVANT", [["SK_UNUSED"]])
  ]);
  assert.equal(result.diagnostics.initialCount, 6);
  assert.equal(result.diagnostics.eligibleCount, 1);
  assert.equal(result.diagnostics.stages.reduce((sum, stage) => sum + stage.rejected, 0), 5);
  assert.equal(result.diagnostics.stages.at(-1).remaining, 1);
  assert.deepEqual(result.diagnostics.rejectedEvents.find(item => item.eventId === "EV_PREREQ").missingPrerequisites,
    [{ skillId: "SK_API", current: 0, required: 1 }]);
  const evidence = result.recommendations[0].evidence;
  assert.ok(evidence.references.includes("events.json#EV_GOOD"));
  assert.ok(evidence.references.includes("employees.json#E-1"));
  assert.ok(evidence.eligibility.length >= 3);
  assert.ok(evidence.ranking.length >= 2);
});

test("keeps assessed progress separate from simulated post-review learning gains", () => {
  const result = getResults([event("EV_LEARNED", [["SK_API", 2]])], employee, [
    { record_id: "R1", employee_id: "E-1", event_id: "EV_LEARNED", status: "completed", date: "2026-09-15" }
  ]);
  assert.equal(result.assessedSkills.SK_API, 0);
  assert.equal(result.effectiveSkills.SK_API, 2);
  assert.equal(result.assessedProgress.earned, 1);
  assert.equal(result.progress.earned, 3);
  assert.equal(employee.skills.SK_API, 0);
});

test("distinguishes satisfied requirements from unavailable courses", () => {
  const result = getResults([], { ...employee, skills: { SK_CORE: 2, SK_API: 2, SK_TEAM: 1 } });
  assert.equal(result.status, "requirements_met");
  assert.deepEqual(result.skillGaps, []);
  assert.equal(result.progress.percent, 100);
});

test("a career target does not grant eligibility for an event restricted to that other role", () => {
  const result = getResults([event("EV_QA_ONLY", [["SK_TEAM"]], { target_roles: ["QA Engineer"] })],
    { ...employee, career_goal: { target_role: "QA Engineer", target_grade: "Junior" } });
  assert.equal(result.recommendations.length, 0);
  assert.equal(result.diagnostics.rejectedEvents[0].code, "role_mismatch");
});

test("suggests a real eligible prerequisite step only when it can satisfy all missing requirements", () => {
  const result = getResults([
    event("EV_GOAL", [["SK_CORE"]], { prerequisites: { SK_UNUSED: 2 } }),
    event("EV_FOUNDATION", [["SK_UNUSED", 2]]),
    event("EV_INSUFFICIENT", [["SK_UNUSED", 1]]),
    event("EV_UNAVAILABLE", [["SK_UNUSED", 2]], { upcoming_sessions: [] })
  ]);
  assert.equal(result.recommendations.length, 0);
  assert.deepEqual(result.prerequisiteSteps.map(item => item.event.event_id), ["EV_FOUNDATION"]);
  assert.equal(result.prerequisiteSteps[0].unlocks[0].eventId, "EV_GOAL");
  assert.equal(result.prerequisiteSteps[0].improvements[0].requirement, 2);
  assert.ok(result.prerequisiteSteps[0].evidence.references.includes("events.json#EV_GOAL"));
});

test("uses repeated missed participation to prefer an otherwise equivalent alternative", () => {
  const result = getResults([
    event("EV_A_MISSED", [["SK_CORE"]]),
    event("EV_B_ALTERNATIVE", [["SK_CORE"]], { type: "mentoring" })
  ], employee, [
    { record_id: "R1", employee_id: "E-1", event_id: "EV_A_MISSED", status: "no_show", date: "2026-08-01" },
    { record_id: "R2", employee_id: "E-1", event_id: "EV_A_MISSED", status: "no_show", date: "2026-09-01" }
  ]);
  assert.equal(result.recommendations[0].event.event_id, "EV_B_ALTERNATIVE");
  const missed = result.recommendations.find(item => item.event.event_id === "EV_A_MISSED");
  assert.equal(missed.factors.participationFriction, 2);
  assert.ok(missed.evidence.references.includes("activity_history.csv#R1"));
});


test("does not award future-dated completion gains at the dataset snapshot", () => {
  const result = getResults([event("EV_FUTURE", [["SK_API", 2]])], employee, [
    { record_id: "R-FUTURE", employee_id: "E-1", event_id: "EV_FUTURE", status: "completed", date: "2026-12-01" }
  ]);
  assert.equal(result.effectiveSkills.SK_API, 0);
  assert.equal(result.assessedProgress.earned, result.progress.earned);
});
