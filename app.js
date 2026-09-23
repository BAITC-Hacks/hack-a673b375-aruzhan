import { parseCsv, rankCareerOptions, rankLearningActivities } from "./recommendations.mjs";
import { buildSkillChartData } from "./skill-chart.mjs";
import { selectRecommendationViews, resetProfileFocus } from "./recommendation-view.mjs";
import { summarizeCompetencyGaps } from "./hr-summary.mjs";

const DATA_ROOT = "./data/career_quest/";
const EVENT_TYPE_LABELS = {
  course: "Курс", workshop: "Воркшоп", mentoring: "Наставничество",
  certification: "Сертификация", meetup: "Встреча", onboarding: "Адаптация"
};
const state = {
  employees: [], roleProfiles: [], skills: [], events: [], history: [], asOfDate: "",
  selectedEmployeeId: "E0101", goalOverrides: new Map(), simulatedHistory: new Map(),
  selectedSkillId: null, activeEventId: null
};
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
let currentResult = null;
let coachRequest = null;

function resetContext() {
  resetProfileFocus(state);
  clearCoach();
}

function clearCoach() {
  coachRequest?.abort();
  coachRequest = null;
  $("#coach-generate").disabled = false;
  $("#coach-status").textContent = "";
  $("#coach-plan").replaceChildren();
  $("#coach-trace").replaceChildren();
}

