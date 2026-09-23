# hack-a673b375-aruzhan
Hackathon team repository for Aruzhan

## Career Quest prototype

A dependency-free demo built on the supplied synthetic Career Quest dataset (200 employees, 40 activities, 60 skills, and 2,743 participation records).

### Run

From this folder, start a local static server:

```powershell
python -m http.server 4173
```

Open <http://localhost:4173> and stop the server with `Ctrl+C`.

Run recommendation tests with `node --test`.

### Recommendation behavior

- Uses the dataset reference date and real employee profiles, role requirements, event rules, sessions, and activity history.
- Excludes mandatory courses, wrong-role or wrong-grade activities, unmet prerequisites, completed one-time courses, active enrollments, past sessions, and events that do not improve skills for the selected career goal.
- Accounts for completed learning after the employee's last skill review before calculating gaps and recommendations.
- Ranks critical target skills first, then the number and amount of goal-aligned improvements, then improvement per hour and the next available date. The reasons show the matching skills and requirements.
- Shows upward and same-grade lateral skill matches. The dataset does not contain vacancies, manager outcomes, or business ROI, so match percentages are not hiring probabilities and no ROI is claimed.
- Lets a demo participant simulate completion in the current browser tab. The resulting gain is an estimate from the dataset and still needs a real assessment to confirm proficiency.

The scoring is deterministic; AI is not used to decide eligibility or rank candidates. This keeps every recommendation traceable to dataset fields and makes evaluation reproducible. In the full-data check, 112 of 134 employees with a goal had at least one valid suggestion; the remaining profiles correctly return no activity when the catalog has no eligible skill-improving option.
