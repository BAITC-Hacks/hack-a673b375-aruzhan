const RECURRING_EVENT_IDS = new Set(["EV_036"]);
const ACTIVE_STATUSES = new Set(["in_progress"]);
const GRADE_ORDER = ["Junior", "Middle", "Senior", "Lead"];

function profileFor(roleProfiles, role, grade) {
  return roleProfiles.find(profile => profile.role === role && profile.grade === grade) ?? null;
}

function skillMap(skills) {
  return new Map(skills.map(skill => [skill.skill_id, skill]));
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some(value => value !== "")) rows.push(row);
  }

  if (rows.length < 2) return [];
  const [rawHeaders, ...records] = rows;
  const headers = rawHeaders.map((header, index) => index === 0 ? header.replace(/^\uFEFF/, "") : header);
  return records.map(values => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ""])
  ));
}

export function deriveEffectiveSkills({ employee, events, history, asOfDate }) {
  const levels = { ...employee.skills };
  const lastReviewDate = employee.last_review_date;
  if (!lastReviewDate) return levels;

  const eventById = new Map(events.map(event => [event.event_id, event]));
  const postReviewCompletions = history
    .filter(record => record.employee_id === employee.employee_id
      && record.status === "completed"
      && record.date > lastReviewDate
      && (!asOfDate || record.date <= asOfDate))
    .sort((left, right) => left.date.localeCompare(right.date)
      || left.event_id.localeCompare(right.event_id));

  for (const record of postReviewCompletions) {
    const event = eventById.get(record.event_id);
    for (const development of event?.develops_skills ?? []) {
      const current = levels[development.skill_id] ?? 0;
      levels[development.skill_id] = Math.max(
        current,
        Math.min(development.max_level, current + development.gain)
      );
    }
  }
  return levels;
}

function completionProgress(profile, levels) {
  const total = Object.values(profile.required_skills).reduce((sum, level) => sum + level, 0);
  const earned = Object.entries(profile.required_skills).reduce(
    (sum, [skillId, required]) => sum + Math.min(required, levels[skillId] ?? 0), 0
  );
  return { earned, total, percent: total === 0 ? 100 : Math.round(earned / total * 100) };
}

function eligibleSession(event, asOfDate, eventHistory = []) {
  if (event.format === "self_paced") return null;
  const latestRecordedDate = eventHistory.map(record => record.date)
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort()
    .at(-1);
  const cutoff = latestRecordedDate && latestRecordedDate >= asOfDate ? latestRecordedDate : asOfDate;
  const exclusive = latestRecordedDate && latestRecordedDate >= asOfDate;
  return (event.upcoming_sessions ?? [])
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)
      && (exclusive ? date > cutoff : date >= cutoff))
    .sort()[0] ?? undefined;
}

function latestStatusesByEvent(history, employeeId) {
  const latest = new Map();
  history
    .filter(record => record.employee_id === employeeId)
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date)
      || (left.record_id ?? "").localeCompare(right.record_id ?? ""))
    .forEach(record => latest.set(record.event_id, record.status));
  return latest;
}

function getImprovements(event, targetProfile, levels, skillById) {
  const required = targetProfile.required_skills;
  const critical = new Set(targetProfile.critical_skills ?? []);
  return (event.develops_skills ?? []).flatMap(development => {
    const skillId = development.skill_id;
    if (!(skillId in required)) return [];
    const current = levels[skillId] ?? 0;
    const afterEvent = Math.max(current, Math.min(development.max_level, current + development.gain));
    const levelAfter = Math.min(required[skillId], afterEvent);
    const levelBefore = Math.min(required[skillId], current);
    const gain = levelAfter - levelBefore;
    if (gain <= 0) return [];
    return [{
      skill_id: skillId,
      name: skillById.get(skillId)?.name ?? skillId,
      current,
      afterEvent,
      requirement: required[skillId],
      gain,
      critical: critical.has(skillId)
    }];
  });
}

function compareActivities(left, right) {
  return right.factors.criticalLevels - left.factors.criticalLevels
    || right.factors.skillsAdvanced - left.factors.skillsAdvanced
    || right.factors.totalLevels - left.factors.totalLevels
    || left.factors.participationFriction - right.factors.participationFriction
    || right.factors.gainPerHour - left.factors.gainPerHour
    || left.event.duration_hours - right.event.duration_hours
    || (left.nextSession ?? "9999-12-31").localeCompare(right.nextSession ?? "9999-12-31")
    || left.event.event_id.localeCompare(right.event.event_id);
}

