# Sources and maintenance

Research checked on 2026-09-23. Selection favors first-party documentation, real maintained codebases, and relevance to a small hackathon project. This is a targeted comparison, not an exhaustive ranking by stars.

## Documentation findings

| Source | Decision for this repository |
| --- | --- |
| [Codex instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md) | Put AGENTS.md at the actual Git root. Nested guidance has narrower scope; arbitrary linked Markdown is not automatically imported. Restart in this repository to load changed startup instructions. |
| [September 11 guidance on prompts and skills](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) | Route by task instead of requiring all docs before every edit. Remove blanket permission questions and redundant verification loops. Keep the rules usable across models; no model ID is hard-coded. |
| [Harness engineering](https://openai.com/index/harness-engineering/) | Use a short index with separate durable context. Runtime invariants must be enforced by code and checked with evidence; a Markdown file alone does not implement a harness. |

## Repository comparison

The links below pin the revisions actually fetched, so this analysis stays reproducible as main branches change.

| Repository / file | Adopt or omit |
| --- | --- |
| [openai/codex: AGENTS.md](https://github.com/openai/codex/blob/40eac3ce8a0c10cbcb9db910d529355eb2f8fc09/AGENTS.md) | Use commands and conventions specific to the actual codebase, with focused verification. Its Rust, Bazel, snapshot, and internal sandbox rules do not apply here. |
| [openai/openai-agents-python: AGENTS.md](https://github.com/openai/openai-agents-python/blob/32edd3c3ecde37a7fb6bf4b082f35f1d8f7f086b/AGENTS.md) | Use task-triggered references, bounded trust at tools/providers, and behavior-focused tests. Do not import its release policies or mandatory internal skills. |
| [openai/openai-cookbook: execution plans](https://github.com/openai/openai-cookbook/blob/5986832a554169dc87285b1b0b396941f235a62e/articles/codex_exec_plans.md) | Keep a resumable outcome, milestones, evidence, and decisions for substantial work. Adapt the pattern; omit its long template and historical model recommendation. |
| [openai/openai-cookbook: development workflows](https://github.com/openai/openai-cookbook/blob/5986832a554169dc87285b1b0b396941f235a62e/examples/codex/iterating-development-workflows-with-codex.md) | Treat additional harness files as optional conventions. Avoid creating a phase-file bureaucracy before an application exists. |
| [FerroxLabs/agents-md: prior template](https://github.com/FerroxLabs/agents-md/blob/90c7198cfa97ff1868f0600952098fee7fc86ef9/AGENTS.md) | Useful general emphasis on simplicity and grounded work. Replaced blanket stopping, reading, and delegation rules with scoped guidance. |

## What changed from the FerroxLabs template

- Kept small scoped edits, explicit unknowns, and verifiable outcomes.
- Replaced repeated general behavioral rules with a compact routing table and project-specific boundaries.
- Removed mandatory alternative proposals for every task, fixed two-failure resets, blanket subagent use, and indiscriminate whole-suite checks.
- Separated development guidance from future runtime requirements. No tool permissions, API integrations, or application controls are claimed as installed.
- Retained section 11 verbatim and inactive, respecting the user's earlier instruction to leave it empty.

## Maintenance

AGENTS.md is canonical. CLAUDE.md and GEMINI.md currently duplicate it; compare contents after edits and preserve any independently added instructions.
When the app gains a stack, update project.md from real manifests and successful commands. Do not copy Rust/Cargo or Python/uv commands from the reference repositories.
Add scoped AGENTS.md files only when a real directory needs different rules. Consider a skill only after a repeatable workflow exists; keep its trigger narrow.
For instruction changes, check relative links, current facts, duplicate-file drift, and realistic routing examples. Reading a rule is not evidence that the application enforces it.
Revisit this guidance when tooling or recurring failures change. Do not auto-download and overwrite it from upstream templates.
