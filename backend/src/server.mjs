import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseCsv } from "./domain/recommendations.mjs";
import { createOpenAIProvider, DEFAULT_MODEL, runCoach } from "./coach.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
// URL-to-file mapping is explicit: only the pure recommendation module is shared.
const publicFiles = new Map([
  ["/", "frontend/index.html"],
  ["/index.html", "frontend/index.html"],
  ["/src/styles.css", "frontend/src/styles.css"],
  ["/src/app.js", "frontend/src/app.js"],
  ["/src/skill-chart.mjs", "frontend/src/skill-chart.mjs"],
  ["/src/recommendation-view.mjs", "frontend/src/recommendation-view.mjs"],
  ["/src/hr-summary.mjs", "frontend/src/hr-summary.mjs"],
  ["/src/career-floor.mjs", "frontend/src/career-floor.mjs"],
  ["/src/impact-preview.mjs", "frontend/src/impact-preview.mjs"],
  ["/src/journey-view.mjs", "frontend/src/journey-view.mjs"],
  ["/vendor/three/three.module.js", "node_modules/three/build/three.module.js"],
  ["/vendor/three/three.core.js", "node_modules/three/build/three.core.js"],
  ["/shared/recommendations.mjs", "backend/src/domain/recommendations.mjs"],
  ["/data/career_quest/employees.json", "backend/data/career_quest/employees.json"],
  ["/data/career_quest/events.json", "backend/data/career_quest/events.json"],
  ["/data/career_quest/skills.json", "backend/data/career_quest/skills.json"],
  ["/data/career_quest/activity_history.csv", "backend/data/career_quest/activity_history.csv"]
]);
const contentTypes = { html: "text/html", css: "text/css", js: "text/javascript", mjs: "text/javascript", json: "application/json", csv: "text/csv" };

export async function loadDataset(root = projectRoot) {
  const read = name => readFile(resolve(root, "backend/data/career_quest", name), "utf8");
  const [employeeText, eventText, skillText, historyText] = await Promise.all([
    read("employees.json"), read("events.json"), read("skills.json"), read("activity_history.csv")
  ]);
  const employeeData = JSON.parse(employeeText);
  const skillData = JSON.parse(skillText);
  return {
    employees: employeeData.employees, asOfDate: employeeData.meta.as_of_date,
    events: JSON.parse(eventText).events, roleProfiles: skillData.role_profiles,
    skills: skillData.skills, history: parseCsv(historyText)
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(body));
}
function errorBody(reason, message) {
  return { status: "error", runId: null, message, steps: [], trace: [], terminationReason: reason };
}

async function readJson(request) {
  if (!(request.headers["content-type"] ?? "").startsWith("application/json")) throw new Error("content_type");
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString("utf8");
    if (Buffer.byteLength(body, "utf8") > 2048) throw new Error("body_limit");
  }
  const value = JSON.parse(body);
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== "employeeId,goal"
    || typeof value.employeeId !== "string" || value.employeeId.length > 80) throw new Error("invalid_input");
  return value;
}

export function createAppServer({ dataset, apiKey, model = DEFAULT_MODEL, provider, root = projectRoot }) {
  const actualProvider = provider ?? (apiKey?.trim() ? createOpenAIProvider({ apiKey: apiKey.trim(), model }) : null);
  let busy = false;
  return http.createServer({ requestTimeout: 10_000, headersTimeout: 10_000 }, async (request, response) => {
    try {
      const host = request.headers.host ?? "";
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return sendJson(response, 403, errorBody("invalid_host", "Local access only."));
      const url = new URL(request.url, `http://${host}`);
      if (url.pathname === "/api/health" && request.method === "GET") {
        return sendJson(response, 200, { providerConfigured: Boolean(actualProvider), model, historyMode: "dataset_only" });
      }
      if (url.pathname === "/api/coach" && request.method === "POST") {
        if (request.headers.origin !== `http://${host}` || request.headers["sec-fetch-site"] === "cross-site") {
          return sendJson(response, 403, errorBody("invalid_origin", "Only same-origin requests are allowed."));
        }
        if (busy) return sendJson(response, 429, errorBody("busy", "AI уже обрабатывает запрос. Повторите после завершения."));
        let payload;
        try { payload = await readJson(request); }
        catch { return sendJson(response, 400, errorBody("invalid_input", "Нужны employeeId и goal из датасета.")); }
        busy = true;
        try {
          const result = await runCoach({ dataset, ...payload, provider: actualProvider });
          const statusCode = result.status === "ready" ? 200 : result.status === "unconfigured" ? 503
            : result.terminationReason === "invalid_input" ? 400 : result.status === "invalid_plan" ? 422 : 502;
          return sendJson(response, statusCode, result);
        } finally { busy = false; }
      }
      if (request.method !== "GET" && request.method !== "HEAD") return sendJson(response, 405, errorBody("method", "Method not allowed."));
      const file = publicFiles.get(decodeURIComponent(url.pathname));
      if (!file) return sendJson(response, 404, errorBody("not_found", "Not found."));
      const content = await readFile(resolve(root, file));
      const extension = file.split(".").at(-1);
      response.writeHead(200, { "Content-Type": `${contentTypes[extension]}; charset=utf-8`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch {
      if (!response.headersSent) sendJson(response, 500, errorBody("server_error", "Сервер не смог обработать запрос."));
      else response.end();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const envFile = resolve(projectRoot, "backend/.env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port");
  const dataset = await loadDataset();
  const server = createAppServer({ dataset, apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || DEFAULT_MODEL });
  server.listen(port, "127.0.0.1", () => console.log(`Career Quest: http://127.0.0.1:${port} (AI ${process.env.OPENAI_API_KEY?.trim() ? "configured" : "not configured"})`));
}
