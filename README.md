# hack-a673b375-aruzhan
Hackathon team repository for Aruzhan

## Career Quest prototype

A dependency-free demo screen for synthetic employee profile E0101 from the Career Quest case dataset.

### Run

From this folder, start a local static server:

```powershell
python -m http.server 4173
```

Open <http://localhost:4173> and stop the server with `Ctrl+C`.

### What the screen demonstrates

- Career path from Backend Engineer Junior to Middle.
- Progress calculated from the sample profile's Middle requirements: 14 of 33 required skill levels (42%).
- All 15 required skills with the 0–5 proficiency scale and critical skill flags.
- Three eligible, not-yet-completed events filtered by role, current grade, and activity history.
- A local simulation action applies each event's expected gains and removes that event from the recommendations. It does not claim that a course proves real skill growth.

The employee data is synthetic. This is a focused prototype: it does not load the full dataset, save across reloads, or call an AI provider.
