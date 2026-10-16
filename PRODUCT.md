# Product

<!-- impeccable:product-schema 1 -->

Reviewed against the working tree on **2026-10-02**. Repository observations describe available code, not verified deployment status or complete functionality. Product recommendations below remain proposals unless adopted by the project owner.

## Platform

web

## Users

The product is intended for two audiences; this is a working audience model, not a user-research finding:

- **Returning DarkThrone players:** familiar with recruiting, turns, army roles, upgrades, and eras. Preserve recognizable mechanics and make changed rules inspectable.
- **New players:** need to understand resources, meaningful choices, and consequences without prior genre knowledge. The repository includes a how-to-play page and a walkthrough; their presence does not prove onboarding effectiveness.

## Product Purpose

OpenThrone is a text-based MMORPG inspired by DarkThrone and is not affiliated with the original project. Its purpose is to provide a persistent strategy game where players develop a kingdom, manage an army and economy, and interact through combat and social systems.

OpenThrone is developed by DasTacoMann and operated by AIOXperts IT Solutions LLC, which funds its development and provides hosting.

**Proposed near-term objective:** a dependable, playable beta where newcomers can learn the core loop and returning players have reasons to keep participating. Stability, balance, and retention are useful evaluation criteria; their relative priority versus fidelity to DarkThrone remains a product decision.

## Player Experience

The following describes an intended experience, not measured player behavior:

1. **Understand the kingdom:** review resources, incoming growth, army strength, and recent events.
2. **Choose an investment:** recruit, train, equip units, improve structures, or secure gold.
3. **Choose an interaction:** scout or attack a suitable target, coordinate with an alliance, or use messaging and social features.
4. **Understand the result:** see costs, gains, losses, and the next useful action.

A proposed onboarding milestone is the first informed investment: a player understands what it costs, what it changes, and why it helps. Combat should follow an explanation of commitment and risk.

Potential reasons to return include resource growth, progression, changing opponents, and community coordination. Validate those motivations with player feedback rather than assuming that scheduled rewards alone produce retention. Session duration and preferred play frequency remain undecided.

## Positioning

OpenThrone's distinguishing context is its persistent kingdom strategy and connection to DarkThrone's style of play. Preserve that connection through recognizable strategy, transparent mechanics, and honest communication. Do not invent exclusivity claims, player testimonials, usage metrics, or promises about future features.

## Operating Context

The repository is under active development. This document does not establish the current live environment, release phase, reset schedule, or service reliability.

Use the [README](README.md) for setup, [operations guide](docs/operations.md) for scheduled tasks, and [plan index](plans/README.md) for implementation proposals. Support contact information belongs in the README.

## Capabilities and Constraints

Areas represented in routes and services include:

- Recruiting, training, equipment, structures, banking, combat, spying, simulation, and battle history.
- Alliances, messaging, user profiles, community news, and social resource requests.
- Registration, sign-in, two-factor authentication, vacation mode, and captcha integration.
- Administration, moderation, eras, feature flags, bots, audit tools, and API tokens.

This inventory does not establish that every flow is complete, enabled, balanced, or tested. Check the implementation and validation evidence for the feature being changed.

Existing engineering constraints are Next.js Pages Router, React/TypeScript, Mantine, Tailwind, next-i18next, and Bun-first tooling. The frontend supports ELF, HUMAN, UNDEAD, and GOBLIN palettes. Follow [AGENTS.md](AGENTS.md) for coding requirements and [DESIGN.md](DESIGN.md) for visual and interaction guidance.

## Brand Commitments

- Use the name **OpenThrone** and describe it as a persistent strategy game.
- Keep the explicit non-affiliation with the original DarkThrone.
- The repository is [MIT-licensed](LICENSE).
- Distinguish available behavior from proposed features and measured outcomes from illustrative examples.

## Product Principles

These are recommended decision rules, not a record of independently confirmed requirements:

1. **Make strategy understandable.** Explain resource costs, eligibility, uncertainty, and consequences where players make decisions.
2. **Support veterans and newcomers.** Preserve depth while making changed rules and first steps learnable.
3. **Respect player investment.** When resets are necessary, communicate their scope and timing clearly, warn before progress is lost where possible, and explain what persists. Do not treat players' time as disposable.
4. **Support social play honestly.** Use real functionality and player feedback; avoid fabricated activity or success claims.
5. **Prefer dependable flows.** A complete, comprehensible action is more useful than a larger inventory of unfinished features.

## Evidence and Open Decisions

Source code supports the technical inventory above. The [documentation index](docs/README.md) separates maintained guides from historical findings; archived plans are not proof of current behavior or approved requirements.

Still to establish: the current release objective, the priority of fidelity versus retention, expected session cadence, reset communication policy, and criteria for onboarding success. No player research or retention measurements are supplied here. Update this document when those decisions or evidence become available.
