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

export function deriveEffectiveSkills({ employee, events, history }) {
  const levels = { ...employee.skills };
  const lastReviewDate = employee.last_review_date;
  if (!lastReviewDate) return levels;

  const eventById = new Map(events.map(event => [event.event_id, event]));
  const postReviewCompletions = history
    .filter(record => record.employee_id === employee.employee_id
      && record.status === "completed"
      && record.date > lastReviewDate)
    .sort((left, right) => left.date.localeCompare(right.date)
      || left.event_id.localeCompare(right.event_id));

  for (const record of postReviewCompletions) {
    const event = eventById.get(record.event_id);
    for (const development of event?.develops_skills ?? []) {
      const current = levels[development.skill_id] ?? 0;
      levels[development.skill_id] = Math.min(
        development.max_level,
        current + development.gain
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

function eligibleSession(event, asOfDate) {
  if (event.format === "self_paced") return null;
  return (event.upcoming_sessions ?? [])
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= asOfDate)
    .sort()[0] ?? undefined;
}

function getImprovements(event, targetProfile, levels, skillById) {
  const required = targetProfile.required_skills;
  const critical = new Set(targetProfile.critical_skills ?? []);
  return (event.develops_skills ?? []).flatMap(development => {
    const skillId = development.skill_id;
    if (!(skillId in required)) return [];
    const current = levels[skillId] ?? 0;
    const afterEvent = Math.min(development.max_level, current + development.gain);
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
    || right.factors.gainPerHour - left.factors.gainPerHour
    || left.event.duration_hours - right.event.duration_hours
    || (left.nextSession ?? "9999-12-31").localeCompare(right.nextSession ?? "9999-12-31")
    || left.event.event_id.localeCompare(right.event.event_id);
}

export function rankLearningActivities({ employee, events, roleProfiles, skills, history, asOfDate, limit = 3 }) {
  const goal = employee.career_goal;
  const targetProfile = goal && profileFor(roleProfiles, goal.target_role, goal.target_grade);
  const effectiveSkills = deriveEffectiveSkills({ employee, events, history });
  if (!targetProfile) {
    return {
      status: goal ? "target_profile_missing" : "career_goal_missing",
      targetProfile: null,
      effectiveSkills,
      progress: null,
      skillGaps: [],
      recommendations: []
    };
  }

  const gaps = Object.entries(targetProfile.required_skills)
    .map(([skillId, required]) => ({ skillId, required, current: effectiveSkills[skillId] ?? 0 }))
    .filter(gap => gap.current < gap.required);
  const roleAudience = new Set([employee.role, goal.target_role]);
  const completedEventIds = new Set(history
    .filter(record => record.employee_id === employee.employee_id && record.status === "completed")
    .map(record => record.event_id));
  const activeEventIds = new Set(history
    .filter(record => record.employee_id === employee.employee_id && ACTIVE_STATUSES.has(record.status))
    .map(record => record.event_id));
  const skillById = skillMap(skills);

  const recommendations = events.flatMap(event => {
    if (event.mandatory) return [];
    if (!event.target_roles?.some(role => roleAudience.has(role))) return [];
    if (!event.target_grades?.includes(employee.grade)) return [];
    if (activeEventIds.has(event.event_id)) return [];
    if (completedEventIds.has(event.event_id) && !RECURRING_EVENT_IDS.has(event.event_id)) return [];

    const prerequisitesMet = Object.entries(event.prerequisites ?? {})
      .every(([skillId, minimum]) => (effectiveSkills[skillId] ?? 0) >= minimum);
    if (!prerequisitesMet) return [];

    const nextSession = eligibleSession(event, asOfDate);
    if (nextSession === undefined) return [];
    const improvements = getImprovements(event, targetProfile, effectiveSkills, skillById);
    if (improvements.length === 0) return [];

    const totalLevels = improvements.reduce((sum, improvement) => sum + improvement.gain, 0);
    const criticalLevels = improvements
      .filter(improvement => improvement.critical)
      .reduce((sum, improvement) => sum + improvement.gain, 0);
    const hours = Math.max(Number(event.duration_hours) || 0, 1);
    const factors = {
      criticalLevels,
      skillsAdvanced: improvements.length,
      totalLevels,
      gainPerHour: totalLevels / hours
    };
    const reasons = [];
    const criticalNames = improvements.filter(improvement => improvement.critical).map(item => item.name);
    if (criticalNames.length) reasons.push(`Продвигает критичный навык: ${criticalNames.join(", ")}`);
    reasons.push(`Улучшает ${improvements.length} навыка по цели ${goal.target_role} · ${goal.target_grade}`);
    return [{ event, improvements, nextSession, factors, reasons }];
  }).sort(compareActivities).slice(0, Math.max(0, limit));

  return {
    status: recommendations.length ? "ready" : "no_eligible_activities",
    targetProfile,
    effectiveSkills,
    progress: completionProgress(targetProfile, effectiveSkills),
    skillGaps: gaps.map(gap => ({
      ...gap,
      name: skillById.get(gap.skillId)?.name ?? gap.skillId,
      critical: (targetProfile.critical_skills ?? []).includes(gap.skillId)
    })),
    recommendations
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

