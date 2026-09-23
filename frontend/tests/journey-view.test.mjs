import test from "node:test";
import assert from "node:assert/strict";
import { relevantBlocker, visibleSteps, emptyMessage, blockerText, supportingRecords, stepCard } from "../src/journey-view.mjs";

const activity = (eventId, skillId, gain, maxLevel) => ({
  event_id: eventId,
  develops_skills: [{ skill_id: skillId, gain, max_level: maxLevel }]
});

test("locked checkpoint develops an actual remaining gap and ignores irrelevant or capped courses", () => {
  const events = [
    activity("EV_UNRELATED", "SK_OTHER", 2, 5),
    activity("EV_CAPPED", "SK_API", 2, 2),
    activity("EV_ZERO", "SK_API", 0, 5),
    activity("EV_RELEVANT", "SK_API", 1, 4)
  ];
  const result = {
    skillGaps: [{ skillId: "SK_API", current: 2, required: 4 }],
    diagnostics: { rejectedEvents: events.map(event => ({ eventId: event.event_id, code: "prerequisites" })) }
  };
  const before = structuredClone(result);
  assert.equal(relevantBlocker(result, events).event.event_id, "EV_RELEVANT");
  assert.deepEqual(result, before);
});

test("locked checkpoints prioritize a relevant prerequisite blocker over a missing session", () => {
  const events = [activity("EV_LATER", "SK_API", 1, 4), activity("EV_PREP", "SK_API", 1, 4)];
  const result = {
    skillGaps: [{ skillId: "SK_API", current: 2, required: 4 }],
    diagnostics: { rejectedEvents: [
      { eventId: "EV_LATER", code: "no_session" },
      { eventId: "EV_PREP", code: "prerequisites", missingPrerequisites: [{ skillId: "SK_BASIC", current: 1, required: 2 }] }
    ] }
  };
  const locked = relevantBlocker(result, events);
  assert.equal(locked.event.event_id, "EV_PREP");
  assert.match(blockerText(locked.blocker, [{ skill_id: "SK_BASIC", name: "Foundations" }]), /Foundations: 1 estimated, 2 required/);
});

test("no locked checkpoint is invented without gaps or an eligible blocker type", () => {
  const events = [activity("EV_1", "SK_API", 1, 5)];
  assert.equal(relevantBlocker({ skillGaps: [], diagnostics: { rejectedEvents: [{ eventId: "EV_1", code: "prerequisites" }] } }, events), null);
  assert.equal(relevantBlocker({ skillGaps: [{ skillId: "SK_API", current: 1, required: 3 }], diagnostics: { rejectedEvents: [{ eventId: "EV_1", code: "mandatory" }] } }, events), null);
});

test("checkpoints show the first three main recommendations without mixing in preparatory steps", () => {
  const recommendations = ["A", "B", "C", "D"].map(eventId => ({ event: { event_id: eventId } }));
  const prerequisites = [{ event: { event_id: "PREP" } }];
  assert.deepEqual(visibleSteps({ recommendations, prerequisiteSteps: prerequisites }), recommendations.slice(0, 3));
  assert.deepEqual(visibleSteps({ recommendations: recommendations.slice(0, 1), prerequisiteSteps: prerequisites }), recommendations.slice(0, 1));
});

test("checkpoints fall back to up to three valid prerequisite steps only when direct steps are absent", () => {
  const prerequisites = ["P1", "P2", "P3", "P4"].map(eventId => ({ event: { event_id: eventId } }));
  assert.deepEqual(visibleSteps({ recommendations: [], prerequisiteSteps: prerequisites }), prerequisites.slice(0, 3));
  assert.deepEqual(visibleSteps({ recommendations: [] }), []);
});

test("empty states distinguish missing goal, missing requirements, covered requirements and catalog gaps", () => {
  const statuses = ["career_goal_missing", "target_profile_missing", "requirements_met", "no_eligible_activities"];
  const messages = statuses.map(status => emptyMessage({ status }));
  assert.equal(new Set(messages).size, 4);
  assert.match(messages[0], /Choose a career goal/);
  assert.match(messages[1], /no requirements in the dataset/);
  assert.match(messages[2], /current estimate.*assessment/);
  assert.match(messages[3], /no eligible step.*blockers/);
});

function explanationFixture() {
  return {
    item: {
      event: {
        event_id: "EV_API", title: "API design & review", type: "workshop", duration_hours: 4,
        prerequisites: { SK_API: 1 }
      },
      kind: "direct",
      improvements: [{ skill_id: "SK_API", name: "API design", current: 1, afterEvent: 2, requirement: 3, critical: true }],
      nextSession: "2026-10-15",
      factors: { criticalLevels: 9871, skillsAdvanced: 9872, participationFriction: 9873, gainPerHour: 9874 },
      evidence: { references: ["events.json#EV_API", "employees.json#E0101", "skills.json#SK_API"] }
    },
    result: {
      targetProfile: { role: "Backend Developer", grade: "Middle", required_skills: { SK_API: 3 }, critical_skills: ["SK_API"] },
      effectiveSkills: { SK_API: 1 }, assessedSkills: { SK_API: 1 }, assessedProgress: { earned: 1, total: 3, percent: 33 }
    },
    skills: [{ skill_id: "SK_API", name: "API design" }],
    asOfDate: "2026-10-01"
  };
}

