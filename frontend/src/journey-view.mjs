export const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
export const formatDate = date => new Intl.DateTimeFormat("en-GB", { day:"numeric", month:"short", year:"numeric" }).format(new Date(`${date}T00:00:00`));
const types = { course:"Course", workshop:"Workshop", mentoring:"Mentoring", certification:"Certification", meetup:"Meetup", onboarding:"Onboarding" };
export const typeLabel = event => types[event.type] ?? event.type;
export const shortSession = item => item.nextSession ? formatDate(item.nextSession) : "Start anytime";
export const blockerLabels = {
  mandatory:"Assigned by HR, not a voluntary recommendation", role_mismatch:"Not available for your current role",
  grade_mismatch:"Not available for your current grade", in_progress:"Already in progress", already_completed:"Already completed; cannot be repeated",
  prerequisites:"Prerequisite skills are below the required level", no_session:"No available upcoming session", no_target_gain:"Does not close a remaining target gap"
};
export function blockerText(blocker, skills = []) {
  if (!blocker) return "No eligible activity is available in this catalog.";
  const missing = (blocker.missingPrerequisites ?? []).map(gap => `${skills.find(s=>s.skill_id===gap.skillId)?.name ?? gap.skillId}: ${gap.current} estimated, ${gap.required} required`).join("; ");
  return `${blockerLabels[blocker.code] ?? "Not currently eligible"}${missing ? `. ${missing}` : ""}.`;
}
export function visibleSteps(result) {
  return (result.recommendations.length ? result.recommendations : result.prerequisiteSteps ?? []).slice(0,3);
}
export function relevantBlocker(result, events) {
  const priority = ["prerequisites","no_session","role_mismatch","grade_mismatch","in_progress","already_completed"];
  return [...(result.diagnostics?.rejectedEvents ?? [])].filter(item => priority.includes(item.code))
    .sort((a,b)=>priority.indexOf(a.code)-priority.indexOf(b.code))
    .map(blocker=>({ blocker, event:events.find(e=>e.event_id===blocker.eventId) }))
    .find(({event})=>event?.develops_skills.some(change=>result.skillGaps.some(gap=>gap.skillId===change.skill_id && Math.min(change.max_level,gap.current+change.gain)>gap.current))) ?? null;
}
export function emptyMessage(result) {
  if (result.status === "career_goal_missing") return "Choose a career goal to see relevant development steps.";
  if (result.status === "target_profile_missing") return "This role and grade have no requirements in the dataset. Choose another target.";
  if (result.status === "requirements_met") return "All requirements are covered by the current estimate. Confirm any learning gains with an assessment.";
  return "The catalog has no eligible step for the remaining gaps. Review the blockers below or explore another target.";
}
export function stepCard(item, result, preview, skills, asOfDate) {
  const e=escapeHtml;
  const target=result.targetProfile;
  const prerequisites=Object.entries(item.event.prerequisites ?? {}).map(([id,required])=>`${skills.find(s=>s.skill_id===id)?.name ?? id} ${result.effectiveSkills[id] ?? 0}/${required}`).join(", ");
  const critical=item.improvements.filter(gap=>gap.critical).map(gap=>gap.name);
  const names=item.improvements.map(gap=>gap.name);
  const isPrerequisite=item.kind === "prerequisite";
  const why=isPrerequisite
    ? `Build the prerequisite skills for <strong>${e(item.unlocks.map(next=>next.title).join(", "))}</strong>. Reassess them before taking the next course.`
    : `Build <strong>${e((critical.length ? critical : names).join(" and "))}</strong> ${critical.length ? "— a critical gap" : "— a remaining gap"} for <strong>${e(target.role)} ${e(target.grade)}</strong>.`;
  const evidence=item.evidence?.references ?? [];
  const impact=preview ? `<section class="impact-card" aria-label="Impact preview"><div class="impact-top"><b>Preview only · goal coverage</b><button type="button" class="undo-button" data-undo>Undo</button></div><div class="impact-values"><span>${preview.beforePercent}%</span><span aria-hidden="true">→</span><span>${preview.afterPercent}%</span><small>+${preview.deltaPoints} pp</small></div><p>${preview.remainingGapCount ? `${preview.remainingGapCount} skill gaps would remain${preview.remainingGaps.length ? `, including ${e(preview.remainingGaps.slice(0,2).map(gap=>gap.name).join(" and "))}` : ""}.` : "No estimated target gaps would remain; assessment is still required."}</p><p>Assessed coverage stays ${preview.assessedPercent ?? "—"}%. No course completed or booked.</p></section>` : "";
  return `<article class="step-card" data-event="${e(item.event.event_id)}"><h3>${e(item.event.title)}</h3><p class="step-why">${why}</p>
  <div class="step-gains" aria-label="Expected skill changes">${item.improvements.map(gap=>`<div class="step-gain ${preview ? "preview-change" : ""}"><div>${Object.hasOwn(target.required_skills,gap.skill_id) ? `<button type="button" data-skill-focus="${e(gap.skill_id)}">${e(gap.name)}${gap.critical ? " *" : ""}</button>` : `<b>${e(gap.name)}</b>`}<small>${isPrerequisite ? "Prerequisite" : "Target"}: ${gap.requirement} · gap ${Math.max(0,gap.requirement-gap.current)} · estimated levels</small></div><span>${gap.current}<span class="gain-arrow" aria-hidden="true">→</span>${gap.afterEvent}</span></div>`).join("")}</div>
  ${impact}
  <dl class="step-meta"><div><dt>Time commitment</dt><dd>${item.event.duration_hours} hours · ${e(typeLabel(item.event))}</dd></div><div><dt>${item.nextSession ? "Next catalog session" : "Availability"}</dt><dd>${e(shortSession(item))}${item.nextSession ? "" : " · self-paced"}</dd></div></dl>
  <p class="prerequisite-line">${prerequisites ? `Prerequisites met by current estimate: ${e(prerequisites)}.` : "No skill prerequisites."} ${item.nextSession ? `Session listed as of ${e(formatDate(asOfDate))}.` : ""}</p>
  <details class="evidence-details"><summary>Why you're eligible & supporting evidence</summary><ul><li>Your current role and grade match this activity’s audience.</li><li>Voluntary activity; not in progress. ${item.event.event_id === "EV_036" ? "This speaking club permits repeat participation." : "No previous completion in your history."}</li><li>${item.factors.criticalLevels} critical target levels; ${item.factors.skillsAdvanced} skills advanced; ${item.factors.participationFriction} related missed, declined or dropped activities considered.</li><li>Expected gains use catalog gain/max_level, not a new assessment.${isPrerequisite ? " These gains support the next course’s prerequisites." : ""}</li></ul><p>Dataset records</p><ul>${evidence.map(ref=>`<li>${e(ref)}</li>`).join("")}</ul></details>
  ${preview ? "" : `<p class="preview-explainer">Explore the estimated skill changes and what would remain. This won't change your profile or enroll you.</p><button type="button" class="primary-button" data-preview="${e(item.event.event_id)}"><span aria-hidden="true">◈</span> Preview impact</button>`}</article>`;
}
