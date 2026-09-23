import { parseCsv, rankCareerOptions, rankLearningActivities } from "/shared/recommendations.mjs";
import { buildSkillChartData } from "./skill-chart.mjs";
import { summarizeCompetencyGaps } from "./hr-summary.mjs";
import { resetProfileFocus } from "./recommendation-view.mjs";
import { previewImpact } from "./impact-preview.mjs";
import { createCareerFloor } from "./career-floor.mjs";
import { escapeHtml, formatDate, shortSession, blockerLabels, blockerText, relevantBlocker, visibleSteps, emptyMessage, stepCard } from "./journey-view.mjs";

const $ = selector => document.querySelector(selector);
const state = { employees:[],roleProfiles:[],skills:[],events:[],history:[],asOfDate:"", selectedEmployeeId:"E0101",goalOverrides:new Map(),selectedSkillId:null,activeEventId:null,selectedEventId:null,previewId:null,lockedId:null,view:"journey",flat:false };
let currentResult=null, floor=null, coachRequest=null;
const getEmployee=()=>state.employees.find(item=>item.employee_id===state.selectedEmployeeId);
const getGoal=employee=>state.goalOverrides.get(employee.employee_id) ?? employee.career_goal;
const allEligible=()=>[...currentResult.recommendations,...(currentResult.prerequisiteSteps ?? [])];
const selectedStep=()=>allEligible().find(item=>item.event.event_id===state.selectedEventId);
function resetContext() { resetProfileFocus(state); state.selectedEventId=null; state.previewId=null; state.lockedId=null; clearCoach(); }
function clearCoach() { coachRequest?.abort(); coachRequest=null; $("#coach-status").textContent=""; $("#coach-plan").replaceChildren(); $("#coach-trace").replaceChildren(); }
function showToast(message) { const toast=$("#toast"); toast.textContent=message; toast.classList.add("visible"); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>toast.classList.remove("visible"),3000); }
function setView(view) {
  state.view=view;
  document.querySelectorAll("[data-panel]").forEach(panel=>panel.hidden=panel.dataset.panel!==view);
  document.querySelectorAll("[data-view]").forEach(button=>button.dataset.view===view ? button.setAttribute("aria-current","page") : button.removeAttribute("aria-current"));
  if(view === "journey") updateFloor();
}
function fillEmployeePicker() {
  $("#employee-select").replaceChildren(...state.employees.map(employee=>{ const option=document.createElement("option"); option.value=employee.employee_id; option.textContent=`${employee.full_name} · ${employee.employee_id}`; return option; }));
  $("#employee-select").value=state.selectedEmployeeId;
  $("#goal-select").replaceChildren(...state.roleProfiles.map((profile,index)=>{ const option=document.createElement("option"); option.value=index; option.textContent=`${profile.role} · ${profile.grade}`; return option; }));
}
function renderGoal(employee,result) {
  const target=result.targetProfile;
  $("#welcome-title").textContent=`Your next career move, ${employee.full_name.split(" ")[0]}`;
  $("#career-goal").textContent=target ? `${target.role} · ${target.grade}` : "Choose your career goal";
  $("#current-role").textContent=`${employee.role} · ${employee.grade}`;
  $("#goal-gap-summary").textContent=target ? `${result.skillGaps.length} estimated skill gaps to close` : "A destination makes your next step clear";
  $("#progress-percent").textContent=result.assessedProgress ? `${result.assessedProgress.percent}%` : "—";
  $("#progress-fraction").textContent=result.assessedProgress ? `${result.assessedProgress.earned} of ${result.assessedProgress.total}` : "No target";
  $("#track-progress").style.width=`${result.assessedProgress?.percent ?? 0}%`;
  const preview=state.previewId && selectedStep() ? previewImpact(result,selectedStep()) : null;
  $("#estimated-progress").textContent=result.progress ? `Learning estimate: ${result.progress.percent}%${preview ? ` · Impact preview: ${preview.afterPercent}%` : ""}. Skill coverage, not promotion probability.` : "Choose a goal to compare skill requirements.";
  $("#as-of-date").textContent=`Dataset: ${formatDate(state.asOfDate)}`;
  $("#floor-destination").textContent=target ? `${target.grade} · career goal` : "Choose a destination";
}
function updateFloor() {
  if(!currentResult) return;
  const steps=visibleSteps(currentResult);
  const blocked=relevantBlocker(currentResult,state.events);
  floor?.update({ steps:[...steps.map(item=>({id:item.event.event_id,title:item.event.title,kind:"eligible"})),...(blocked ? [{id:blocked.event.event_id,title:blocked.event.title,kind:"locked"}] : [])],selectedId:state.lockedId ?? state.selectedEventId,previewId:state.previewId,targetLabel:$("#career-goal").textContent,hasGoal:Boolean(currentResult.targetProfile) });
}
function renderCheckpoints(result) {
  const steps=visibleSteps(result);
  $("#checkpoint-count").textContent=`${steps.length} eligible ${steps.length===1 ? "option" : "options"}`;
  $("#floor-steps").innerHTML=steps.length ? steps.map((item,index)=>`<button type="button" class="checkpoint-card ${state.previewId===item.event.event_id ? "previewing" : ""}" data-checkpoint="${item.event.event_id}" aria-pressed="${state.selectedEventId===item.event.event_id && !state.lockedId}"><span class="checkpoint-icon" aria-hidden="true">${String.fromCharCode(65+index)}</span><span><b>${escapeHtml(item.event.title)}</b><small>${state.previewId===item.event.event_id ? "Previewing impact" : item.kind==="prerequisite" ? "Preparatory step" : index===0 ? "Recommended first" : "Another option"} · ${item.event.duration_hours}h</small></span></button>`).join("") : `<p class="empty-state">${escapeHtml(emptyMessage(result))}</p>`;
  const blocked=relevantBlocker(result,state.events);
  $("#locked-checkpoint").innerHTML=blocked ? `<button type="button" class="locked-checkpoint" data-locked="${blocked.event.event_id}" aria-pressed="${state.lockedId===blocked.event.event_id}"><span aria-hidden="true">▣</span><span><b>${escapeHtml(blocked.event.title)}</b><br>Locked · ${escapeHtml(blockerLabels[blocked.blocker.code])}</span><span>Why?</span></button>` : "";
  updateFloor();
}
function renderRecommendation(result) {
  const item=selectedStep();
  const preview=state.previewId===item?.event.event_id ? previewImpact(result,item) : null;
  $("#recommendations-note").classList.toggle("preview-state",Boolean(preview));
  if(state.lockedId) {
    const event=state.events.find(item=>item.event_id===state.lockedId);
    const blocker=result.diagnostics.rejectedEvents.find(item=>item.eventId===state.lockedId);
    $("#recommendations-note").textContent="Locked checkpoint · not available";
    $("#recommendations").innerHTML=`<article class="step-card"><h3>${escapeHtml(event.title)}</h3><p class="step-why">This activity could develop a target skill, but it does not meet the current eligibility rules.</p><p class="blocked-state">${escapeHtml(blockerText(blocker,state.skills))}</p><p class="muted">${escapeHtml(event.event_id)} · catalog evidence. No booking or estimated gain can be applied.</p><button type="button" class="secondary-button" data-back-to-plan>Back to eligible steps</button></article>`;
  } else if(item) {
    const first=visibleSteps(result)[0]?.event.event_id===item.event.event_id;
    $("#recommendations-note").textContent=preview ? "Explore the change · nothing saved" : item.kind==="prerequisite" ? "Build the foundation first" : first ? "Your recommended next move" : "Another step toward your goal";
    $("#recommendations").innerHTML=stepCard(item,result,preview,state.skills,state.asOfDate);
  } else {
    $("#recommendations-note").textContent="Your next move";
    $("#recommendations").innerHTML=`<p class="empty-state">${escapeHtml(emptyMessage(result))}</p>${!result.targetProfile ? '<button type="button" class="primary-button" data-choose-goal>Choose a goal</button>' : ""}`;
  }
  $("#coach-generate").disabled=Boolean(coachRequest)||!result.targetProfile;
  const stages=result.diagnostics?.stages ?? [];
  $("#recommendation-diagnostics").innerHTML=`<p>${state.events.length} catalog activities → ${result.diagnostics?.eligibleCount ?? 0} eligible for this target. Up to three checkpoints shown. Skill selection never filters the overall plan.</p><ol>${stages.map(stage=>`<li>${escapeHtml(blockerLabels[stage.code])}: ${stage.before} → ${stage.remaining} (${stage.rejected} excluded)</li>`).join("")}</ol><p>First blocking rule is shown. Passing eligibility checks does not measure recommendation accuracy.</p>`;
}
function renderSkills(employee,result) {
  if(!result.targetProfile) {
    $("#skill-radar").replaceChildren(); $("#skill-list").replaceChildren(); $("#skill-focus").textContent="Choose a goal to explore your skills."; $("#skills-heading").textContent="Your skills"; $("#gap-count").textContent="No target"; $("#skills-note").textContent="Your assessment is kept separate from projected learning."; return;
  }
  const entries=buildSkillChartData({profile:result.targetProfile,skills:state.skills,assessedSkills:employee.skills,currentSkills:result.effectiveSkills});
  if(!entries.some(skill=>skill.id===state.selectedSkillId)) state.selectedSkillId=null;
  renderRadarChart(entries,state.selectedSkillId);
  const preview=state.previewId && selectedStep() ? previewImpact(result,selectedStep()) : null;
  $("#skills-heading").textContent=`Skills for ${result.targetProfile.grade}`;
  $("#gap-count").textContent=`${result.skillGaps.length} estimated gaps`;
  $("#skills-note").textContent=`Last assessment: ${employee.last_review_date ? formatDate(employee.last_review_date) : "not recorded"}. Select a skill to inspect the evidence.`;
  $("#skill-list").innerHTML=entries.map((skill,index)=>`<button type="button" class="skill-row ${state.selectedSkillId===skill.id ? "selected" : ""} ${preview?.changes.some(change=>change.skillId===skill.id) ? "preview-change" : ""}" data-skill-id="${skill.id}" aria-pressed="${state.selectedSkillId===skill.id}"><span class="skill-index">${index+1}</span><span class="skill-name ${skill.critical ? "critical" : ""}">${escapeHtml(skill.name)}</span><span class="skill-meter" aria-hidden="true"><span class="skill-target" style="width:${skill.target/5*100}%"></span><span class="skill-current" style="width:${skill.current/5*100}%"></span></span><span class="skill-level">${skill.current}/${skill.target}</span></button>`).join("");
  const skill=entries.find(item=>item.id===state.selectedSkillId);
  if(!skill) { $("#skill-focus").innerHTML='<p class="skill-focus-hint">Select a skill to compare its assessment, learning estimate and target, then explore eligible activities.</p>'; return; }
  const related=result.recommendations.filter(item=>item.improvements.some(gap=>gap.skill_id===skill.id));
  const blockers=result.diagnostics.rejectedEvents.filter(item=>state.events.find(event=>event.event_id===item.eventId)?.develops_skills.some(change=>change.skill_id===skill.id));
  $("#skill-focus").innerHTML=`<div class="skill-focus-header"><h3>${escapeHtml(skill.name)}</h3><button type="button" class="focus-reset" data-clear-skill>All skills</button></div><p class="skill-assessment">Assessed: ${skill.assessed}. Learning estimate: ${skill.current}. Target: ${skill.target}.</p><div class="skill-progress-label"><span>Estimated target coverage</span><b>${skill.progress}%</b></div><div class="skill-progress-track" role="progressbar" aria-label="Estimated skill coverage" aria-valuenow="${skill.progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${skill.progress}%"></span></div><p class="skill-gap">${skill.gap ? `${skill.gap} levels remain.` : "Covered by the current estimate; confirm any learning gains."}</p><div class="skill-events-heading"><b>Eligible activities</b><span>Separate from the main plan</span></div>${related.length ? related.map(item=>`<button type="button" class="skill-event" data-event-focus="${item.event.event_id}"><span><b>${escapeHtml(item.event.title)}</b><small>${item.event.duration_hours}h · ${escapeHtml(shortSession(item))}</small></span><span aria-hidden="true">↗</span></button>`).join("") : `<p class="skill-no-events">${skill.gap ? escapeHtml(blockers.map(item=>blockerText(item,state.skills)).join(" ") || "No catalog activity develops this gap.") : "No further learning needed for this requirement."}</p>`}`;
}
function renderCareerOptions(employee) {
  const goal=getGoal(employee);
  const paths=rankCareerOptions({employee,roleProfiles:state.roleProfiles,effectiveSkills:employee.skills}).filter(path=>!goal||path.role!==goal.target_role||path.grade!==goal.target_grade).slice(0,3);
  $("#career-options").innerHTML=paths.map(path=>`<article class="career-option"><div><span class="career-option-kind">${path.pathType==="upward" ? "Next grade" : "Lateral path"}</span><h4>${escapeHtml(path.role)} · ${escapeHtml(path.grade)}</h4><p>${path.readinessPercent}% of required skills meet their target, based on assessment.</p></div><button type="button" class="path-action" data-goal-role="${escapeHtml(path.role)}" data-goal-grade="${escapeHtml(path.grade)}">Choose</button></article>`).join("");
}
function render() {
  const employee=getEmployee(); if(!employee) return;
  const goal=getGoal(employee);
  currentResult=rankLearningActivities({employee:{...employee,career_goal:goal},events:state.events,roleProfiles:state.roleProfiles,skills:state.skills,history:state.history,asOfDate:state.asOfDate,limit:state.events.length});
  if(!allEligible().some(item=>item.event.event_id===state.selectedEventId)) { state.selectedEventId=visibleSteps(currentResult)[0]?.event.event_id ?? null; state.previewId=null; }
  renderGoal(employee,currentResult); renderCheckpoints(currentResult); renderRecommendation(currentResult); renderSkills(employee,currentResult); renderCareerOptions(employee);
}
function selectCheckpoint(id) {
  const allowed=allEligible().some(item=>item.event.event_id===id);
  const locked=relevantBlocker(currentResult,state.events);
  if(!allowed && locked?.event.event_id!==id) return;
  state.previewId=null; state.lockedId=allowed ? null : id;
  if(allowed) state.selectedEventId=id;
  setView("journey"); render();
  const selectedControl=state.lockedId ? $("#locked-checkpoint button") : document.querySelector(`[data-checkpoint="${id}"]`);
  selectedControl?.focus({preventScroll:true});
  if(window.matchMedia("(max-width:760px)").matches) $("#steps").scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion:reduce)").matches ? "instant" : "smooth"});
}
function openGoals() {
  const goal=getGoal(getEmployee());
  const index=state.roleProfiles.findIndex(profile=>profile.role===goal?.target_role&&profile.grade===goal?.target_grade);
  $("#goal-select").value=index>=0 ? String(index) : "";
  $("#goal-dialog").showModal();
}
function applyGoal(goal) { state.goalOverrides.set(state.selectedEmployeeId,goal); resetContext(); render(); $("#goal-dialog").close(); setView("journey"); showToast(`Goal updated: ${goal.target_role} · ${goal.target_grade}`); }
function selectSkill(id) { state.selectedSkillId=id; setView("skills"); renderSkills(getEmployee(),currentResult); $("#skill-list").querySelector(`[data-skill-id="${id}"]`)?.focus({preventScroll:true}); }