const FILTER_LABELS = {
  mandatory: "Обязательное обучение назначает HR",
  role_mismatch: "Не соответствует текущей роли",
  grade_mismatch: "Не соответствует текущему грейду",
  in_progress: "Уже проходит обучение",
  already_completed: "Уже завершено; повтор не разрешён",
  prerequisites: "Не достигнуты требования для участия",
  no_session: "Нет доступной будущей сессии",
  no_target_gain: "Не сокращает оставшиеся разрывы по цели"
};

function participationContext(event, improvements, personHistory, eventById) {
  const relevantSkills = new Set(improvements.map(item => item.skill_id));
  const related = personHistory.filter(record => {
    const previous = eventById.get(record.event_id);
    return record.event_id === event.event_id || (previous?.type === event.type
      && previous?.develops_skills?.some(item => relevantSkills.has(item.skill_id)));
  });
  return {
    records: related,
    friction: related.filter(record => ["no_show", "dropped", "declined"].includes(record.status)).length,
    completed: related.filter(record => record.status === "completed").length
  };
}

function makeRecommendation(event, improvements, nextSession, context) {
  const { employee, targetProfile, effectiveSkills, personHistory, eventById, asOfDate } = context;
  const participation = participationContext(event, improvements, personHistory, eventById);
  const totalLevels = improvements.reduce((sum, improvement) => sum + improvement.gain, 0);
  const criticalLevels = improvements.filter(item => item.critical).reduce((sum, item) => sum + item.gain, 0);
  const factors = {
    criticalLevels,
    skillsAdvanced: improvements.length,
    totalLevels,
    participationFriction: participation.friction,
    gainPerHour: totalLevels / Math.max(Number(event.duration_hours) || 0, 1)
  };
  const criticalNames = improvements.filter(item => item.critical).map(item => item.name);
  const reasons = [];
  if (criticalNames.length) reasons.push(`Продвигает критичный навык: ${criticalNames.join(", ")}`);
  reasons.push(`Улучшает ${improvements.length} навыка по цели ${targetProfile.role} · ${targetProfile.grade}`);
  reasons.push(`История похожих активностей: завершено ${participation.completed}; пропусков, отказов или прекращений — ${participation.friction}`);
  const prerequisites = Object.entries(event.prerequisites ?? {}).map(([id, required]) =>
    `${id}: расчётный уровень ${effectiveSkills[id] ?? 0} ≥ ${required}`);
  const gainInputs = personHistory.filter(record => record.status === "completed"
    && employee.last_review_date && record.date > employee.last_review_date && record.date <= asOfDate);
  const references = [
    `employees.json#${employee.employee_id}`,
    `skills.json#role_profiles/${targetProfile.role}/${targetProfile.grade}`,
    `events.json#${event.event_id}`,
    ...improvements.map(item => `skills.json#${item.skill_id}`),
    ...[...participation.records, ...gainInputs].filter(record => record.record_id)
      .map(record => `activity_history.csv#${record.record_id}`)
  ];
  return {
    event, improvements, nextSession, factors, reasons,
    evidence: {
      references: [...new Set(references)],
      eligibility: [
        `Текущая роль ${employee.role} входит в target_roles`,
        `Текущий грейд ${employee.grade} входит в target_grades`,
        "Добровольная активность; нет текущего незавершённого участия",
        RECURRING_EVENT_IDS.has(event.event_id) ? "Повтор разрешён для регулярного клуба EV_036" : "В истории нет завершения этой активности",
        prerequisites.length ? `Требования к участию: ${prerequisites.join("; ")}` : "Предварительных требований нет",
        nextSession === null ? "Формат self_paced: доступно без сессии" : `Доступная сессия: ${nextSession}`
      ],
      ranking: [
        `Цель: ${targetProfile.role} · ${targetProfile.grade}`,
        ...improvements.map(item => `${item.name}: ${item.current} → ${item.afterEvent}, требуется ${item.requirement}; прогноз +${item.gain} к закрытию разрыва`),
        `Критичных уровней: ${criticalLevels}; навыков: ${improvements.length}; уровней: ${totalLevels}`,
        `Среди равных по разрывам вариантов ниже приоритет при пропусках, отказах или прекращениях похожих активностей: ${participation.friction}`,
        `Длительность: ${event.duration_hours} ч; расчётное закрытие разрыва в час: ${Number(factors.gainPerHour.toFixed(3))}`,
        "Рост по gain/max_level — расчёт датасета, не новая оценка навыка"
      ]
    }
  };
}

