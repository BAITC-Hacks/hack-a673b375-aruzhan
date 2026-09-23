# Career floor design contract

Purpose: one glance identifies the employee's destination and one recommended next action. First complete loop: choose eligible checkpoint, inspect evidence, preview impact, undo.

Palette: official-site primary green #00805F and secondary yellow #FAAE17; white #FFFFFF, light canvas #F3F6F4, ink #183B31, muted #587068. Source evidence: docs/halyk-brand-sources.md. Segoe UI/Arial system sans, 36/27/20px headings, 14px body, 11–13px secondary content. Left aligned content; no oversized hero or decorative metrics.

Desktop structure:
```
Brand | Journey / Skills / HR | employee
Current role → target role            assessed coverage
3D floor + three checkpoint choices | selected step
                                   | why / gaps / availability
                                   | preview + Undo
```

The physical floor is the one expressive element. Native controls and the right-hand explanation carry exact data. User reference one informs skill/goal hierarchy, reference two informs a spatial floor; neither dark/neon palette is copied. Avoid repeating three full text-heavy cards: one selected detail, three compact choices. Skills/HR use separate views and evidence uses disclosures. Mobile collapses to a compact map followed by detail; selecting a checkpoint brings its detail into view. Reduced motion and manual 2D mode preserve every action.

Domain boundary: keep recommendation/AI engine unchanged. Preview reads a canonical eligible candidate, projects its estimated gain, never appends history, changes eligibility, or overwrites assessed skills. Goal/profile changes reset preview and selection. Checkpoints only represent actual eligible activities; a blocked course is visibly informational and cites its real blocker. Career destination is a goal, not an opening or promotion promise.

Verify: calculation and purity tests; full existing suite; dataset evaluation unchanged; browser select/preview/undo, goal/profile switch, blocked/no-goal states; 320/768/1024/1440 widths, keyboard, reduced motion, 2D fallback, console errors.

Implementation notes: `frontend/src/career-floor.mjs` renders the Three.js floor; `journey-view.mjs` keeps compact checkpoint/detail state; `impact-preview.mjs` computes pure preview values. Three.js is pinned to `0.186.0`; a fresh clone requires `npm ci` before `npm start -- 4174`. The current UI uses English copy, a goal dialog and separate Skills/HR views. Shared recommendation rules are unchanged, and provider credentials remain server-side; no key is required for deterministic recommendations or previews.

## Verified increment

- 51 Node tests passed; syntax checks passed. Dataset evaluation unchanged: 200 profiles, 108/134 goal-set profiles with direct steps, 310 eligible candidates checked, no detected eligibility violations.
- Browser: genuine 3D checkpoint C opened Structured Problem Solving and selected matching native option; keyboard selected checkpoint A with focus retained. Rotation and manual 2D controls are native buttons.
- Preview: E0101 System Design projected 42% → 48%, assessed stayed 42%; Undo restored the same three choices. HR counts stayed unchanged. Profile/goal changes cleared the preview.
- E0176 prerequisite preview improved Statistics while goal coverage stayed44%; no unreachable link for a non-target prerequisite skill. E0003 displayed explicit missing-goal state. Locked course explained its actual role restriction and offered no preview.
- Browser widths320,768,1024,1440 checked with no horizontal overflow; desktop uses two columns, phone uses compact map followed by selected detail. Three.js rendered successfully. Reduced-motion branches and CSS reviewed; OS media preference was not changed during verification.
- AI API without a key explicitly reports unavailable. Provider logic is unchanged and no live-model quality claim is made. Earlier console error from the old app during partial file replacement did not recur after the final app reload.