$("#employee-select").addEventListener("change",event=>{state.selectedEmployeeId=event.target.value; resetContext(); render();});
document.querySelectorAll("[data-view]").forEach(button=>button.addEventListener("click",()=>setView(button.dataset.view)));
$("#change-goal").addEventListener("click",openGoals);
$("#close-goal").addEventListener("click",()=>$("#goal-dialog").close());
$("#apply-goal").addEventListener("click",()=>{ const value=$("#goal-select").value; if(value==="") return; const profile=state.roleProfiles[Number(value)]; if(profile) applyGoal({target_role:profile.role,target_grade:profile.grade}); });
$("#career-options").addEventListener("click",event=>{const button=event.target.closest("[data-goal-role]"); if(button) applyGoal({target_role:button.dataset.goalRole,target_grade:button.dataset.goalGrade});});
for(const selector of ["#floor-steps","#locked-checkpoint"]) $(selector).addEventListener("click",event=>{const button=event.target.closest("[data-checkpoint],[data-locked]"); if(button) selectCheckpoint(button.dataset.checkpoint ?? button.dataset.locked);});
$("#recommendations").addEventListener("click",event=>{
  const button=event.target.closest("button"); if(!button) return;
  if(button.hasAttribute("data-choose-goal")) return openGoals();
  if(button.hasAttribute("data-back-to-plan")) {state.lockedId=null; render(); $("[data-preview]")?.focus({preventScroll:true}); return;}
  if(button.dataset.skillFocus) return selectSkill(button.dataset.skillFocus);
  if(button.dataset.preview) {const item=selectedStep(); if(!item||!previewImpact(currentResult,item)) return; state.previewId=item.event.event_id; render(); $("[data-undo]")?.focus({preventScroll:true}); showToast("Impact preview shown. Your profile and history are unchanged.");}
  if(button.hasAttribute("data-undo")) {state.previewId=null; render(); $("[data-preview]")?.focus({preventScroll:true}); showToast("Preview cleared. Back to your current skill estimates.");}
});
for(const selector of ["#skill-list","#skill-radar"]) $(selector).addEventListener("click",event=>{const button=event.target.closest("[data-skill-id]"); if(button) selectSkill(button.dataset.skillId);});
$("#skill-radar").addEventListener("keydown",event=>{const button=event.target.closest("[data-skill-id]"); if(button&&["Enter"," "].includes(event.key)){event.preventDefault(); selectSkill(button.dataset.skillId);}});
$("#skill-focus").addEventListener("click",event=>{if(event.target.closest("[data-clear-skill]")){state.selectedSkillId=null; renderSkills(getEmployee(),currentResult);} const button=event.target.closest("[data-event-focus]"); if(button) selectCheckpoint(button.dataset.eventFocus);});
$("#rotate-floor").addEventListener("click",()=>floor?.rotate("right"));
$("#toggle-floor").addEventListener("click",()=>{state.flat=!state.flat; $("#floor-scene").classList.toggle("list-mode",state.flat); $("#floor-fallback").hidden=!state.flat; $("#toggle-floor").textContent=state.flat ? "3D view" : "2D view"; $("#toggle-floor").setAttribute("aria-pressed",String(state.flat)); $("#rotate-floor").disabled=state.flat; if(!state.flat) updateFloor();});

