---
slug: hierarchical-ai-agent-harness-architecture
title: 'Hierarchical AI Agent Harness Architecture: A Single Governance Network from Accounts to Development Tools'
description: Solving rule fragmentation across disparate AI tools through a 5-layer hierarchical harness architecture. Automating pipelines and safety hooks to bind account SSOT, orchestrators, projects, and runtime adapters into a single governance network.
category: ai
format: essay
author: JongKwan Park
lang: en
publishedAt: '2026-10-09T06:30:00.000Z'
translationKey: hierarchical-ai-agent-harness-architecture
tags:
  - AI Harness
  - Agent Governance
  - Claude Code
  - Cursor
  - Paseo
  - System Engineering
draft: false
sources: []
---

> "When utilizing multiple AI developer tools (Claude Code, Cursor, OpenCode, Paseo, etc.), the greatest disaster begins the moment you copy-paste prompts and rules between tools. Guidelines fragment, and security updates made in one place fail to propagate elsewhere, paving the path to production mishaps."

To address this fragmentation, we built a **5-layer hierarchical harness architecture** that unifies global principles from the top-level **account** down to domain-specific knowledge in **projects** and tool-specific runtimes (**adapters**) into a single source of truth (SSOT).

---

## 1. The 5-Layer Configuration Hierarchy: Inheritance & Overrides

AI agents do not run as detached, ad-hoc entities; rather, they inherit their operating constraints through an explicit hierarchy.

```text
① Account Level (~/.agents/)
   └─ Global core principles, model tiers, delegation protocols, sealed security rules (SSOT)
       │
       ▼
② Orchestrator Level (Paseo)
   └─ Agent lifecycle (create_agent), profile routing, background supervisor policies
       │
       ▼
③ Project Level (AGENTS.md, .agents/)
   └─ Repository architecture, domain constraints, test/lint policies, directory layouts
       │
       ▼
④ Runtime Adapter Level (~/.claude/CLAUDE.md, adapters/*.md)
   └─ Tool-specific interface mappings, hook bindings, CLI configurations
       │
       ▼
⑤ In-Session User Instructions
   └─ Real-time explicit turn prompts (Highest priority)
```

### Two Foundational Governance Norms

1. **Top-Down Inheritance with Explicit Overrides**:
   * Lower tiers automatically inherit rules from higher tiers.
   * Modifying an upstream rule requires explicit declaration: `override: <Upstream §> — reason`. Conflicting instructions without an explicit override tag are rejected by the system.
2. **The "Sealed" Security Principle**:
   * Critical safety rules marked `[Sealed]`—such as secret key protection, data exfiltration blocks, and destructive actions (database drops, forced git pushes)—can **only be strengthened** at lower tiers.
   * Relaxing or bypassing sealed rules requires explicit, case-by-case user approval in the conversation turn.

---

## 2. Automated Build Pipelines: "Config Files Are Never Manually Copied"

To maintain a true single source of truth (SSOT), humans edit only canonical documents (JSON definitions, core Markdown). Downstream configs are compiled and injected by automated **build pipelines**.

```text
         ┌───────────────────────────┐
         │ model-tiers.json (SSOT)   │
         └─────────────┬─────────────┘
                       │
          python3 render-model-tiers.py
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
[Auto-rendered model-tiers.md]   [Updated ~/.paseo/config.json]
                                             │
                                    paseo daemon reload
```

### ① Model Tiering & Profile Synchronization (`render-model-tiers.py`)
* Registering or updating a model tier or routing rule (e.g., pairing a `gemini` conductor with `deepseek-flash` workers) requires editing only a single line in `model-tiers.json`.
* The renderer script:
  1. Automatically generates Markdown summary tables in the human-facing specification (`model-tiers.md`).
  2. Regenerates daemon configuration profiles (`~/.paseo/config.json`) and triggers a hot reload.
  3. Verifies zero discrepancies across runtimes with `--validate` and `--check` flags.

### ② Core Principle Compilation (`build-agents.sh`)
* Whenever the top-level foundation (`~/.agents/core.md`) is updated, the build script parses it and automatically synthesizes it into Claude Code's global instruction file (`~/.claude/CLAUDE.md`) and runtime adapter headers.
* Regardless of whether an engineer starts Claude CLI or Cursor, the session begins with the exact same up-to-date core rules loaded.

### ③ Symlinked Single-Source Skills
* Skills are authored and maintained exclusively in `~/.agents/skills/`.
* Tool-specific skill directories (e.g., Claude Code, OpenCode) reference this canonical path via **symlinks**, preventing skill divergence across environments.

---

## 3. Runtime Adapters and Safety Hooks: "The Thin Adapter Pattern"

Individual tool configs (Layer ④) avoid heavy, duplicate rule sets; they act purely as **thin adapters** that import higher-level governance.

```text
[Developer Launches Tool: Claude / Cursor / OpenCode]
   │
   ├─► 1. Load Account Core + Project AGENTS.md (Context Baseline)
   │
   ├─► 2. Map Tool-Specific Commands/Capabilities (Runtime Adapter)
   │
   └─► 3. Safety Interception & Validation (Hooks)
          ├─ Intercept and cap unauthorized pinnacle model requests
          ├─ Block tampering with reserved orchestrator labels (paseo.*)
          └─ Guard against unauthorized process scans (ps env leaks)
```

* **Runtime-Agnostic Hooks (`hooks/`)**:
  * When an agent dispatches sub-tasks or triggers sensitive shell commands, account-level hooks intercept and validate the payload.
  * For instance, if an Advanced-tier session attempts an unprompted dispatch of a Pinnacle-tier model, the hook intercepts the call, **automatically downgrades it to an Advanced model from the same provider**, and logs a single-line audit record.

---

## 4. End-to-End Workflow Integration

When an engineer starts working in an IDE or terminal, the harness operates seamlessly:

1. **Workspace Entry**:
   * The environment loads `AGENTS.md`, absorbing repository conventions, tech stack specifics, and linting rules.
2. **Upfront Classification Declaration**:
   * Bound by protocol (`delegation-protocol.md §0`), the agent declares on its very first line: `[Classification] Task Type | Tier | Assigned Model | Direct/Delegate | Rationale`.
3. **Conduction and Slicing**:
   * The interactive main session (e.g., Gemini 3.8 Flash) analyzes complex requirements and divides them into disjoint file sets (`write_set disjoint`).
4. **Cross-Provider Delegation**:
   * Sliced execution tasks are dispatched in parallel via the orchestrator daemon (Paseo) to high-speed, cost-efficient workers (`opencode:standard@deepseek`).
5. **Contract Reclamation & Human Review**:
   * Sub-agents return only their structured output contracts (`[Path / Summary / Validation]`), and the main agent synthesizes them cleanly into **uncommitted changes** in the user's working tree for review.

---

## 5. Conclusion: "Tools Evolve, Governance Endures"

New LLM releases emerge monthly, and developer tooling landscapes shift continuously.

* Yesterday it was Claude Code alone,
* Today Cursor and OpenCode operate in tandem,
* Tomorrow another CLI ecosystem may arise.

With this **5-layer hierarchical harness**, underlying engineering philosophies, security baselines, and delegation standards remain rock solid across transitions. When a new tool arrives, creating a **single thin adapter** is all it takes to induct it into the engineering fleet as a trusted teammate.
