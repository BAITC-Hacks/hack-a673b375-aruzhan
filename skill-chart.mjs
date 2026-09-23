export function buildSkillChartData({ profile, skills, assessedSkills, currentSkills }) {
  const names = new Map(skills.map(skill => [skill.skill_id, skill.name]));
  const critical = new Set(profile.critical_skills ?? []);
  return Object.entries(profile.required_skills).map(([id, target]) => {
    const assessed = assessedSkills[id] ?? 0;
    const current = currentSkills[id] ?? 0;
    return {
      id,
      name: names.get(id) ?? id,
      assessed,
      current,
      target,
      gap: Math.max(0, target - current),
      progress: target > 0 ? Math.min(100, Math.round(current / target * 100)) : 100,
      critical: critical.has(id)
    };
  });
}
