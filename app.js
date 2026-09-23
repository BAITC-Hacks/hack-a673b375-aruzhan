const employee = {
  id: "E0101", name: "Сергей Морозов", role: "Backend Engineer", grade: "Junior",
  goal: "Backend Engineer", targetGrade: "Middle", progress: 14, total: 33,
  skills: [
    ["Python", 1, 3, true], ["SQL", 0, 3, false], ["API Design", 0, 3, true],
    ["System Design", 0, 2, false], ["Cloud Platforms", 2, 2, false],
    ["Containers & Orchestration", 1, 2, false], ["CI/CD", 0, 2, false],
    ["Application Security", 1, 2, false], ["Observability", 2, 2, false],
    ["Communication", 1, 3, false], ["Teamwork", 2, 3, false],
    ["Problem Solving", 2, 3, false], ["Mentoring", 1, 1, false],
    ["Stakeholder Management", 1, 1, false], ["Public Speaking", 0, 1, false]
  ],
  // Completed activities from this employee's history are not recommended again.
  completedEvents: new Set(["EV_001", "EV_003", "EV_004"])
};

const recommendations = [
  {
    id: "EV_005", title: "System Design Fundamentals", type: "Курс", hours: 16, date: "23 ноября",
    reason: "Разовьёт system design и критичный для перехода API design.",
    gains: [["System Design", 0, 1], ["API Design", 0, 1]],
    roles: ["Backend Engineer", "Frontend Engineer", "QA Engineer"], grades: ["Junior", "Middle"]
  },
  {
    id: "EV_011", title: "Secure Coding Workshop", type: "Воркшоп", hours: 6, date: "23 ноября",
    reason: "Укрепит навык безопасной разработки для надёжного цифрового банкинга.",
    gains: [["Application Security", 1, 2]],
    roles: ["Backend Engineer", "Frontend Engineer", "QA Engineer"], grades: ["Junior", "Middle", "Senior", "Lead"]
  },
  {
    id: "EV_040", title: "Structured Problem Solving", type: "Воркшоп", hours: 4, date: "9 ноября",
    reason: "Закроет разрывы в problem solving и teamwork за короткую сессию.",
    gains: [["Problem Solving", 2, 3], ["Teamwork", 2, 3]],
    roles: ["Backend Engineer", "Frontend Engineer", "Data Analyst", "QA Engineer", "Product Manager", "HR Business Partner", "Sales Manager", "Customer Support Specialist"],
    grades: ["Junior", "Middle", "Senior", "Lead"]
  }
];

const skillList = document.querySelector("#skill-list");
const recList = document.querySelector("#recommendations");
let toastTimer;

function renderSkills() {
  skillList.innerHTML = employee.skills.map(([name, level, target, critical]) => `
    <div class="skill-row">
      <span class="skill-name ${critical ? "critical" : ""}" title="${name}">${name}</span>
      <div class="skill-meter" role="img" aria-label="${name}: уровень ${level} из ${target}">
        <span class="skill-target" style="width:${Math.min(target / 5 * 100, 100)}%"></span>
        <span class="skill-current" style="width:${Math.min(level / 5 * 100, 100)}%"></span>
      </div>
      <span class="skill-level">${level} / ${target}</span>
    </div>`).join("");
  const gaps = employee.skills.filter(([, level, target]) => level < target).length;
  document.querySelector("#gap-count").textContent = `${gaps} навыков в фокусе`;
  const percent = Math.round(employee.progress / employee.total * 100);
  document.querySelector("#progress-percent").textContent = `${percent}%`;
  document.querySelector("#progress-fraction").textContent = `${employee.progress} из ${employee.total}`;
  document.querySelector("#track-progress").style.width = `${percent}%`;
}

function eligible(event) {
  return event.roles.includes(employee.role) && event.grades.includes(employee.grade) && !employee.completedEvents.has(event.id);
}

function renderRecommendations() {
  const available = recommendations.filter(eligible);
  recList.innerHTML = available.length ? available.map(event => `
    <article class="rec-item" data-event="${event.id}">
      <div class="rec-top"><h3>${event.title}</h3><span class="rec-duration">${event.type} · ${event.hours} ч</span></div>
      <p class="rec-reason">${event.reason}</p>
      <div class="rec-gains">${event.gains.map(([name, before, after]) => `<span class="gain-chip">${name} <strong>${before} → ${after}</strong></span>`).join("")}</div>
      <div class="rec-bottom"><span class="rec-date">Следующая сессия · ${event.date}</span><button class="rec-action" data-complete="${event.id}">Смоделировать шаг</button></div>
    </article>`).join("") : `<div class="empty-state">Все предложенные шаги пройдены. Навыки можно подтвердить практикой или оценкой.</div>`;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
}

recList.addEventListener("click", event => {
  const button = event.target.closest("[data-complete]");
  if (!button) return;
  const item = recommendations.find(rec => rec.id === button.dataset.complete);
  if (!item || !eligible(item)) return;

  employee.completedEvents.add(item.id);
  let addedLevels = 0;
  for (const [name, before, after] of item.gains) {
    const skill = employee.skills.find(entry => entry[0] === name);
    if (!skill) continue;
    const actualGain = Math.min(skill[2] - skill[1], Math.max(0, after - before));
    skill[1] += actualGain;
    addedLevels += actualGain;
  }
  employee.progress = Math.min(employee.total, employee.progress + addedLevels);
  renderSkills();
  renderRecommendations();
  showToast(`Симуляция: +${addedLevels} уровня навыков. Рост ещё нужно подтвердить.`);
});

renderSkills();
renderRecommendations();
