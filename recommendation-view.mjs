// Skill exploration must never filter the main career-target recommendations.
export function selectRecommendationViews(result, { selectedSkillId = null, activeEventId = null } = {}) {
  const recommendations = result.recommendations ?? [];
  const skillRelated = selectedSkillId
    ? recommendations.filter(item => item.improvements.some(improvement => improvement.skill_id === selectedSkillId))
    : [];
  return {
    primary: recommendations.slice(0, 3),
    skillRelated,
    focused: skillRelated.find(item => item.event.event_id === activeEventId) ?? null
  };
}

export function resetProfileFocus(state) {
  state.selectedSkillId = null;
  state.activeEventId = null;
}
