# Credential isolation trial

## Goal and status

User direction (2026-10-02): use this project to trial a security protocol for keeping API keys and other credentials out of agent access. A separate long-lived production and development database is not required for this experiment. Keep one authoritative tracker database; existing tests still use throwaway databases and synthetic fixtures.

Status: protocol proposed, not enforced or proven. Current ignored `.env.local` and browser sessions are not a demonstrated credential boundary. No real credentials have been moved, read for this trial, or rotated. No machine accounts, permissions, vault, or Turso configuration have been changed.

## Intended boundary

Agents develop and test code in the primary checkout, one agent at a time. The app and capture worker run reviewed code in an operator-owned runtime with access to the one real database and provider sessions. Agents do not receive runtime credentials, saved sessions, inherited secret environment variables, or cloud administrator logins.

Recommended first implementation: a dedicated non-administrator Windows identity for agent sessions, with access to this checkout and its development tools. The operator's private runtime, secret store, and browser profile remain inaccessible to that identity. This is a recommendation, not an approved machine configuration. All development stays here; a private runtime contains a deployed build, not another agent worktree.

Secret access is separate from database access. A read-only database token is still a credential. If agents need a live diagnostic, the operator runs an approved read-only command and shares its allowed output, or a later bounded interface supplies that output without disclosing a token. Any such interface must enforce allowed operations and run outside the agent's identity. Suppressing a token from the printed output of a wrapper that runs as the agent does not isolate that token.

## Steps

1. **Inventory access paths without opening secrets.** Identify configuration names and locations, environment inheritance, provider-session files, cloud CLI logins, browser/MCP access, and credentialed startup/deployment paths. Record names and mechanisms only, never values or account profiles.
2. **Prepare a reversible dummy-secret trial.** Use a random canary with no real privileges in an operator-owned test location. Record only boolean test results. Verify the operator's test process can read it, so a missing file cannot masquerade as successful isolation. Do not change real secret files or their permissions in the trial.
3. **Launch a fresh restricted agent session.** It must have no inherited runtime secrets, personal browser session, administrator cloud login, or ability to switch to the operator's identity. Test the actual shell, file tools, browser tools, and MCP servers used by each agent. Tool approval must not silently restore the operator's identity or broad access.
4. **Prove denial while development still works.** Run the probes below against the canary, and run `pnpm run verify -- --e2e` in the same restricted environment. Stop if any denied probe succeeds; fix the boundary and rerun. Do not probe real keys as proof.
5. **Separate code review from credentialed execution.** The operator launches a reviewed, fixed build from a location the agent cannot replace, together with reviewed startup commands and dependencies. Do not hot-reload agent edits or automatically deploy an unreviewed agent-writable branch into the credentialed runtime. A hidden key can still be exposed by code that executes with that key.
6. **Enroll real credentials only after the dummy trial passes.** The operator supplies narrowly scoped credentials to the protected runtime, handles normal provider sign-in there, and verifies operation. Document expiry, revocation, and recovery without storing values. Keep the existing database and backups intact. Recheck the boundary after changing the agent launcher, permissions, tools, or secret-loading mechanism.

## Required evidence

| Probe                                                              | Expected result                                                      |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Operator test process reads canary                                 | Allowed; contents not printed                                        |
| Agent file tool, PowerShell, and Node read canary                  | Denied in each applicable tool                                       |
| Agent subprocess checks secret variable presence                   | Absent; values never printed                                         |
| Agent tries an otherwise approved command requiring broader access | Canary remains inaccessible; no identity switch                      |
| Agent cloud/browser/MCP tools try to use operator authentication   | No operator authentication available; test with dummy resources only |
| Agent writes its source and runs the isolated full gate            | Allowed; tests pass without live credentials                         |
| Agent replaces protected runtime build or startup command          | Denied                                                               |
| Operator runs fixed dummy-runtime build                            | Works; no canary appears in its allowlisted output                   |

Report the identity and configuration tested, tool coverage, positive-control result, and each denial. An untested tool or escalation route stays unverified. A failed read is insufficient if the same credential is available through an environment, session, admin login, or another tool.

## Limits and recovery

This trial targets direct credential access and accidental exposure during development. It does not establish resistance to an administrator changing permissions, a compromised host, every dependency attack, or malicious changes approved for credentialed execution. Code review and protected runtime artifacts remain necessary.

If the boundary fails, stop credentialed execution through that path and record the result without printing the canary or real values. A dummy trial needs no real-key rotation. If a real credential is later confirmed exposed, the operator revokes/replaces it and checks the affected service. Revert only the trial's named configuration; never reset the tracker database or delete its backups.

## References

- [Windows access control](https://learn.microsoft.com/en-us/windows/security/identity-protection/access-control/access-control) describes authorization through identities and object permissions.
- [OpenAI agent approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security) describes sandbox/approval boundaries, escalation, and tool traffic outside the command sandbox.
- [Agent channel](docs/agent-channel.md) is the single ongoing handoff. Task-specific implementation and probe evidence belong on the security issue, not a second handoff file.
