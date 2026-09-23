import test from "node:test";
import assert from "node:assert/strict";
import { relevantBlocker, visibleSteps, emptyMessage, blockerText } from "../src/journey-view.mjs";

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
