# Credential privacy during agent work

## Current boundary

This workspace allows unrestricted filesystem and process access. An agent can read files, execute scripts and inspect process state. There is no enforceable guarantee that `.env`, CLI credential stores or inherited environment values remain private. A promise not to read them, a file ignore rule, output redaction and encryption whose decryption key is available to the same agent do not establish that boundary.

No secret values were intentionally read or included in task output. The configured `tea` CLI used its existing authentication internally to create the requested Forgejo issues; its credential file was not opened. Code-only Bun checks use `--no-env-file`.

## Enforceable architecture to adopt

1. Run agent development in a separate container/VM or OS account with no production secret mounts, inherited secrets, privileged sockets, production database access or access to the host credential stores.
2. Keep production credentials in a separately administered secret manager and operation service. The service must enforce named operations, scoped parameters, fixed destinations, authorization and audit logging; it must not provide an arbitrary shell, raw SQL, arbitrary URL fetching or secret/config dumps.
3. Return only fields that each operation needs, with redaction inside the trusted service. Never send raw headers, connection strings, database rows with private fields, or errors containing credentials to the model.
4. Use short-lived, narrowly scoped credentials inside that service; expose synthetic credentials and synthetic data to the agent's local app. Treat code supplied by the agent as untrusted when a service holds secrets.
5. Use independent human/CI release review before agent-authored code runs with production credentials. A narrow service reduces exposure; it cannot eliminate all implementation, authorization and output-channel risks.

This architecture is a proposal, not something installed by this task. An agent can participate by requesting allowed operations without receiving the underlying secrets. If it retains unrestricted access to those secrets, privacy remains a risk.

## Existing exposures

Treat previously exposed credentials as compromised: inventory them privately, revoke/rotate them at their providers, invalidate affected sessions where appropriate and review access logs. Do not paste the inventory or values into an AI conversation. Rotating database credentials and auth secrets requires an operator-managed rollout; this task has not performed it.

Audit code that names secrets with `NEXT_PUBLIC_*`. Next.js can inline such variables into browser code when referenced there. The Turnstile integration currently names its verification secret `NEXT_PUBLIC_TURNSTILE_SECRET`; move it to a server-only name through a coordinated configuration migration and review browser references/build artifacts privately. A public prefix is a risk indicator, not evidence that a value was emitted.

## Repository safeguards added

- Ignore `.env*` variants while retaining sample/example filenames for synthetic setup.
- Add agent handling rules to `AGENTS.md`.
- Keep the above rules separate from runtime isolation: neither change restricts filesystem access or removes a secret already committed in history.

Primary reference: [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) for least privilege, secret lifecycle, scoped access and rotation.
