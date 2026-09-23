# Halyk palette evidence

Checked 2026-09-23 against the public [official Halyk website](https://halykbank.kz/ru) and the [stylesheet loaded by that page](https://halykbank.kz/themes/halyk/assets/css/app.css?v=1790165584).

| App use | Exact value | Observed official implementation |
| --- | --- | --- |
| Primary green | `#00805F` | `.bg-primary` and `.text-primary` use `rgb(0 128 95)`; `.btn-green,.btn-primary` also uses this background. |
| Secondary yellow | `#FAAE17` | `.bg-secondary` and `.text-secondary` use `rgb(250 174 23)`. |

These values are verified from **official website CSS**, not a published corporate brand manual or a screenshot sample. The page contains other colors: chart accents use `#FBAE17`, and a scoped cabinet button override uses `#2AA65C`. The primary/secondary utilities above are the consistent pair selected for Career Quest.

The page also references an [official white logo SVG](https://halykbank.kz/themes/halyk/assets/images/logo-w.svg), whose visible paths are `fill="white"`; it is not evidence for a green or yellow hex. No third-party brand palette was used.

Light surfaces, muted borders, and dark text in the app are supporting UI choices, not asserted official Halyk brand colors. Keep the yellow as an accent with dark text rather than relying on white text over yellow.
