# Session briefs

One brief per Claude Code session. Read `CLAUDE.md` first, then your brief, then `briefs/session-0-report.md`.

## Order

1. **Session 0** (done): data contract, repo skeleton, fixtures. Report: `session-0-report.md`.
2. **Merge `ws/0-data-contract` into `main`** before any other session starts. Commit these briefs to `main` too.
3. **Sessions A–D run in parallel**, each in its own git worktree, branched from `main`:

| Session | Branch | Owns | Brief |
|---|---|---|---|
| A | `ws/a-pipeline` | `/pipeline`, `/n8n`, `/schema` (only session allowed to change it this round) | `session-a-pipeline.md` |
| B | `ws/b-calculator` | `/apps/calculator` | `session-b-calculator.md` |
| C | `ws/c-map` | `/apps/map` | `session-c-map.md` |
| D | `ws/d-ui` | `/packages/ui` | `session-d-ui.md` |

## Merge order (Daniel)

1. **D, first PR** (tokens and core components). B and C import from it.
2. **A, first PR** (schema 1.1.0: capacity + emission factors + fixtures). B rebases on it.
3. Then any order. Merge one branch at a time. The other branches rebase after each merge.

## Shared rules for this round

- Only session A changes `/schema`. B, C and D write schema requests in their PR description.
- B and C do not add shared components. They request them from D in their PR description.
- Every session ends with `briefs/session-<letter>-report.md`: what exists, decisions, open questions, what other sessions must know.
- The UI framework is **Preact** (small bundle, React-like). Confirmed by Daniel before the start of this round.
