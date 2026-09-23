import test from "node:test";
import assert from "node:assert/strict";
import { selectRecommendationViews, resetProfileFocus } from "../recommendation-view.mjs";

const recommendations = [
  { event: { event_id: "EV_1" }, improvements: [{ skill_id: "SK_CODE" }] },
  { event: { event_id: "EV_2" }, improvements: [{ skill_id: "SK_TEAM" }] },
  { event: { event_id: "EV_3" }, improvements: [{ skill_id: "SK_CODE" }, { skill_id: "SK_TEAM" }] },
  { event: { event_id: "EV_4" }, improvements: [{ skill_id: "SK_TEAM" }] }
];

test("stale skill and event filters cannot hide the overall target's top three steps", () => {
  const views = selectRecommendationViews({ recommendations }, {
    selectedSkillId: "SK_PREVIOUS_GOAL", activeEventId: "EV_PREVIOUS_GOAL"
  });
  assert.deepEqual(views.primary, recommendations.slice(0, 3));
  assert.deepEqual(views.skillRelated, []);
  assert.equal(views.focused, null);
});

test("skill exploration is separate and can focus an event outside the main top three", () => {
  const views = selectRecommendationViews({ recommendations }, {
    selectedSkillId: "SK_TEAM", activeEventId: "EV_4"
  });
  assert.deepEqual(views.primary, recommendations.slice(0, 3));
  assert.deepEqual(views.skillRelated, [recommendations[1], recommendations[2], recommendations[3]]);
  assert.equal(views.focused, recommendations[3]);
});

test("an event unrelated to the selected skill cannot stay focused", () => {
  const views = selectRecommendationViews({ recommendations }, {
    selectedSkillId: "SK_CODE", activeEventId: "EV_2"
  });
  assert.equal(views.focused, null);
});

test("empty results and no selected skill have no focused event", () => {
  assert.deepEqual(selectRecommendationViews({ recommendations: [] }), {
    primary: [], skillRelated: [], focused: null
  });
  assert.equal(selectRecommendationViews({ recommendations }, { activeEventId: "EV_1" }).focused, null);
});

test("changing employee or goal clears only transient skill and event focus", () => {
  const state = { selectedSkillId: "SK_CODE", activeEventId: "EV_1", selectedEmployeeId: "E2", goalOverrides: new Map() };
  const originalGoals = state.goalOverrides;
  resetProfileFocus(state);
  assert.equal(state.selectedSkillId, null);
  assert.equal(state.activeEventId, null);
  assert.equal(state.selectedEmployeeId, "E2");
  assert.equal(state.goalOverrides, originalGoals);
});
