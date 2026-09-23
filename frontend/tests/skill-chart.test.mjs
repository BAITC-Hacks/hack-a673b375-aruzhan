import test from "node:test";
import assert from "node:assert/strict";
import { buildSkillChartData } from "../src/skill-chart.mjs";

const profile = {
  required_skills: { SK_CORE: 3, SK_TEAM: 2 },
  critical_skills: ["SK_CORE"]
};
const skills = [
  { skill_id: "SK_CORE", name: "Core" },
  { skill_id: "SK_TEAM", name: "Teamwork" }
];

test("builds chart values from actual and required skill levels", () => {
  assert.deepEqual(buildSkillChartData({
    profile,
    skills,
    assessedSkills: { SK_CORE: 1, SK_TEAM: 0 },
    currentSkills: { SK_CORE: 2, SK_TEAM: 0 }
  }), [
    { id: "SK_CORE", name: "Core", assessed: 1, current: 2, target: 3, gap: 1, progress: 67, critical: true },
    { id: "SK_TEAM", name: "Teamwork", assessed: 0, current: 0, target: 2, gap: 2, progress: 0, critical: false }
  ]);
});

test("caps progress at 100% while keeping the actual level visible", () => {
  const [skill] = buildSkillChartData({
    profile: { required_skills: { SK_CORE: 2 }, critical_skills: [] },
    skills,
    assessedSkills: { SK_CORE: 4 },
    currentSkills: { SK_CORE: 4 }
  });
  assert.equal(skill.current, 4);
  assert.equal(skill.gap, 0);
  assert.equal(skill.progress, 100);
});
