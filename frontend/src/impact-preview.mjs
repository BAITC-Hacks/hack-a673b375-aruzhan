// A reversible estimate: never writes history, assessments or eligibility.
export function previewImpact(result, recommendation) {
  const profile = result?.targetProfile;
  const eventId = recommendation?.event?.event_id;
  if (!profile || !eventId) return null;
  const direct = result.recommendations?.find(item => item.event.event_id === eventId);
  const candidate = direct ?? result.prerequisiteSteps?.find(item => item.event.event_id === eventId);
  if (!candidate) return null;

  // Read gains from the eligible result, even if a caller passes modified fields.
  const before = result.effectiveSkills;
  const after = { ...before };
  const criticalSkills = new Set(profile.critical_skills ?? []);
  const changes = candidate.improvements.map(improvement => {
    const skillId = improvement.skill_id;
    const current = before[skillId] ?? 0;
    after[skillId] = Math.max(current, improvement.afterEvent);
    const required = direct ? profile.required_skills[skillId] : improvement.requirement;
    return {
      skillId,
      name: improvement.name ?? skillId,
      before: current,
      after: after[skillId],
      required,
      remaining: Math.max(0, required - after[skillId]),
      critical: direct ? criticalSkills.has(skillId) : Boolean(improvement.critical)
    };
  });

  const requirements = Object.entries(profile.required_skills);
  const total = requirements.reduce((sum, [, required]) => sum + required, 0);
  const earned = levels => requirements.reduce((sum, [skillId, required]) => sum + Math.min(required, levels[skillId] ?? 0), 0);
  const percent = value => total === 0 ? 100 : Math.round(value / total * 100);
  const beforeEarned = earned(before);
  const afterEarned = earned(after);
  const names = new Map((result.skillGaps ?? []).map(skill => [skill.skillId, skill.name]));
  for (const change of changes) names.set(change.skillId, change.name);
  const remainingGaps = requirements.map(([skillId, required]) => ({
    skillId,
    name: names.get(skillId) ?? skillId,
    current: after[skillId] ?? 0,
    required,
    remaining: Math.max(0, required - (after[skillId] ?? 0)),
    critical: criticalSkills.has(skillId)
  })).filter(skill => skill.remaining > 0);

  return {
    eventId,
    assessedPercent: result.assessedProgress?.percent ?? null,
    beforePercent: percent(beforeEarned),
    afterPercent: percent(afterEarned),
    deltaPoints: percent(afterEarned) - percent(beforeEarned),
    beforeEarned,
    afterEarned,
    total,
    changes,
    remainingGaps,
    remainingGapCount: remainingGaps.length
  };
}
