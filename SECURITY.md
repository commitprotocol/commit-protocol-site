# Security Policy

## Overview

Commit Protocol is an immutable, on-chain protocol with a static front-end hosted on GitHub Pages.

- No backend services
- No databases
- No custody of user funds
- All critical logic enforced on-chain
- Commits are irreversible by design

The website functions exclusively as a client-side interface to interact with the smart contract deployed on Base Mainnet.

---

## Supported Components

Commit Protocol follows a protocol-level versioning model:

| Component | Status |
|----------|--------|
| Smart contract (v0) | Supported |
| Front-end interface | Supported |

Deprecated, experimental, or superseded components are **not supported**.

Due to protocol immutability, fixes or improvements may require deploying a new contract version rather than modifying existing deployments.

---

## Smart Contract Security Model

- Deployed on **Base Mainnet**
- Source code is publicly available and verifiable
- No upgradeability mechanisms
- No admin roles or privileged access
- No owner-only withdrawal or fund custody
- No mutable state capable of altering historical commits

All validation logic (message length, formatting, and constraints) is enforced at the contract level.

Users are strongly encouraged to independently review and verify the contract code before interacting.

---

## Front-End Security Model

The front-end is a fully static application:

- Hosted via GitHub Pages
- No authentication or session handling
- No user data storage
- No cookies, analytics, or trackers
- Wallet interactions occur directly through the user’s Web3 provider (e.g., MetaMask)

The front-end does not act as an intermediary and does not relay or process transactions.

---

## Vulnerability Disclosure

If a security issue is identified in:

- Smart contract logic
- Front-end behavior
- Deployment or configuration

Please follow **responsible disclosure practices**.

An official vulnerability reporting channel will be published in a future update.

---

## Disclosure Policy

Public disclosure of security issues prior to review is discouraged.

Coordinated disclosure helps protect users, integrators, and the broader ecosystem.
