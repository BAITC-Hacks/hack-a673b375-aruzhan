# hack-a673b375-aruzhan
Hackathon team repository for Aruzhan

## Career Quest prototype

A local demo built on the supplied synthetic Career Quest dataset (200 employees, 40 activities, 60 skills, and 2,743 participation records).

### Run

From this folder, install the pinned dependency and start the Node 22 server:

```powershell
npm ci
npm start -- 4174
```

Open <http://127.0.0.1:4174> and stop the server with `Ctrl+C`. A static Python server cannot run the coach API.

Run tests with `npm test`; evaluate all profiles with `npm run evaluate`. Syntax/whitespace checks: `npm run check` and `git diff --check`. Three.js `0.186.0` is pinned in the lockfile; no build step is required. Without a port argument, the server uses 4173.

### Project structure

```text
frontend/
  index.html
  src/                  # Browser UI, 3D floor, styles and view helpers
  tests/                # Frontend unit tests
backend/
  src/
    server.mjs          # HTTP API and explicit public asset routes
    coach.mjs           # AI workflow and provider integration
    domain/
      recommendations.mjs # One deterministic recommendation engine
  data/career_quest/    # Supplied synthetic dataset
  scripts/             # Whole-dataset evaluation
  tests/               # Domain, coach and HTTP integration tests
  .env.example
docs/                   # Project documentation and evaluations
package.json            # Root start/test/check/evaluate commands
```

The backend serves the frontend and only explicitly approved assets. The pure recommendation module is shared with the browser at `/shared/recommendations.mjs` to keep previews and server validation consistent without duplicating rules. Other backend source files, tests, scripts and credentials are never served. Public dataset URLs remain `/data/career_quest/*`; files live under `backend/data/`.

### Recommendation behavior

- Uses the dataset reference date and real employee profiles, role requirements, event rules, sessions, and activity history.
- Excludes mandatory courses, wrong-role or wrong-grade activities, unmet prerequisites, completed one-time courses, active enrollments, past sessions, and events that do not improve skills for the selected career goal.
- Accounts for completed learning after the employee's last skill review before calculating gaps and recommendations.
- Opens a compact Journey view: the Three.js career floor and A/B/C checkpoint controls select the same real eligible activities. One detail panel explains the selected step. Skills and HR have separate views; skill focus remains independent of overall recommendations.
- Ranks critical target skills first, then the number and amount of goal-aligned improvements, then improvement per hour and the next available date. The reasons show the matching skills and requirements.
- Shows upward and same-grade lateral skill matches. The dataset does not contain vacancies, manager outcomes, or business ROI, so match percentages are not hiring probabilities and no ROI is claimed.
- Previews a selected activity's expected impact without recording completion, changing eligibility, or overwriting assessed skills. Undo clears the preview; changing the employee or goal clears preview and focus.

The Journey choices show up to three eligible steps for the entire target; the Skills view displays skill-specific activities separately. Goal/employee changes reset skill and event focus. Expand recommendation evidence for eligibility and source records, or diagnostics for candidate counts through every filter. A desired role does not confer eligibility for courses restricted to that role: the current role and grade must qualify.

The headline progress and HR summary use assessed profile levels. Expected post-review gains remain separate estimates. Impact previews do not append history or change assessed skills, HR counts, or the available recommendations. Percentages are coverage of skill requirements, not promotion probabilities.

### Journey controls and fallback

The 3D floor uses Three.js while native A/B/C buttons remain keyboard and touch accessible. Use the visible 2D control at any time; 2D also provides the fallback when WebGL is unavailable. The same activity selection, evidence, preview and Undo work in both modes. Reduced-motion preferences are respected. The goal dialog changes the target explicitly; it does not imply a vacancy or promotion.

The green and yellow are verified from Halyk's official website CSS: see [brand source evidence](docs/halyk-brand-sources.md).

### AI coach

Copy `backend/.env.example` to `backend/.env`, set `OPENAI_API_KEY` locally, and restart the Node server. Never put the key in browser code or chat. `.env` files are ignored and cannot be served by the static file allowlist. Default model: `gpt-4.1-mini-2025-04-14`; `OPENAI_MODEL` can override it with a Responses/function-calling/Structured-Outputs-compatible model.

The coach calls three bound tools: `retrieve_profile`, `inspect_gaps`, and `find_eligible_activities`. It chooses event IDs, skill IDs and reason codes. Application code validates membership and constructs explanations from evidence; eligibility, gains, dates and progress stay deterministic. The tool trace is visible. Real dataset history is used; local impact previews never enter the coach context.

Limits: 30 seconds, five model rounds, nine tool calls, 1,200 output tokens per round, 24,000 cumulative tokens. No raw profiles or credentials are logged. The server is local-only; this synthetic demo has no production authentication or HR access controls.

No key was configured during implementation. **Live OpenAI behavior is unverified**; offline tests use fixture responses. Without a key the UI explicitly says the coach is unavailable; deterministic recommendations still work. Provider sources: [function calling](https://developers.openai.com/api/docs/guides/function-calling), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

### Examples and evaluation

- E0101: select A/B/C in Journey, inspect the step, preview its impact, and Undo. In Skills, select SQL; overall recommendations remain independent of skill focus.
- E0010: genuine catalog gap with explicit blockers.
- E0176: an eligible prerequisite step; further assessment and a fresh session check are required before the advanced activity.
- E0003: missing career goal; choose a path explicitly.

All 200 employees are evaluated: **108/134** employees with explicit goals receive direct suggestions. **233** direct and **6** prerequisite recommendations have no detected eligibility violations. The other profiles include missing goals and genuine catalog gaps. These metrics measure **coverage and constraint validity, not recommendation accuracy**. The dataset has no ground-truth ranking, measured skill outcomes, or expert relevance labels. See [the representative relevance review](docs/recommendation-evaluation.md) for all eight roles, rule decisions and remaining limitations.
