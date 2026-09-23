# hack-a673b375-aruzhan
Hackathon team repository for Aruzhan

## Career Quest prototype

A dependency-free demo built on the supplied synthetic Career Quest dataset (200 employees, 40 activities, 60 skills, and 2,743 participation records).

### Run

From this folder, start the Node 22 server (no installation needed):

```powershell
node server.mjs 4174
```

Open <http://127.0.0.1:4174> and stop the server with `Ctrl+C`. A static Python server cannot run the coach API.

Run tests with `node --test`; evaluate all profiles with `node scripts/evaluate-recommendations.mjs`. Syntax/whitespace checks: `node --check app.js` and `git diff --check`.

### Recommendation behavior

- Uses the dataset reference date and real employee profiles, role requirements, event rules, sessions, and activity history.
- Excludes mandatory courses, wrong-role or wrong-grade activities, unmet prerequisites, completed one-time courses, active enrollments, past sessions, and events that do not improve skills for the selected career goal.
- Accounts for completed learning after the employee's last skill review before calculating gaps and recommendations.
- Adds an interactive, accessible radar comparison of the profile against the selected role. Selecting a skill shows its assessment, estimated post-learning contribution, remaining gap, progress, and only eligible matching activities; selecting an activity returns to its skill.
- Ranks critical target skills first, then the number and amount of goal-aligned improvements, then improvement per hour and the next available date. The reasons show the matching skills and requirements.
- Shows upward and same-grade lateral skill matches. The dataset does not contain vacancies, manager outcomes, or business ROI, so match percentages are not hiring probabilities and no ROI is claimed.
- Lets a demo participant simulate completion in the current browser tab. The resulting gain is an estimate from the dataset and still needs a real assessment to confirm proficiency.

The main list always shows up to three eligible steps for the entire target; selecting a radar skill displays related activities separately. Goal/employee changes reset skill and event focus. Expand recommendation evidence for eligibility and source records, or diagnostics for candidate counts through every filter. A desired role does not confer eligibility for courses restricted to that role: the current role and grade must qualify.

The headline progress and HR summary use assessed profile levels. Expected post-review gains remain separate estimates. Simulated completions affect only this browser tab and never update assessed skills or HR counts. Reload clears simulations. Percentages are coverage of skill requirements, not promotion probabilities.

### AI coach

Copy `.env.example` to `.env`, set `OPENAI_API_KEY` locally, and restart the Node server. Never put the key in browser code or chat. `.env` is ignored and cannot be served by the static file allowlist. Default model: `gpt-4.1-mini-2025-04-14`; `OPENAI_MODEL` can override it with a Responses/function-calling/Structured-Outputs-compatible model.

The coach calls three bound tools: `retrieve_profile`, `inspect_gaps`, and `find_eligible_activities`. It chooses event IDs, skill IDs and reason codes. Application code validates membership and constructs explanations from evidence; eligibility, gains, dates and progress stay deterministic. The tool trace is visible. Real dataset history is used; local browser simulations are excluded.

Limits: 30 seconds, five model rounds, nine tool calls, 1,200 output tokens per round, 24,000 cumulative tokens. No raw profiles or credentials are logged. The server is local-only; this synthetic demo has no production authentication or HR access controls.

No key was configured during implementation. **Live OpenAI behavior is unverified**; offline tests use fixture responses. Without a key the UI explicitly says the coach is unavailable; deterministic recommendations still work. Provider sources: [function calling](https://developers.openai.com/api/docs/guides/function-calling), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

### Examples and evaluation

- E0101: three direct steps. Select SQL, inspect a related event, or change the goal; the main list stays independent of skill focus.
- E0010: genuine catalog gap with explicit blockers.
- E0176: an eligible prerequisite step; further assessment and a fresh session check are required before the advanced activity.
- E0003: missing career goal; choose a path explicitly.

All 200 employees are evaluated: **108/134** employees with explicit goals receive direct suggestions. **233** direct and **6** prerequisite recommendations have no detected eligibility violations. The other profiles include missing goals and genuine catalog gaps. These metrics measure **coverage and constraint validity, not recommendation accuracy**. The dataset has no ground-truth ranking, measured skill outcomes, or expert relevance labels. See [the representative relevance review](docs/recommendation-evaluation.md) for all eight roles, rule decisions and remaining limitations.