$("#coach-generate").addEventListener("click",async()=>{
  clearCoach(); const request=new AbortController(); coachRequest=request;
  $("#coach-generate").disabled=true; $("#coach-status").textContent="Checking your profile, gaps and available steps…";
  const timeout=setTimeout(()=>request.abort(),65000);
  try {
    const response=await fetch("/api/coach",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({employeeId:state.selectedEmployeeId,goal:getGoal(getEmployee()) ?? null}),signal:request.signal});
    const plan=await response.json(); if(coachRequest!==request) return;
    $("#coach-status").textContent=plan.status==="ready" ? "Plan validated against the catalog and actual history. Gains remain estimates." : plan.status==="unconfigured" ? "AI coach is not connected yet. Your evidence-based recommendations remain available." : "The coach could not produce a validated plan. Your existing recommendations are still available.";
    $("#coach-plan").innerHTML=plan.status==="ready" ? (plan.steps ?? []).map(step=>`<article class="coach-result"><h3>${escapeHtml(step.title ?? step.eventId)}</h3><p class="muted">${escapeHtml(step.explanation)}</p><p class="muted">${step.durationHours}h · ${step.nextSession ? escapeHtml(formatDate(step.nextSession)) : "Self-paced"}</p><details class="evidence-details"><summary>Dataset evidence</summary><p>${escapeHtml((step.evidence ?? []).join(" · "))}</p></details></article>`).join("") : "";
    $("#coach-trace").innerHTML=(plan.trace ?? []).map(item=>`<li>${escapeHtml(item.tool)}: ${escapeHtml(item.status)}</li>`).join("");
  } catch(error) { if(coachRequest===request) $("#coach-status").textContent=error.name==="AbortError" ? "The coach timed out. Your existing plan is still available." : "Coach unavailable. Start the app server and try again."; }
  finally {clearTimeout(timeout); if(coachRequest===request){coachRequest=null; $("#coach-generate").disabled=!currentResult.targetProfile;}}
});
function renderHr() {const summary=summarizeCompetencyGaps(state); $("#hr-summary").textContent=`${summary.employeeCount} employees · ${summary.withTargetCount} with a valid goal · ${summary.missingGoalCount} without a goal · ${summary.missingTargetCount} missing requirements.`; $("#hr-gaps").innerHTML=summary.gaps.slice(0,5).map(gap=>`<tr><th scope="row">${escapeHtml(gap.name)}<small>${escapeHtml(gap.skillId)}</small></th><td>${gap.affectedCount}</td><td>${gap.requiredCount}</td><td>${gap.totalGapLevels}</td></tr>`).join("");}
async function start() {
  const paths=["employees.json","events.json","skills.json","activity_history.csv"];
  const data=await Promise.all(paths.map(async path=>{const response=await fetch(`/data/career_quest/${path}`); if(!response.ok) throw new Error(`Dataset load failed: ${path}`); return path.endsWith("csv") ? parseCsv(await response.text()) : response.json();}));
  [state.employees,state.events,state.roleProfiles,state.skills,state.history,state.asOfDate]=[data[0].employees,data[1].events,data[2].role_profiles,data[2].skills,data[3],data[0].meta.as_of_date];
  if(!getEmployee()) state.selectedEmployeeId=state.employees[0]?.employee_id;
  fillEmployeePicker(); renderHr(); render();
  floor=await createCareerFloor($("#career-floor"),{onSelect:selectCheckpoint,onAvailability:available=>{
    $("#floor-status").textContent=available ? "3D floor ready. All checkpoints are also available as buttons below." : "3D unavailable. Use the accessible checkpoints below.";
    if(!available) {state.flat=true; $("#floor-scene").classList.add("list-mode"); $("#floor-fallback").hidden=false; $("#toggle-floor").disabled=true; $("#toggle-floor").textContent="2D view"; $("#toggle-floor").setAttribute("aria-pressed","true"); $("#rotate-floor").disabled=true;}
  }});
  updateFloor();
}
window.addEventListener("pagehide",()=>floor?.destroy(),{once:true});
start().catch(error=>{console.error("Career Quest could not start",error); $("#recommendations").innerHTML='<p class="empty-state">Could not load the case data. Restart the app server and reload.</p>';});