test("matching AI rationale is readable, escaped and separate from canonical event facts", () => {
  const fixture = explanationFixture();
  const before = structuredClone(fixture);
  const coachStep = {
    eventId: "EV_API", narrativeSource: "ai",
    whyThisStep: 'Review <script>alert("model")</script> API decisions with a peer & explain tradeoffs.',
    howToApply: 'Draft an API review <img src=x onerror=alert(1)> for a work task.',
    title: "INVENTED_EVENT_TITLE", durationHours: 9875, nextSession: "2035-01-01",
    improvements: [{ skill_id: "SK_API", afterEvent: 9876 }]
  };
  const html = stepCard(fixture.item, fixture.result, null, fixture.skills, fixture.asOfDate, coachStep);
  assert.match(html, /Why this helps/);
  assert.match(html, /Try it at work/);
  assert.match(html, /&lt;script&gt;alert\(&quot;model&quot;\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.match(html, /suggestion/i);
  assert.match(html, /outside.*catalog|not.*catalog/i);
  assert.match(html, /4 hours/);
  assert.match(html, /15 Oct 2026/);
  assert.match(html, /Target: 3/);
  assert.match(html, /class="gain-arrow"[^>]*>→<\/span>2/);
  assert.doesNotMatch(html, /INVENTED_EVENT_TITLE|9875|9876|2035/);
  assert.deepEqual(fixture, before, "rendering a rationale cannot change assessments or event facts");
});

test("stale or unverified AI prose is ignored while a useful deterministic explanation remains", () => {
  const { item, result, skills, asOfDate } = explanationFixture();
  const fallback = stepCard(item, result, null, skills, asOfDate);
  for (const coachStep of [
    { eventId: "EV_OLD", narrativeSource: "ai", whyThisStep: "STALE_RATIONALE", howToApply: "STALE_PRACTICE" },
    { eventId: "EV_API", narrativeSource: "unverified", whyThisStep: "UNVERIFIED_RATIONALE", howToApply: "UNVERIFIED_PRACTICE" }
  ]) {
    const html = stepCard(item, result, null, skills, asOfDate, coachStep);
    assert.doesNotMatch(html, /STALE_RATIONALE|STALE_PRACTICE|UNVERIFIED_RATIONALE|UNVERIFIED_PRACTICE/);
    assert.equal(html, fallback);
  }
  assert.match(fallback, /Why this helps/);
  assert.match(fallback, /API design/);
  assert.match(fallback, /Backend Developer/);
  assert.match(fallback, /Middle/);
});

test("recommendation explanations omit internal scoring jargon without dropping evidence or eligibility", () => {
  const { item, result, skills, asOfDate } = explanationFixture();
  const html = stepCard(item, result, null, skills, asOfDate);
  assert.doesNotMatch(html, /criticalLevels|participationFriction|gainPerHour|gain\/max_level|critical target levels|related missed, declined or dropped|9871|9872|9873|9874/);
  assert.match(html, /role.*grade|grade.*role/i);
  const startingRequirements = html.match(/<p class="prerequisite-line">([\s\S]*?)<\/p>/)?.[1];
  assert.ok(startingRequirements, "starting skill requirements remain visible");
  assert.match(startingRequirements, /learning estimate/i);
  assert.match(startingRequirements, /API design 1\/1/);
  assert.match(html, /View supporting records/);
  assert.match(html, /events\.json#EV_API/);
});

test("supporting records are optional closed details and escape unfamiliar record references", () => {
  const references = [
    "employees.json#E0101",
    "events.json#EV_API",
    'custom.json#<img src=x onerror="alert(1)">&record'
  ];
  const html = supportingRecords(references);
  assert.match(html, /<details\b[^>]*>/);
  assert.match(html, /<summary[^>]*>View supporting records<\/summary>/);
  assert.doesNotMatch(html, /<details\b[^>]*\sopen(?:\s|=|>)/);
  assert.match(html, /employees\.json#E0101/);
  assert.match(html, /events\.json#EV_API/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&amp;record/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /employee|profile/i, "known record sources should have understandable labels");
});

test("catalog and target names cannot become HTML through deterministic fallback explanations", () => {
  const { item, result, skills, asOfDate } = explanationFixture();
  item.event.title = '<svg onload="attack()">Course';
  item.improvements[0].name = "<b>API & design</b>";
  result.targetProfile.role = '<img src=x onerror="attack()">';
  const html = stepCard(item, result, null, skills, asOfDate);
  assert.doesNotMatch(html, /<svg onload|<img src=x|<b>API & design/);
  assert.match(html, /&lt;svg onload=&quot;attack\(\)&quot;&gt;Course/);
  assert.match(html, /&lt;b&gt;API &amp; design&lt;\/b&gt;/);
  assert.match(html, /&lt;img src=x onerror=&quot;attack\(\)&quot;&gt;/);
});