async function fetchJson(path) {
  const response = await fetch(`${DATA_ROOT}${path}`);
  if (!response.ok) throw new Error(`Не удалось загрузить ${path}: HTTP ${response.status}`);
  return response.json();
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${date}T00:00:00`));
}

function getEmployee() {
  return state.employees.find(item => item.employee_id === state.selectedEmployeeId);
}

function getGoal(employee) {
  return state.goalOverrides.get(employee.employee_id) ?? employee.career_goal;
}

function getHistory(employee) {
  return state.history.concat(state.simulatedHistory.get(employee.employee_id) ?? []);
}

function fillEmployeePicker() {
  const picker = $("#employee-select");
  const employees = [...state.employees].sort((a, b) => a.employee_id.localeCompare(b.employee_id));
  picker.replaceChildren(...employees.map(employee => {
    const option = document.createElement("option");
    option.value = employee.employee_id;
    option.textContent = `${employee.employee_id} · ${employee.full_name} · ${employee.role}`;
    return option;
  }));
  if (!employees.some(employee => employee.employee_id === state.selectedEmployeeId)) {
    state.selectedEmployeeId = employees[0]?.employee_id;
  }
  picker.value = state.selectedEmployeeId;
}

function renderSkillRows(employee, result) {
  const list = $("#skill-list");
  const chart = $("#skill-radar");
  const detail = $("#skill-focus");
  if (!result.targetProfile) {
    chart.innerHTML = '<p class="empty-state">Сначала выбери карьерный путь, чтобы увидеть сравнение навыков.</p>';
    detail.replaceChildren();
    $("#focused-event").replaceChildren();
    list.innerHTML = '<p class="empty-state">Выбери один из вариантов карьерного пути, чтобы сравнить навыки.</p>';
    $("#skills-heading").textContent = "Навыки";
    $("#gap-count").textContent = "цель не выбрана";
    $("#skills-note").textContent = "Сначала выбери направление — тогда сравним твой профиль с требованиями роли.";
    return;
  }

  const entries = buildSkillChartData({
    profile: result.targetProfile,
    skills: state.skills,
    assessedSkills: employee.skills,
    currentSkills: result.effectiveSkills
  });
  const selectedSkillId = entries.some(skill => skill.id === state.selectedSkillId)
    ? state.selectedSkillId
    : null;
  if (selectedSkillId !== state.selectedSkillId) resetProfileFocus(state);
  renderRadarChart(entries, selectedSkillId);
  const selected = entries.find(skill => skill.id === selectedSkillId);
  const { skillRelated: skillEvents, focused } = selectRecommendationViews(result, state);
  if (!focused) state.activeEventId = null;
  renderSkillFocus(selected, skillEvents);
  $("#focused-event").innerHTML = focused ? `<h3 class="subheading">Занятие для выбранного навыка</h3>${recommendationCard(focused, result)}` : "";
  list.innerHTML = entries.map((skill, index) => `
    <button class="skill-row ${skill.id === selectedSkillId ? "selected" : ""}" type="button" data-skill-id="${skill.id}" aria-pressed="${skill.id === selectedSkillId}">
      <span class="skill-index">${index + 1}</span>
      <span class="skill-name ${skill.critical ? "critical" : ""}" title="${skill.name}">${skill.name}</span>
      <span class="skill-meter" aria-hidden="true">
        <span class="skill-target" style="width:${Math.min(skill.target / 5 * 100, 100)}%"></span>
        <span class="skill-current" style="width:${Math.min(skill.current / 5 * 100, 100)}%"></span>
      </span>
      <span class="skill-level">${skill.current} / ${skill.target}</span>
    </button>`).join("");

  $("#skills-heading").textContent = `Навыки для ${result.targetProfile.grade}`;
  $("#gap-count").textContent = `${result.skillGaps.length} навыков в фокусе`;
  $("#skills-note").textContent = employee.last_review_date
    ? `Последняя оценка — ${formatDate(employee.last_review_date)} Завершённые позже активности учтены в расчётном уровне.`
    : "Уровни из профиля; завершённое обучение после последней оценки учитывается отдельно.";
}

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
    const label = `${skill.name}: текущий уровень ${skill.current}, требование ${skill.target}`;
    return `<g class="radar-selector ${selected ? "selected" : ""}" role="button" tabindex="0" data-skill-id="${skill.id}" aria-label="${label}" aria-pressed="${selected}"><circle cx="${x}" cy="${y}" r="12"></circle><text x="${x}" y="${y + 3}">${index + 1}</text></g>`;
  }).join("");
  const points = entries.map((skill, index) => {
    const [targetX, targetY] = radarPoint(index, count, skill.target, ...center, radius);
    const [currentX, currentY] = radarPoint(index, count, skill.current, ...center, radius);
    return `<circle class="radar-target-point" cx="${targetX}" cy="${targetY}" r="3"></circle><circle class="radar-current-point" cx="${currentX}" cy="${currentY}" r="3.5"></circle>`;
  }).join("");
  container.innerHTML = `<svg viewBox="0 0 440 365" role="group" aria-labelledby="radar-title radar-description">
    <title id="radar-title">Навыки: уровень профиля и требование выбранной роли</title>
    <desc id="radar-description">Шкала диаграммы от нуля до пяти. Нажми на номер оси или выбери навык в списке. ${entries.map((skill, index) => `${index + 1}: ${skill.name}, ${skill.current} из ${skill.target}`).join("; ")}.</desc>
    ${rings}${axes}
    <polygon class="radar-target-area" points="${polygon("target")}" />
    <polygon class="radar-current-area" points="${polygon("current")}" />
    ${points}${selectors}
    <text class="radar-scale-label" x="226" y="${center[1] - radius + 4}">5</text>
    <text class="radar-scale-label" x="226" y="${center[1] - radius * 3 / 5 + 4}">3</text>
    <text class="radar-scale-label" x="226" y="${center[1] + 3}">0</text>
  </svg>`;
}

function renderSkillFocus(skill, recommendations) {
  const detail = $("#skill-focus");
  if (!skill) {
    detail.innerHTML = '<p class="skill-focus-hint">Выбери навык на диаграмме или в списке, чтобы увидеть уровень, пробел до цели и подходящие занятия.</p>';
    return;
  }
  const assessedDelta = skill.current - skill.assessed;
  const actualSummary = assessedDelta > 0
    ? `Оценка в профиле: ${skill.assessed}. Ещё +${assessedDelta} — расчётный эффект завершённых активностей.`
    : `Уровень по оценке в профиле: ${skill.assessed}.`;
  const eventList = recommendations.length
    ? recommendations.slice(0, 4).map(item => {
      const next = item.nextSession ? `Следующая сессия · ${formatDate(item.nextSession)}` : "Можно начать в любое время";
      return `<button type="button" class="skill-event" data-event-focus="${item.event.event_id}">
        <span><b>${item.event.title}</b><small>${EVENT_TYPE_LABELS[item.event.type] ?? item.event.type} · ${item.event.duration_hours} ч · ${next}</small></span><span aria-hidden="true">↗</span>
      </button>`;
    }).join("")
    : `<p class="skill-no-events">${escapeHtml(skill.gap ? describeBlockers(currentResult, skill.id) : "По расчёту требование закрыто. Если уровень включает эффект обучения, подтверди его оценкой.")} Основной план справа относится ко всей цели.</p>`;
  detail.innerHTML = `<div class="skill-focus-header"><div><span class="eyebrow">В ФОКУСЕ</span><h3>${skill.name}${skill.critical ? " · важный" : ""}</h3></div><button type="button" class="focus-reset" data-clear-skill>Весь профиль</button></div>
    <p class="skill-assessment">${actualSummary}</p>
    <div class="skill-progress-label"><span>Расчётное покрытие требования</span><b>${skill.current} / ${skill.target} · ${skill.progress}%</b></div>
    <div class="skill-progress-track" role="progressbar" aria-label="Прогресс по навыку ${skill.name}" aria-valuenow="${skill.progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${skill.progress}%"></span></div>
    <p class="skill-gap">${skill.gap ? `До требования не хватает ${skill.gap} ${skill.gap === 1 ? "уровня" : "уровней"}.` : "Требуемый уровень достигнут по текущему расчёту."}</p>
    <div class="skill-events-heading"><b>Подходящие занятия</b><span>по правилам кейса</span></div><div class="skill-events">${eventList}</div>`;
}

function renderJourney(employee, goal, result) {
  const validGoal = Boolean(goal && result.targetProfile);
  $("#career-goal").textContent = goal ? `${goal.target_role} · ${goal.target_grade}` : "Путь не выбран";
  $("#welcome-title").textContent = `Расти в своём темпе, ${employee.full_name.split(" ")[0]}`;
  $("#welcome-subtitle").textContent = validGoal
    ? "Развивай навыки для надёжных цифровых сервисов — и двигайся к следующему шагу."
    : "Сравни карьерные направления по навыкам и выбери путь, который тебе интересен.";
  $("#as-of-date").textContent = `ДАННЫЕ НА ${formatDate(state.asOfDate).toLocaleUpperCase("ru-RU")}`;
  $("#current-grade").textContent = employee.grade;
  $("#target-grade").textContent = validGoal ? goal.target_grade : "—";
  $("#journey-title").textContent = validGoal
    ? `От ${employee.grade} к ${goal.target_grade}`
    : "Выбери направление развития";
  $("#journey-description").textContent = validGoal
    ? `${employee.role} → ${goal.target_role}. План строится по требованиям выбранной роли.`
    : "Ни цель, ни карьерный прогноз не подставляем без твоего выбора.";

  const progress = result.assessedProgress;
  const percent = progress?.percent ?? 0;
  $("#progress-percent").textContent = progress ? `${percent}%` : "—";
  $("#progress-fraction").textContent = progress
    ? `${progress.earned} из ${progress.total}`
    : "сначала выбери цель";
  $("#track-progress").style.width = `${percent}%`;
  $("#estimated-progress").textContent = result.progress
    ? `Оценка профиля: ${percent}% требуемых уровней. С учётом ожидаемого эффекта обучения: ${result.progress.percent}% — требуется подтверждение навыков. Процент не означает вероятность повышения.`
    : "Для расчёта покрытия требований выбери цель.";
}

function describeBlockers(result, skillId = null) {
  if (result.status === "career_goal_missing") return "Цель не выбрана. Выбери путь ниже, чтобы получить план.";
  if (result.status === "target_profile_missing") return "Для выбранной роли и грейда в датасете нет требований.";
  if (result.status === "requirements_met") return "По расчётному уровню все требования закрыты. Ожидаемый эффект обучения нужно подтвердить оценкой; новые занятия не требуются.";
  const rejected = (result.diagnostics?.rejectedEvents ?? []).filter(item => !skillId || state.events.find(event => event.event_id === item.eventId)?.develops_skills.some(skill => skill.skill_id === skillId));
  const counts = new Map();
  for (const item of rejected) counts.set(item.code, (counts.get(item.code) ?? 0) + 1);
  const reasons = (result.diagnostics?.blockers ?? []).filter(item => counts.has(item.code))
    .map(item => `${item.label}: ${counts.get(item.code)}`).join("; ");
  const prerequisites = rejected.filter(item => item.code === "prerequisites").filter(item => {
    const event = state.events.find(event => event.event_id === item.eventId);
    return event?.develops_skills.some(skill => result.skillGaps.some(gap => gap.skillId === skill.skill_id));
  }).slice(0, 3).map(item => {
    const event = state.events.find(event => event.event_id === item.eventId);
    const missing = item.missingPrerequisites.map(gap => `${state.skills.find(skill => skill.skill_id === gap.skillId)?.name ?? gap.skillId}: нужно ${gap.required}, расчётный уровень ${gap.current}`).join("; ");
    return `${event.title} — ${missing}`;
  }).join(". ");
  return reasons ? `Нет доступной активности. Причины исключения: ${reasons}.${prerequisites ? ` Для участия: ${prerequisites}.` : ""}` : "В каталоге нет активности, которая закрывает этот пробел. Нужны дополнительные данные каталога или оценка навыка.";
}

function recommendationCard(item, result) {
  const event = item.event;
  const session = item.nextSession ? `Следующая сессия · ${formatDate(item.nextSession)}` : "Самостоятельно · без сессии";
  const target = result.targetProfile;
  const evidence = item.evidence ?? { references: [], eligibility: [], ranking: [] };
  const list = values => values.map(value => `<li>${escapeHtml(value)}</li>`).join("");
  const gaps = item.improvements.map(skill => `${skill.name}: ${skill.current} / ${skill.requirement}, разрыв ${Math.max(0, skill.requirement - skill.current)}`).join("; ");
  const unlocks = item.unlocks?.map(next => `${next.title} (${next.eventId})`).join(", ");
  return `<article class="rec-item" data-event="${escapeHtml(event.event_id)}">
    <div class="rec-top"><h3>${escapeHtml(event.title)}</h3><span class="rec-duration">${escapeHtml(EVENT_TYPE_LABELS[event.type] ?? event.type)} · ${event.duration_hours} ч</span></div>
    <p class="rec-reason"><b>Цель: ${escapeHtml(target.role)} · ${escapeHtml(target.grade)}</b><br>${escapeHtml(gaps)}</p>
    <p class="rec-reason">${escapeHtml(item.reasons.join(" · "))}</p>
    ${unlocks ? `<p class="rec-reason">Подготовка к: ${escapeHtml(unlocks)}. После обучения нужна переоценка prerequisites; доступность следующего занятия проверяется заново.</p>` : ""}
    <p class="rec-reason">Ожидаемый эффект, не подтверждённый рост:</p>
    <div class="rec-gains">${item.improvements.map(skill => `<button type="button" class="gain-chip" data-skill-focus="${escapeHtml(skill.skill_id)}">${escapeHtml(skill.name)} <strong>${skill.current} → ${skill.afterEvent}</strong>${skill.critical ? " · критичный" : ""}</button>`).join("")}</div>
    <details class="evidence-details"><summary>Почему подходит · источники</summary><ul>${list(evidence.eligibility)}${list(evidence.ranking)}</ul><p>Источники в data/career_quest:</p><ul>${list(evidence.references)}</ul></details>
    <div class="rec-bottom"><span class="rec-date">${escapeHtml(session)} · по данным на ${escapeHtml(state.asOfDate)}</span><button type="button" class="rec-action" data-complete="${escapeHtml(event.event_id)}" aria-label="Смоделировать завершение: ${escapeHtml(event.title)}">Смоделировать шаг</button></div>
  </article>`;
}

function renderActivities(result) {
  const { primary, skillRelated } = selectRecommendationViews(result, state);
  $("#recommendations-note").textContent = "До трёх лучших доступных шагов для всей цели. Выбор навыка показывает отдельные занятия слева.";
  $("#recommendations").innerHTML = primary.length ? primary.map(item => recommendationCard(item, result)).join("")
    : `<p class="empty-state">${escapeHtml(describeBlockers(result))}</p>`;
  const prerequisites = result.prerequisiteSteps ?? [];
  $("#prerequisite-steps").innerHTML = prerequisites.length
    ? `<h3 class="subheading">Сначала подготовка</h3>${prerequisites.slice(0, 2).map(item => recommendationCard(item, result)).join("")}` : "";
  const stages = result.diagnostics?.stages ?? [];
  $("#recommendation-diagnostics").innerHTML = `<p>Проверка на ${escapeHtml(state.asOfDate)}. Каталог: ${state.events.length}; доступно для цели: ${result.diagnostics?.eligibleCount ?? 0}; показано в основном плане: ${primary.length}; для выбранного навыка: ${state.selectedSkillId ? skillRelated.length : "не выбран"}.</p><ol>${stages.map(stage => `<li>${escapeHtml(stage.label)}: ${stage.before} → ${stage.remaining} (исключено ${stage.rejected})</li>`).join("")}</ol><p>Первый блокирующий фильтр определяет причину исключения. Прохождение правил не доказывает качество рекомендации.</p>`;
  $("#coach-generate").disabled = Boolean(coachRequest) || !result.targetProfile;
}

function renderCareerOptions(employee, goal, result) {
  const container = $("#career-options");
  const paths = rankCareerOptions({ employee, roleProfiles: state.roleProfiles, effectiveSkills: employee.skills });
  const alternatives = paths
    .filter(path => !goal || path.role !== goal.target_role || path.grade !== goal.target_grade)
    .slice(0, 3);
  if (!alternatives.length) {
    container.innerHTML = '<p class="empty-state">Для этой роли нет следующего грейда или соседнего пути в кейсе.</p>';
    return;
  }

  container.innerHTML = alternatives.map(path => {
    const label = path.pathType === "upward" ? "Следующий грейд" : "Смежная роль";
    const skillNames = new Map(state.skills.map(skill => [skill.skill_id, skill.name]));
    const missing = path.missingSkills.slice(0, 2).map(skill => skillNames.get(skill.skill_id) ?? skill.skill_id).join(", ");
    const gapText = missing ? `Ближайшие разрывы: ${missing}` : "Все требования покрыты по оценке в профиле";
    return `
      <article class="career-option">
        <div><span class="career-option-kind">${label}</span><h4>${path.role} · ${path.grade}</h4><p>${path.readinessPercent}% навыков уже на нужном уровне · ${gapText}</p><small>Вакансии в датасете не описаны</small></div>
        <button class="path-action" data-goal-role="${path.role}" data-goal-grade="${path.grade}" aria-label="Рассмотреть путь ${path.role} ${path.grade}">Сравнить</button>
      </article>`;
  }).join("");
}

function render() {
  const employee = getEmployee();
  if (!employee) return;
  const goal = getGoal(employee);
  const history = getHistory(employee);
  const result = rankLearningActivities({
    employee: goal ? { ...employee, career_goal: goal } : employee,
    events: state.events,
    roleProfiles: state.roleProfiles,
    skills: state.skills,
    history,
    asOfDate: state.asOfDate,
    limit: state.events.length
  });
  currentResult = result;
  const optionsResult = { effectiveSkills: result.effectiveSkills };

  $(".sidebar-bottom b").textContent = employee.full_name;
  $(".sidebar-bottom small").textContent = `${employee.role} · ${employee.grade}`;
  $(".avatar").textContent = employee.full_name.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase();
  renderJourney(employee, goal, result);
  renderSkillRows(employee, result);
  renderActivities(result);
  renderCareerOptions(employee, goal, optionsResult);
}

function selectSkill(skillId) {
  const fromRadar = Boolean(document.activeElement.closest?.("#skill-radar"));
  state.selectedSkillId = skillId;
  state.activeEventId = null;
  render();
  const controls = fromRadar
    ? $("#skill-radar").querySelectorAll("[data-skill-id]")
    : $("#skill-list").querySelectorAll("[data-skill-id]");
  [...controls].find(control => control.dataset.skillId === skillId)?.focus({ preventScroll: true });
}

function scrollTo(element) {
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
  element?.scrollIntoView({ behavior, block: "center" });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

$("#employee-select").addEventListener("change", event => {
  state.selectedEmployeeId = event.target.value;
  resetContext();
  render();
});

$("#skill-list").addEventListener("click", event => {
  const button = event.target.closest("[data-skill-id]");
  if (button) selectSkill(button.dataset.skillId);
});

$("#skill-radar").addEventListener("click", event => {
  const selector = event.target.closest("[data-skill-id]");
  if (selector) selectSkill(selector.dataset.skillId);
});

$("#skill-radar").addEventListener("keydown", event => {
  const selector = event.target.closest("[data-skill-id]");
  if (selector && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    selectSkill(selector.dataset.skillId);
  }
});

$("#skill-focus").addEventListener("click", event => {
  if (event.target.closest("[data-clear-skill]")) {
    state.selectedSkillId = null;
    state.activeEventId = null;
    render();
    return;
  }
  const button = event.target.closest("[data-event-focus]");
  if (!button) return;
  state.activeEventId = button.dataset.eventFocus;
  render();
  const recommendation = $("#focused-event").querySelector("[data-event]");
  scrollTo(recommendation);
  recommendation?.querySelector(".rec-action")?.focus({ preventScroll: true });
});

$("#career-options").addEventListener("click", event => {
  const button = event.target.closest("[data-goal-role]");
  if (!button) return;
  const employee = getEmployee();
  const goal = { target_role: button.dataset.goalRole, target_grade: button.dataset.goalGrade };
  state.goalOverrides.set(employee.employee_id, goal);
  resetContext();
  render();
  showToast(`Показываю требования: ${goal.target_role} · ${goal.target_grade}`);
});

function handleRecommendationClick(event) {
  const skillButton = event.target.closest("[data-skill-focus]");
  if (skillButton) {
    selectSkill(skillButton.dataset.skillFocus);
    scrollTo($("#skills"));
    return;
  }
  const button = event.target.closest("[data-complete]");
  if (!button) return;
  const employee = getEmployee();
  const current = state.simulatedHistory.get(employee.employee_id) ?? [];
  const eventId = button.dataset.complete;
  const eligible = [...currentResult.recommendations, ...(currentResult.prerequisiteSteps ?? [])];
  if (!eligible.some(item => item.event.event_id === eventId)) return;
  const existing = state.history.concat(current);
  const hasCompleted = existing.some(row => row.employee_id === employee.employee_id
    && row.event_id === eventId && row.status === "completed");
  if (hasCompleted && eventId !== "EV_036") return;

  current.push({ employee_id: employee.employee_id, event_id: eventId, date: state.asOfDate, status: "completed" });
  state.simulatedHistory.set(employee.employee_id, current);
  state.activeEventId = null;
  clearCoach();
  render();
  showToast("Симуляция завершения сохранена в этой вкладке; рост навыка нужно подтвердить.");
}

for (const selector of ["#recommendations", "#focused-event", "#prerequisite-steps"]) {
  $(selector).addEventListener("click", handleRecommendationClick);
}

$("#coach-generate").addEventListener("click", async () => {
  clearCoach();
  const request = new AbortController();
  coachRequest = request;
  const employee = getEmployee();
  $("#coach-generate").disabled = true;
  $("#coach-status").textContent = "Коуч изучает профиль и проверяет план…";
  const timeout = window.setTimeout(() => request.abort(), 65000);
  try {
    const response = await fetch("/api/coach", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: employee.employee_id, goal: getGoal(employee) ?? null }), signal: request.signal
    });
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("AI-сервер не запущен. Запусти node server.mjs вместо статического сервера.");
    }
    const plan = await response.json();
    if (coachRequest !== request) return;
    const statusMessage = plan.status === "ready" ? (plan.steps?.length ? "AI-план проверен по каталогу и реальной истории. Расчётные эффекты не заменяют оценку." : plan.message)
      : plan.status === "unconfigured" ? "AI недоступен: на сервере не настроен OPENAI_API_KEY. Основные рекомендации работают по правилам датасета."
      : plan.message || "Не удалось получить проверенный план. Основные рекомендации остаются доступны.";
    $("#coach-status").textContent = statusMessage;
    $("#coach-plan").innerHTML = plan.status === "ready" ? (plan.steps ?? []).map(step => {
      const event = state.events.find(item => item.event_id === step.eventId);
      const session = step.nextSession ? `Следующая сессия: ${formatDate(step.nextSession)}` : "Самостоятельно · без сессии";
      return `<article class="rec-item"><h4>${escapeHtml(event?.title ?? step.eventId)}</h4><p class="rec-reason">${escapeHtml(step.explanation)}</p><p class="rec-date">${escapeHtml(step.durationHours)} ч · ${escapeHtml(session)} · по данным на ${escapeHtml(state.asOfDate)}</p><details class="evidence-details"><summary>Источники</summary><p>${escapeHtml((step.evidence ?? []).join(" · "))}</p></details></article>`;
    }).join("") : "";
    const trace = (plan.trace ?? []).map(item => `${item.tool}: ${item.status}`);
    if (plan.runId) trace.push(`Запуск: ${plan.runId} · ${plan.terminationReason ?? plan.status}`);
    $("#coach-trace").replaceChildren(...trace.map(text => {
      const item = document.createElement("li"); item.textContent = text; return item;
    }));
  } catch (error) {
    if (coachRequest !== request) return;
    $("#coach-status").textContent = error.name === "AbortError" ? "Время ожидания AI истекло. Основной план доступен." : error.message;
  } finally {
    window.clearTimeout(timeout);
    if (coachRequest === request) { coachRequest = null; $("#coach-generate").disabled = !currentResult.targetProfile; }
  }
});

function renderHrSummary() {
  const summary = summarizeCompetencyGaps(state);
  $("#hr-summary").textContent = `${summary.employeeCount} сотрудников · ${summary.withTargetCount} с целью и требованиями · ${summary.missingGoalCount} без цели · ${summary.missingTargetCount} без профиля требований. В таблице число сотрудников, чья оценка ниже цели, и число тех, кому нужен навык.`;
  $("#hr-gaps").innerHTML = summary.gaps.slice(0, 5).map(gap => `<tr><th scope="row">${escapeHtml(gap.name)} <small>${escapeHtml(gap.skillId)}</small></th><td>${gap.affectedCount}</td><td>${gap.requiredCount}</td><td>${gap.totalGapLevels} уровней</td></tr>`).join("");
}

async function start() {
  const [employeeData, eventData, skillData, historyResponse] = await Promise.all([
    fetchJson("employees.json"),
    fetchJson("events.json"),
    fetchJson("skills.json"),
    fetch(`${DATA_ROOT}activity_history.csv`)
  ]);
  if (!historyResponse.ok) throw new Error(`Не удалось загрузить журнал: HTTP ${historyResponse.status}`);
  state.employees = employeeData.employees;
  state.events = eventData.events;
  state.roleProfiles = skillData.role_profiles;
  state.skills = skillData.skills;
  state.history = parseCsv(await historyResponse.text());
  state.asOfDate = employeeData.meta.as_of_date;
  state.selectedEmployeeId = state.employees.some(employee => employee.employee_id === "E0101")
    ? "E0101"
    : state.employees[0]?.employee_id;
  fillEmployeePicker();
  renderHrSummary();
  render();
}

start().catch(error => {
  console.error("Career Quest data load failed", error);
  $("#recommendations").innerHTML = '<p class="empty-state">Не удалось загрузить данные кейса. Проверь запуск локального сервера и файлы в data/career_quest.</p>';
  $("#skills-note").textContent = error.message;
});