function radarPoint(index, count, value, centerX = 220, centerY = 180, radius = 132) {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
  const distance = radius * Math.max(0, Math.min(5, value)) / 5;
  return [centerX + Math.cos(angle) * distance, centerY + Math.sin(angle) * distance];
}

function renderRadarChart(entries, selectedId) {
  const container = $("#skill-radar");
  const count = entries.length;
  if (!count) {
    container.replaceChildren();
    return;
  }
  const center = [220, 180];
  const radius = 132;
  const rings = [1, 2, 3, 4, 5].map(level => {
    const points = entries.map((_, index) => radarPoint(index, count, level, ...center, radius).join(",")).join(" ");
    return `<polygon class="radar-ring" points="${points}" />`;
  }).join("");
  const axes = entries.map((_, index) => {
    const [x, y] = radarPoint(index, count, 5, ...center, radius);
    return `<line class="radar-axis" x1="${center[0]}" y1="${center[1]}" x2="${x}" y2="${y}" />`;
  }).join("");
  const polygon = key => entries.map((skill, index) => radarPoint(index, count, skill[key], ...center, radius).join(",")).join(" ");
  const selectors = entries.map((skill, index) => {
    const [x, y] = radarPoint(index, count, 5, ...center, radius + 21);
    const selected = skill.id === selectedId;
    const label = `${skill.name}: estimated level ${skill.current}, target ${skill.target}`;
    return `<g class="radar-selector ${selected ? "selected" : ""}" role="button" tabindex="0" data-skill-id="${skill.id}" aria-label="${label}" aria-pressed="${selected}"><circle cx="${x}" cy="${y}" r="12"></circle><text x="${x}" y="${y + 3}">${index + 1}</text></g>`;
  }).join("");
  const points = entries.map((skill, index) => {
    const [targetX, targetY] = radarPoint(index, count, skill.target, ...center, radius);
    const [currentX, currentY] = radarPoint(index, count, skill.current, ...center, radius);
    return `<circle class="radar-target-point" cx="${targetX}" cy="${targetY}" r="3"></circle><circle class="radar-current-point" cx="${currentX}" cy="${currentY}" r="3.5"></circle>`;
  }).join("");
  container.innerHTML = `<svg viewBox="0 0 440 365" role="group" aria-labelledby="radar-title radar-description">
    <title id="radar-title">Skills: estimated levels and role requirements</title>
    <desc id="radar-description">Scale from zero to five. Choose an axis or a skill below. ${entries.map((skill, index) => `${index + 1}: ${skill.name}, ${skill.current} of ${skill.target}`).join("; ")}.</desc>
    ${rings}${axes}
    <polygon class="radar-target-area" points="${polygon("target")}" />
    <polygon class="radar-current-area" points="${polygon("current")}" />
    ${points}${selectors}
    <text class="radar-scale-label" x="226" y="${center[1] - radius + 4}">5</text>
    <text class="radar-scale-label" x="226" y="${center[1] - radius * 3 / 5 + 4}">3</text>
    <text class="radar-scale-label" x="226" y="${center[1] + 3}">0</text>
  </svg>`;
}
