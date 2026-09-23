import test from "node:test";
import assert from "node:assert/strict";
import { previewImpact } from "../src/impact-preview.mjs";

function fixture() {
  return {
    targetProfile: {
      required_skills: { SK_API: 5, SK_SQL: 5, SK_TEST: 5, SK_SYSTEM: 5, SK_TEAM: 5, SK_SECURITY: 5, SK_WRITING: 1 },
      critical_skills: ["SK_API"]
    },
    effectiveSkills: { SK_API: 2, SK_SQL: 2, SK_TEST: 2, SK_SYSTEM: 2, SK_TEAM: 2, SK_SECURITY: 2, SK_WRITING: 1 },
    assessedProgress: { earned: 12, total: 31, percent: 39 },
    skillGaps: [{ skillId: "SK_API", name: "API design" }, { skillId: "SK_SQL", name: "SQL" }],
    recommendations: [{
      event: { event_id: "EV_API" },
      improvements: [{ skill_id: "SK_API", name: "API design", current: 2, afterEvent: 4, requirement: 5, critical: true }]
    }],
    prerequisiteSteps: []
  };
}

test("previews estimated coverage from 42% to 48% without changing assessed progress or source data", () => {
  const result = fixture();
  const before = structuredClone(result);
  const preview = previewImpact(result, result.recommendations[0]);
  assert.equal(preview.eventId, "EV_API");
  assert.equal(preview.assessedPercent, 39);
  assert.equal(preview.beforePercent, 42);
  assert.equal(preview.afterPercent, 48);
  assert.equal(preview.deltaPoints, 6);
  assert.equal(preview.beforeEarned, 13);
  assert.equal(preview.afterEarned, 15);
  assert.equal(preview.total, 31);
  assert.deepEqual(preview.changes, [{ skillId: "SK_API", name: "API design", before: 2, after: 4, required: 5, remaining: 1, critical: true }]);
  assert.equal(preview.remainingGapCount, 6);
  assert.deepEqual(preview.remainingGaps[0], { skillId: "SK_API", name: "API design", current: 4, required: 5, remaining: 1, critical: true });
  assert.deepEqual(result, before);
});

test("keeps full estimated levels visible but clips coverage to target requirements", () => {
  const result = fixture();
  result.targetProfile.required_skills = { SK_API: 3, SK_SQL: 2 };
  result.recommendations[0].improvements[0].afterEvent = 5;
  const preview = previewImpact(result, result.recommendations[0]);
  assert.equal(preview.beforePercent, 80);
  assert.equal(preview.afterPercent, 100);
  assert.equal(preview.afterEarned, 5);
  assert.deepEqual(preview.changes[0], { skillId: "SK_API", name: "API design", before: 2, after: 5, required: 3, remaining: 0, critical: true });
  assert.equal(preview.remainingGapCount, 0);
});

test("a non-target prerequisite is useful preparation without inventing career-target progress", () => {
  const result = fixture();
  const prerequisite = {
    kind: "prerequisite", event: { event_id: "EV_BASIC" },
    improvements: [{ skill_id: "SK_BASIC", name: "Foundations", current: 0, afterEvent: 2, requirement: 2, critical: false }]
  };
  result.prerequisiteSteps.push(prerequisite);
  const preview = previewImpact(result, prerequisite);
  assert.equal(preview.afterPercent, preview.beforePercent);
  assert.equal(preview.deltaPoints, 0);
  assert.deepEqual(preview.changes, [{ skillId: "SK_BASIC", name: "Foundations", before: 0, after: 2, required: 2, remaining: 0, critical: false }]);
});

test("only previews catalog candidates already eligible in this result", () => {
  const result = fixture();
  assert.equal(previewImpact(result, { event: { event_id: "EV_UNKNOWN" } }), null);
  assert.equal(previewImpact({ ...result, targetProfile: null }, result.recommendations[0]), null);
  assert.equal(previewImpact(result, null), null);
  const spoofed = structuredClone(result.recommendations[0]);
  spoofed.improvements[0].afterEvent = 100;
  assert.equal(previewImpact(result, spoofed).changes[0].after, 4, "use the canonical eligible candidate, not caller-provided gains");
});

test("does not invent an assessed percentage when no assessment result exists", () => {
  const result = fixture();
  delete result.assessedProgress;
  assert.equal(previewImpact(result, result.recommendations[0]).assessedPercent, null);
});
