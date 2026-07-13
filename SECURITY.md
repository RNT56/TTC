# Security policy

ForgedTTC is an unreleased prototype. No version currently receives a production
security-support promise, but reports about the repository and its published
artifacts are triaged.

## Report privately

Use GitHub's **Report a vulnerability** form in the repository Security tab. Do not
open a public issue for credentials, authentication bypasses, unsafe hardware paths,
remote-code execution, data exposure, supply-chain compromise, or an unpatched
vulnerability with a practical exploit.

Include the affected commit/version, component, reproduction, impact, prerequisites,
and any suggested mitigation. Do not include real user data or test against systems
you do not own or have permission to assess.

## Response targets

- acknowledge within 3 business days;
- initial severity and scope assessment within 7 business days;
- coordinate a fix/advisory timeline based on exploitability and user impact.

These are targets, not a paid support SLA. High/critical issues block releases.
Credentials are revoked or rotated before history cleanup. Coordinated disclosure is
preferred; public disclosure timing is agreed after a fix or effective mitigation is
available.

## Scope and safety

The Rust open core, WASM facade, Studio, gateway, workers, workflows, release
artifacts, and hardware-bridge safety boundaries are in scope. Social engineering,
denial of service, and testing against third-party providers without authorization
are out of scope. Hardware reports must not involve uncontrolled flight, auto-arm,
weapons, targeting, or bypassing the D30/D12 lab gates.

See [`docs/security-safety-legal.md`](docs/security-safety-legal.md) for the system
model and [`docs/REPOSITORY-GOVERNANCE.md`](docs/REPOSITORY-GOVERNANCE.md) for audit
and advisory policy.
