import { parseCsv, rankCareerOptions, rankLearningActivities } from "./recommendations.mjs";

const DATA_ROOT = "./data/career_quest/";
const EVENT_TYPE_LABELS = {
  course: "Курс", workshop: "Воркшоп", mentoring: "Наставничество",
  certification: "Сертификация", meetup: "Встреча", onboarding: "Адаптация"
};
const state = {
  employees: [], roleProfiles: [], skills: [], events: [], history: [], asOfDate: "",
  selectedEmployeeId: "E0101", goalOverrides: new Map(), simulatedHistory: new Map()
};
const $ = selector => document.querySelector(selector);

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
  if (!result.targetProfile) {
    list.innerHTML = '<p class="empty-state">Выбери один из вариантов карьерного пути, чтобы сравнить навыки.</p>';
    $("#skills-heading").textContent = "Навыки";
    $("#gap-count").textContent = "цель не выбрана";
    $("#skills-note").textContent = "Сначала выбери направление — тогда сравним твой профиль с требованиями роли.";
    return;
  }

  const required = result.targetProfile.required_skills;
  const critical = new Set(result.targetProfile.critical_skills ?? []);
  const skillById = new Map(state.skills.map(skill => [skill.skill_id, skill]));
  const entries = Object.entries(required).map(([id, target]) => ({
    id,
    name: skillById.get(id)?.name ?? id,
    level: result.effectiveSkills[id] ?? 0,
    target,
    critical: critical.has(id)
  }));
  list.innerHTML = entries.map(skill => `
    <div class="skill-row">
      <span class="skill-name ${skill.critical ? "critical" : ""}" title="${skill.name}">${skill.name}</span>
      <div class="skill-meter" role="img" aria-label="${skill.name}: уровень ${skill.level} из ${skill.target}">
        <span class="skill-target" style="width:${Math.min(skill.target / 5 * 100, 100)}%"></span>
        <span class="skill-current" style="width:${Math.min(skill.level / 5 * 100, 100)}%"></span>
      </div>
      <span class="skill-level">${skill.level} / ${skill.target}</span>
    </div>`).join("");

  $("#skills-heading").textContent = `Навыки для ${result.targetProfile.grade}`;
  $("#gap-count").textContent = `${result.skillGaps.length} навыков в фокусе`;
  $("#skills-note").textContent = employee.last_review_date
    ? `Последняя оценка — ${formatDate(employee.last_review_date)} Завершённые позже активности учтены отдельно.`
    : "Уровни из профиля; завершённое обучение после последней оценки учитывается отдельно.";
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

  const progress = result.progress;
  const percent = progress?.percent ?? 0;
  $("#progress-percent").textContent = progress ? `${percent}%` : "—";
  $("#progress-fraction").textContent = progress
    ? `${progress.earned} из ${progress.total}`
    : "сначала выбери цель";
  $("#track-progress").style.width = `${percent}%`;
}

function renderActivities(result) {
  const list = $("#recommendations");
  if (!result.targetProfile) {
    list.innerHTML = result.status === "career_goal_missing"
      ? '<p class="empty-state">Сначала выбери путь в разделе «Другие возможные пути».</p>'
      : '<p class="empty-state">Для этой роли и грейда нет профиля навыков в кейсе.</p>';
    return;
  }
  if (!result.recommendations.length) {
    list.innerHTML = '<p class="empty-state">В данных нет активности, которая подходит по роли, грейду, prerequisites и сессиям и при этом продвигает навык из твоей цели.</p>';
    return;
  }

  list.innerHTML = result.recommendations.map(item => {
    const event = item.event;
    const type = EVENT_TYPE_LABELS[event.type] ?? event.type;
    const sessionText = item.nextSession
      ? `Следующая сессия · ${formatDate(item.nextSession)}`
      : "Можно начать в любое время";
    const reasons = item.reasons.join(" · ");
    return `
      <article class="rec-item" data-event="${event.event_id}">
        <div class="rec-top"><h3>${event.title}</h3><span class="rec-duration">${type} · ${event.duration_hours} ч</span></div>
        <p class="rec-reason">${reasons}</p>
        <div class="rec-gains">${item.improvements.map(skill => `<span class="gain-chip">${skill.name} <strong>${skill.current} → ${skill.afterEvent}</strong>${skill.critical ? " · критичный" : ""}</span>`).join("")}</div>
        <div class="rec-bottom"><span class="rec-date">${sessionText}</span><button class="rec-action" data-complete="${event.event_id}" aria-label="Смоделировать завершение: ${event.title}">Смоделировать шаг</button></div>
      </article>`;
  }).join("");
}

function renderCareerOptions(employee, goal, result) {
  const container = $("#career-options");
  const paths = rankCareerOptions({ employee, roleProfiles: state.roleProfiles, effectiveSkills: result.effectiveSkills });
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
    const gapText = missing ? `Ближайшие разрывы: ${missing}` : "Все требования этого профиля подтверждены";
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
    asOfDate: state.asOfDate
  });
  const optionsResult = { effectiveSkills: result.effectiveSkills };

  $(".sidebar-bottom b").textContent = employee.full_name;
  $(".sidebar-bottom small").textContent = `${employee.role} · ${employee.grade}`;
  $(".avatar").textContent = employee.full_name.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase();
  renderJourney(employee, goal, result);
  renderSkillRows(employee, result);
  renderActivities(result);
  renderCareerOptions(employee, goal, optionsResult);
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
  render();
});

$("#career-options").addEventListener("click", event => {
  const button = event.target.closest("[data-goal-role]");
  if (!button) return;
  const employee = getEmployee();
  const goal = { target_role: button.dataset.goalRole, target_grade: button.dataset.goalGrade };
  state.goalOverrides.set(employee.employee_id, goal);
  render();
  showToast(`Показываю требования: ${goal.target_role} · ${goal.target_grade}`);
});

$("#recommendations").addEventListener("click", event => {
  const button = event.target.closest("[data-complete]");
  if (!button) return;
  const employee = getEmployee();
  const current = state.simulatedHistory.get(employee.employee_id) ?? [];
  const eventId = button.dataset.complete;
  const existing = state.history.concat(current);
  const hasCompleted = existing.some(row => row.employee_id === employee.employee_id
    && row.event_id === eventId && row.status === "completed");
  if (hasCompleted && eventId !== "EV_036") return;

  current.push({ employee_id: employee.employee_id, event_id: eventId, date: state.asOfDate, status: "completed" });
  state.simulatedHistory.set(employee.employee_id, current);
  render();
  showToast("Симуляция завершения сохранена в этой вкладке; рост навыка нужно подтвердить.");
});

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
  render();
}

start().catch(error => {
  console.error("Career Quest data load failed", error);
  $("#recommendations").innerHTML = '<p class="empty-state">Не удалось загрузить данные кейса. Проверь запуск локального сервера и файлы в data/career_quest.</p>';
  $("#skills-note").textContent = error.message;
});