export function rankLearningActivities({ employee, events, roleProfiles, skills, history, asOfDate, limit = 3 }) {
  const goal = employee.career_goal;
  const targetProfile = goal && profileFor(roleProfiles, goal.target_role, goal.target_grade);
  const assessedSkills = { ...employee.skills };
  const effectiveSkills = deriveEffectiveSkills({ employee, events, history, asOfDate });
  const diagnostics = { initialCount: events.length, eligibleCount: 0, stages: [], blockers: [], rejectedEvents: [] };
  if (!targetProfile) {
    return {
      status: goal ? "target_profile_missing" : "career_goal_missing",
      targetProfile: null, assessedSkills, effectiveSkills, assessedProgress: null,
      progress: null, skillGaps: [], recommendations: [], prerequisiteSteps: [], diagnostics
    };
  }

  const skillById = skillMap(skills);
  const skillGaps = Object.entries(targetProfile.required_skills)
    .map(([skillId, required]) => ({
      skillId, required, current: effectiveSkills[skillId] ?? 0,
      assessed: assessedSkills[skillId] ?? 0,
      name: skillById.get(skillId)?.name ?? skillId,
      critical: (targetProfile.critical_skills ?? []).includes(skillId)
    }))
    .filter(gap => gap.current < gap.required);
  const personHistory = history.filter(record => record.employee_id === employee.employee_id);
  const completedEventIds = new Set(personHistory.filter(record => record.status === "completed").map(record => record.event_id));
  const latestStatuses = latestStatusesByEvent(history, employee.employee_id);
  const eventById = new Map(events.map(event => [event.event_id, event]));
  const context = { employee, targetProfile, effectiveSkills, personHistory, eventById, asOfDate };
  const candidates = events.map(event => {
    const missingPrerequisites = Object.entries(event.prerequisites ?? {})
      .filter(([id, minimum]) => (effectiveSkills[id] ?? 0) < minimum)
      .map(([skillId, required]) => ({ skillId, current: effectiveSkills[skillId] ?? 0, required }));
    const eventHistory = personHistory.filter(record => record.event_id === event.event_id);
    return {
      event, missingPrerequisites,
      nextSession: eligibleSession(event, asOfDate, eventHistory),
      improvements: getImprovements(event, targetProfile, effectiveSkills, skillById)
    };
  });
  const filters = [
    ["mandatory", item => !item.event.mandatory],
    ["role_mismatch", item => item.event.target_roles?.includes(employee.role)],
    ["grade_mismatch", item => item.event.target_grades?.includes(employee.grade)],
    ["in_progress", item => !ACTIVE_STATUSES.has(latestStatuses.get(item.event.event_id))],
    ["already_completed", item => !completedEventIds.has(item.event.event_id) || RECURRING_EVENT_IDS.has(item.event.event_id)],
    ["prerequisites", item => item.missingPrerequisites.length === 0],
    ["no_session", item => item.nextSession !== undefined],
    ["no_target_gain", item => item.improvements.length > 0]
  ];
  let remaining = candidates;
  for (const [code, accepts] of filters) {
    const before = remaining.length;
    const rejected = remaining.filter(item => !accepts(item));
    remaining = remaining.filter(accepts);
    diagnostics.stages.push({ code, label: FILTER_LABELS[code], before, remaining: remaining.length, rejected: rejected.length });
    if (rejected.length) diagnostics.blockers.push({ code, label: FILTER_LABELS[code], count: rejected.length });
    diagnostics.rejectedEvents.push(...rejected.map(item => ({
      eventId: item.event.event_id, code, label: FILTER_LABELS[code],
      ...(code === "prerequisites" ? { missingPrerequisites: item.missingPrerequisites } : {})
    })));
  }
  diagnostics.eligibleCount = remaining.length;
  const recommendations = remaining.map(item =>
    makeRecommendation(item.event, item.improvements, item.nextSession, context)
  ).sort(compareActivities).slice(0, Math.max(0, limit));

  // A prerequisite is a conditional first step, not an invitation to book the advanced course.
  // It must be eligible now and fully satisfy all of that course's missing prerequisites.
  const blockedCourses = candidates.filter(item => item.missingPrerequisites.length > 0
    && filters.every(([code, accepts]) => code === "prerequisites" || accepts(item)));
  const prerequisites = candidates.flatMap(item => {
    if (!filters.every(([code, accepts]) => code === "no_target_gain" || accepts(item))) return [];
    if (recommendations.some(recommendation => recommendation.event.event_id === item.event.event_id)) return [];
    const projected = { ...effectiveSkills };
    for (const development of item.event.develops_skills ?? []) {
      const current = projected[development.skill_id] ?? 0;
      projected[development.skill_id] = Math.max(current, Math.min(development.max_level, current + development.gain));
    }
    const unlocks = blockedCourses.filter(blocked => blocked.missingPrerequisites.every(missing =>
      (projected[missing.skillId] ?? 0) >= missing.required));
    if (!unlocks.length) return [];
    const requiredSkills = {};
    for (const blocked of unlocks) {
      for (const missing of blocked.missingPrerequisites) {
        requiredSkills[missing.skillId] = Math.max(requiredSkills[missing.skillId] ?? 0, missing.required);
      }
    }
    const improvements = getImprovements(item.event,
      { required_skills: requiredSkills, critical_skills: [] }, effectiveSkills, skillById);
    if (!improvements.length) return [];
    const recommendation = makeRecommendation(item.event, improvements, item.nextSession, context);
    recommendation.kind = "prerequisite";
    recommendation.requiresReassessment = true;
    recommendation.unlocks = unlocks.map(blocked => ({
      eventId: blocked.event.event_id, title: blocked.event.title,
      missingPrerequisites: blocked.missingPrerequisites
    }));
    recommendation.reasons = [
      `Подготовительный шаг для: ${unlocks.map(blocked => blocked.event.title).join(", ")}`,
      "После завершения подтвердите навыки и повторно проверьте доступные сессии следующего курса"
    ];
    recommendation.evidence.references.push(...unlocks.map(blocked => `events.json#${blocked.event.event_id}`));
    recommendation.evidence.ranking.unshift("Разрыв относится к требованиям участия в следующем курсе, а не напрямую к карьерной цели");
    return [recommendation];
  }).sort(compareActivities).slice(0, Math.max(0, limit));

  return {
    status: skillGaps.length === 0 ? "requirements_met" : remaining.length ? "ready" : "no_eligible_activities",
    targetProfile, assessedSkills, effectiveSkills,
    assessedProgress: completionProgress(targetProfile, assessedSkills),
    progress: completionProgress(targetProfile, effectiveSkills),
    skillGaps, recommendations, prerequisiteSteps: prerequisites, diagnostics
  };
}

