import test from "node:test";
import assert from "node:assert/strict";
import { summarizeCompetencyGaps } from "../src/hr-summary.mjs";

const roleProfiles = [
  { role: "Developer", grade: "Middle", required_skills: { SK_CODE: 3, SK_TEAM: 2 } },
  { role: "Manager", grade: "Senior", required_skills: { SK_TEAM: 4, SK_PLAN: 3 } }
];
const skills = [
  { skill_id: "SK_CODE", name: "Coding" },
  { skill_id: "SK_TEAM", name: "Teamwork" }
];

test("aggregates assessed gaps across different targets with explicit employee denominators", () => {
  const employees = [
    { employee_id: "E1", career_goal: { target_role: "Developer", target_grade: "Middle" }, skills: { SK_CODE: 1, SK_TEAM: 1 }, effectiveSkills: { SK_CODE: 5, SK_TEAM: 5 } },
    { employee_id: "E2", career_goal: { target_role: "Developer", target_grade: "Middle" }, skills: { SK_CODE: 3, SK_TEAM: 2 } },
    { employee_id: "E3", career_goal: { target_role: "Manager", target_grade: "Senior" }, skills: { SK_TEAM: 2 }, estimatedSkills: { SK_TEAM: 5, SK_PLAN: 5 } },
    { employee_id: "E4", career_goal: null, skills: {} },
    { employee_id: "E5", career_goal: { target_role: "Unknown", target_grade: "Senior" }, skills: {} }
  ];
  const before = JSON.stringify(employees);
  assert.deepEqual(summarizeCompetencyGaps({ employees, roleProfiles, skills }), {
    employeeCount: 5,
    withTargetCount: 3,
    missingGoalCount: 1,
    missingTargetCount: 1,
    gaps: [
      { skillId: "SK_TEAM", name: "Teamwork", affectedCount: 2, requiredCount: 3, totalGapLevels: 3 },
      { skillId: "SK_PLAN", name: "SK_PLAN", affectedCount: 1, requiredCount: 1, totalGapLevels: 3 },
      { skillId: "SK_CODE", name: "Coding", affectedCount: 1, requiredCount: 2, totalGapLevels: 2 }
    ]
  });
  assert.equal(JSON.stringify(employees), before, "HR aggregation must not change employee assessments");
});

test("met targets produce no competency gap and never negative gap levels", () => {
  assert.deepEqual(summarizeCompetencyGaps({
    employees: [{ career_goal: { target_role: "Developer", target_grade: "Middle" }, skills: { SK_CODE: 5, SK_TEAM: 2 } }],
    roleProfiles,
    skills
  }), { employeeCount: 1, withTargetCount: 1, missingGoalCount: 0, missingTargetCount: 0, gaps: [] });
});

test("ties use skill IDs for stable results and missing assessed skills count as level zero", () => {
  const result = summarizeCompetencyGaps({
    employees: [{ career_goal: { target_role: "Developer", target_grade: "Middle" }, skills: {} }],
    roleProfiles: [{ role: "Developer", grade: "Middle", required_skills: { SK_Z: 2, SK_A: 2 } }],
    skills: []
  });
  assert.deepEqual(result.gaps.map(gap => gap.skillId), ["SK_A", "SK_Z"]);
  assert.equal(result.gaps[0].totalGapLevels, 2);
});
