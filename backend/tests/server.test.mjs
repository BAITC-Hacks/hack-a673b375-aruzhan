import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createAppServer, loadDataset } from "../src/server.mjs";

test("server exposes only public assets and same-origin validated coach requests", async () => {
  const dataset = await loadDataset();
  const server = createAppServer({ dataset });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await (await fetch(`${origin}/api/health`)).json();
    assert.equal(health.providerConfigured, false);
    for (const file of ["", "index.html", "src/app.js", "src/styles.css", "src/skill-chart.mjs", "src/recommendation-view.mjs",
      "src/hr-summary.mjs", "src/career-floor.mjs", "src/impact-preview.mjs", "src/journey-view.mjs",
      "vendor/three/three.module.js", "vendor/three/three.core.js", "shared/recommendations.mjs", "data/career_quest/employees.json",
      "data/career_quest/events.json", "data/career_quest/skills.json", "data/career_quest/activity_history.csv"]) {
      assert.equal((await fetch(`${origin}/${file}`)).status, 200, file);
    }
    for (const file of [".env", ".git/config", "server.mjs", "coach.mjs", "docs/agent/runtime.md", "backend/.env", "backend/.env.example",
      "backend/src/server.mjs", "backend/src/coach.mjs", "backend/src/domain/recommendations.mjs", "backend/tests/server.test.mjs",
      "frontend/tests/skill-chart.test.mjs", "src/server.mjs", "shared/coach.mjs", "node_modules/three/package.json",
      "vendor/three/package.json", "vendor/three/three.webgpu.js", "fonts/package.json", "fonts/manrope-cyrillic.woff2",
      "node_modules/@fontsource-variable/manrope/package.json"]) {
      assert.equal((await fetch(`${origin}/${file}`)).status, 404, file);
    }
    const font = await fetch(`${origin}/fonts/manrope-latin.woff2`);
    assert.equal(font.status, 200);
    assert.equal(font.headers.get("content-type"), "font/woff2");
    const fontBytes = Buffer.from(await font.arrayBuffer());
    assert.equal(fontBytes.subarray(0, 4).toString("ascii"), "wOF2");
    assert.ok(fontBytes.length > 10_000 && fontBytes.length < 100_000, "Serve the complete local variable font");
    const employee = dataset.employees.find(item => item.career_goal);
    const request = { method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ employeeId: employee.employee_id, goal: employee.career_goal }) };
    const response = await fetch(`${origin}/api/coach`, request);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).status, "unconfigured");
    assert.equal((await fetch(`${origin}/api/coach`, { ...request, headers: { ...request.headers, Origin: "https://attacker.example" } })).status, 403);
    assert.equal((await fetch(`${origin}/api/coach`, { ...request, body: JSON.stringify({ employeeId: "fake", goal: null }) })).status, 400);
    assert.equal((await fetch(`${origin}/api/coach`, { ...request, body: JSON.stringify({ ...JSON.parse(request.body), apiKey: "not accepted" }) })).status, 400);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