export function rankCareerOptions({ employee, roleProfiles, effectiveSkills = employee.skills }) {
  const currentGradeIndex = GRADE_ORDER.indexOf(employee.grade);
  const nextGrade = GRADE_ORDER[currentGradeIndex + 1];
  const profiles = roleProfiles.filter(profile =>
    (profile.grade === employee.grade && profile.role !== employee.role)
    || (profile.role === employee.role && profile.grade === nextGrade)
  );

  return profiles.map(profile => {
    const required = Object.entries(profile.required_skills);
    const missing = required.flatMap(([skillId, target]) => {
      const current = effectiveSkills[skillId] ?? 0;
      return current >= target ? [] : [{ skill_id: skillId, current, target, gap: target - current }];
    });
    const critical = new Set(profile.critical_skills ?? []);
    const criticalGaps = missing.filter(skill => critical.has(skill.skill_id)).length;
    const readinessPercent = required.length
      ? Math.round((required.length - missing.length) / required.length * 100)
      : 100;
    return {
      role: profile.role,
      grade: profile.grade,
      pathType: profile.role === employee.role ? "upward" : "lateral",
      readinessPercent,
      criticalGaps,
      totalGapLevels: missing.reduce((sum, skill) => sum + skill.gap, 0),
      missingSkills: missing,
      openingStatus: "unknown"
    };
  }).sort((left, right) => right.readinessPercent - left.readinessPercent
    || left.criticalGaps - right.criticalGaps
    || left.totalGapLevels - right.totalGapLevels
    || left.pathType.localeCompare(right.pathType)
    || left.role.localeCompare(right.role));
}

