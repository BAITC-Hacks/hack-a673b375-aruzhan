# Runtime requirements for the hackathon agent

Read when implementing agent loops, tools, provider adapters, or evaluations.
These are design requirements for future code. No runtime, enforcement, or evaluation runner exists in this checkout yet.

## Minimum implementation contract

- Start with one agent and a few task-specific tools. Add specialists only for a demonstrated requirement.
- Define validated tool inputs and explicit success/error outputs. The application decides what may execute; model output is a proposal.
- Enforce access and approval at the tool boundary. Untrusted documents or tool results cannot authorize external writes or broader access.
- Keep API keys server-side. Verify each selected provider's model ID, request schema, structured-output/tool support, and limits from official docs and a small live probe.
- Separate provider calls from domain tools so offline tests can use deterministic fixtures. Avoid a general provider framework until required.
- Set finite step, time, output, retry, and usage limits in code. Stop with a clear status on exhaustion; limits remain TODO until the workload is chosen.
- Retry only appropriate transient failures. Prevent duplicate side effects with idempotency or explicit state checks; do not blindly retry purchases, sends, or writes.
- Record run ID, tool name, sanitized outcome, latency, available token usage, and termination reason. Do not log raw secrets or sensitive payloads.
- Show tool activity and results in the demo. Distinguish simulated services and offline fixtures from live provider execution.

## Initial evaluation cases

| Case | Expected behavior |
| --- | --- |
| Normal request | Chooses valid tools and produces the intended verifiable artifact |
| Missing input | Requests essential information or returns an explicit incomplete result |
| Tool timeout or rate limit | Uses bounded recovery and exposes failure when recovery is exhausted |
| Instructions embedded in retrieved text | Treats them as task data; no unrelated tools or privilege changes |
| Repeated tool call | Avoids duplicate external side effects |
| Step or usage limit | Terminates without another uncontrolled call |

Score task completion, tool correctness, and failure handling separately. Record latency and usage; estimate cost only from verified pricing.
Keep deterministic checks independent of API availability. Run a small authorized live integration check before claiming a provider works, and label anything not tested.
