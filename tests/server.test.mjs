import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createAppServer, loadDataset } from "../server.mjs";

test("server exposes only public assets and same-origin validated coach requests", async () => {
  const dataset = await loadDataset();
  const server = createAppServer({ dataset });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await (await fetch(`${origin}/api/health`)).json();
    assert.equal(health.providerConfigured, false);
    assert.equal((await fetch(`${origin}/`)).status, 200);
    for (const file of [".env", ".git/config", "server.mjs", "coach.mjs", "docs/agent/runtime.md"]) {
      assert.equal((await fetch(`${origin}/${file}`)).status, 404, file);
    }
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
