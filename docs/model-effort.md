# Model and effort for GitHub issues

Work is tracked as GitHub issues so the user can hand each one to Claude or Codex at a fitting model and effort. Both agents recommend settings from this page. It distills research the user compiled on 2026-09-11 against first-party documentation. The tables are provisional heuristics for the user's plans (Claude Pro and ChatGPT Plus), not official capability claims or benchmark results. Verified outcomes on this repository's issues outrank them. Refresh the sources before stating current prices, limits, or supported settings.

## Principles

- Recommend from what is knowable before work starts: the work shape. Conversation length, file count, seniority, or stakes alone do not justify an expensive setting. A clearly hard issue can start higher rather than paying for a predictable failure first.
- Choose settings at the start of a session. On Claude Code, changing the model, or the effort on most models, makes the next request re-read the whole conversation; Fable 5.1 on a subscription keeps the cache across effort changes. Codex warns that a mid-conversation model change can degrade results and recommends a new session; treat a Codex effort change as a possible cache miss.
- Raise effort before changing models. Raise effort when the model knew enough but did not work hard enough. Change model only for a capability gap, and then start at that model's default effort.
- Unclear requirements or missing logs call for better evidence, not more effort.
- Max is one bounded pass with a specific question and exit condition, never a session default.
- One issue per session. When an issue outgrows its setting or the session runs long, stop at a committed point and comment a checkpoint on the issue: the goal, verified state, settled decisions, relevant files, tests run, and the one open question. Continue in a fresh session.
- Vendor benchmark claims are self-reported. Use them as context, not as proof.

## Work shapes

Every issue names one shape. Each agent maps the shape to its own settings; there is no equivalence between the two vendors' models.

| Shape       | Signs                                                                                                             | Claude Code                                                                               | Codex                                               |
| ----------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Mechanical  | An explicit recipe, rename, or documented migration                                                               | Sonnet 5 at `low` or `medium`                                                             | Terra Medium, or Luna for narrow repeatable work    |
| Everyday    | A substantial feature or fix                                                                                      | Sonnet 5 at `high`, the Pro default                                                       | Sol Medium                                          |
| Invariants  | Retries, concurrency, restart recovery, database state, privacy or credential boundaries, cross-system invariants | Plan the change with effort raised, then execute with Sonnet 5 at `high`                  | Sol High, or a fresh Astra Medium session           |
| Review      | An adversarial design or debugging review                                                                         | Plan mode with effort raised; a fresh Opus 5 session once a capability gap is established | A fresh Astra Medium session; High if justified     |
| Exceptional | A bounded hard problem with one clear question                                                                    | One deliberate `max` pass                                                                 | One bounded Max pass on a deliberately chosen model |

Escalation triggers:

- **Claude.** If the model repeatedly fails to reconcile evidence already in context, raise effort one level. If a capability gap is confirmed, start a fresh Opus 5 session at its default effort. Opus 5 draws harder on the shared Pro limits. Recommend Fable only for the longest-horizon work, and only after the user accepts its usage-credit prompt.
- **Codex.** Escalate only for a specific unresolved correctness risk. Ultra is a delegation decision, never a response to length.
- **Both.** Once the hard part is resolved and routine follow-up remains, downshift, preferably in a fresh session.

## Issue format

The repository is public. Issues must never contain credentials, session data, `db:query` results, provider response bodies, or account or roster specifics.

```markdown
## Goal

## Acceptance criteria

## Context

Files, constraints, and related issues.

## Work shape

One shape from docs/model-effort.md, with the reason.

## Recommended settings

- Claude: model, effort. Escalate if ...
- Codex: model, effort. Escalate if ...

## Verification
```

To take an issue, add the `agent:claude` or `agent:codex` label and comment the model and effort you are starting with. When closing, comment what was verified and the settings actually used, including any mid-session changes and correction rounds, so these heuristics can be calibrated against real results. Settings you cannot see stay unknown.

## Sources

Checked on 2026-09-11. Refresh them before relying on volatile details.

- Claude Code: [model configuration](https://code.claude.com/docs/en/model-config), [prompt caching](https://code.claude.com/docs/en/prompt-caching), [costs](https://code.claude.com/docs/en/costs), and [effort](https://platform.claude.com/docs/en/build-with-claude/effort).
- OpenAI: [prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching), [reasoning](https://developers.openai.com/api/docs/guides/reasoning), and [models](https://learn.chatgpt.com/docs/models). The effort-change cache miss is user-reported in [openai/codex#35416](https://github.com/openai/codex/issues/35416) and unconfirmed.
