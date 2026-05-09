# Security Policy

## Supported Versions

Security updates are focused on the current major release line.

| Version | Supported |
| --- | --- |
| 5.0.x | Yes |
| 4.x | Critical fixes only |
| < 4.0 | No |

## Reporting a Vulnerability

Please do not open a public GitHub issue for a suspected vulnerability.

Report privately to the maintainer through GitHub contact channels. Include:

- A clear description of the issue.
- Affected version or commit.
- Reproduction steps or proof-of-concept details.
- Impact assessment if known.
- Whether the issue requires physical device access, unlocked device access, rooted device access, or remote interaction.

## Response Expectations

- Initial triage target: within 7 days.
- Confirmed high-impact issues are prioritized for the active supported line.
- Public disclosure should wait until a fix or mitigation is available, unless active exploitation requires faster coordination.

## Security Scope

In scope:

- Vault encryption, backup, sync envelope, and key-handling behavior.
- Authentication, biometric unlock, passkey, and recovery flows.
- SQL injection, path traversal, insecure storage, or audit-log bypass issues.
- Release artifact provenance and dependency-chain concerns.

Out of scope:

- Issues requiring a fully compromised/rooted device without a realistic app-level mitigation.
- Social engineering attacks outside the application.
- Denial-of-service reports without security impact.
- Vulnerabilities in unsupported historical versions.
