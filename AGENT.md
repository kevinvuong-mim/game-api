# AGENTS.md

# Backend Engineering Guidelines

## Goal

This project prioritizes:

- Simplicity
- Stability
- Readability
- Low maintenance cost
- Low bug risk

This project does NOT prioritize writing the most elegant or abstract architecture.

---

# Core Principles

Always follow these principles in order:

1. Keep existing behavior unchanged unless explicitly requested.
2. Simplicity over cleverness.
3. Readability over abstraction.
4. Stability over perfection.
5. Explicit code over generic code.
6. KISS.
7. YAGNI.
8. Minimize total project complexity.

When unsure, choose the simpler solution.

---

# Refactoring Rules

Refactor only when there is measurable improvement.

Do NOT refactor simply because code can be written differently.

Every refactor must reduce at least one of:

- cognitive complexity
- duplicated logic
- nesting depth
- unnecessary abstraction
- maintenance cost

Otherwise, leave the code unchanged.

---

# Scope Rules

Never modify unrelated code.

Never perform opportunistic refactoring.

Only change code necessary for the current task.

Small focused changes are preferred over large rewrites.

---

# Architecture

Avoid creating:

- unnecessary services
- unnecessary repositories
- unnecessary helper files
- wrapper functions
- utility files used only once
- generic abstractions
- interfaces with only one implementation
- deep inheritance

Prefer explicit code.

---

# NestJS

Prefer standard NestJS patterns.

Do not introduce custom patterns unless there is a clear benefit.

Keep controllers thin.

Business logic belongs in services.

Avoid service chains such as:

Controller
→ Service A
→ Service B
→ Service C

when one service is sufficient.

---

# Prisma

Keep queries straightforward.

Avoid unnecessary query builders.

Avoid premature optimization.

Transactions should only be used when required.

---

# Validation

Avoid duplicated validation.

Use DTO validation whenever possible.

Do not validate the same thing multiple times.

---

# Error Handling

Keep error handling simple.

Return meaningful errors.

Avoid wrapping every exception unless necessary.

---

# Dependency Injection

Only inject dependencies that are actually used.

Avoid creating services solely for dependency injection.

---

# Performance

Do not optimize prematurely.

Only optimize after identifying a real bottleneck.

Readability is preferred over micro-optimizations.

---

# Logging

Log meaningful events.

Avoid excessive logging.

Never log sensitive information.

---

# Security

Never reduce security.

Never expose secrets.

Never weaken authentication or authorization.

---

# Code Style

Prefer:

Early return.

Small functions.

Descriptive names.

Straightforward logic.

Avoid excessive comments.

Good code should explain itself.

---

# Before Adding Code

Ask:

Can existing code solve this?

Can existing code be simplified?

Can code be deleted instead?

Every new line increases maintenance cost.

---

# Before Finishing

Verify:

✓ Behavior remains identical.
✓ No unrelated files changed.
✓ Complexity did not increase.
✓ No unnecessary abstractions added.
✓ No dead code introduced.
✓ No duplicated logic introduced.
✓ The solution is easy for another developer to understand.

If any answer is NO, reconsider the implementation.
