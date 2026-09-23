// HR reports use recorded assessments only. Course estimates and UI simulations
// cannot change the number of employees with an assessed competency gap.
export function summarizeCompetencyGaps({ employees, roleProfiles, skills }) {
  const names = new Map(skills.map(skill => [skill.skill_id, skill.name]));
  const gapsBySkill = new Map();
  const summary = {
    employeeCount: employees.length,
    withTargetCount: 0,
    missingGoalCount: 0,
    missingTargetCount: 0,
    gaps: []
  };

  for (const employee of employees) {
    const goal = employee.career_goal;
    if (!goal) {
      summary.missingGoalCount += 1;
      continue;
    }
    const target = roleProfiles.find(profile => profile.role === goal.target_role && profile.grade === goal.target_grade);
    if (!target) {
      summary.missingTargetCount += 1;
      continue;
    }
    summary.withTargetCount += 1;
    for (const [skillId, required] of Object.entries(target.required_skills)) {
      if (required <= 0) continue;
      const gap = gapsBySkill.get(skillId) ?? {
        skillId,
        name: names.get(skillId) ?? skillId,
        affectedCount: 0,
        requiredCount: 0,
        totalGapLevels: 0
      };
      const missingLevels = Math.max(0, required - (employee.skills?.[skillId] ?? 0));
      gap.requiredCount += 1;
      if (missingLevels > 0) {
        gap.affectedCount += 1;
        gap.totalGapLevels += missingLevels;
      }
      gapsBySkill.set(skillId, gap);
    }
  }

  summary.gaps = [...gapsBySkill.values()]
    .filter(gap => gap.affectedCount > 0)
    .sort((left, right) => right.affectedCount - left.affectedCount
      || right.totalGapLevels - left.totalGapLevels
      || left.skillId.localeCompare(right.skillId));
  return summary;
}
