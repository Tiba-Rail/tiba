# Declaration of AI tools used during development

Required by the MUBA Blockchain Hackathon 2026 submission rules.

This project was built by a two-person team in which the founder directs AI coding agents
rather than writing most code by hand. That is stated plainly here so nothing about the
development process is misrepresented.

## Tools used in development

- **Claude Code (Anthropic)** — primary agent for architecture, implementation, review, and
  this documentation. Orchestrated by the founder; all product decisions are human decisions.
- **OpenAI Codex CLI** — delegated implementation slices, research, and independent review
  of Claude Code's output.
- **GonkaRouter** (`api.gonkarouter.io`) — used *inside the product* as the verification
  layer, not as a development tool. See README for the models and their roles.

## What the humans did

Problem selection, product scope, every design decision recorded in `docs/DECISIONS.md`,
acceptance of each implementation slice, the pitch, and the demo. The team reviewed and
tested every generated change before it was committed.

## What is not claimed

No part of this submission is represented as entirely human-written code. Where a judge
wants to know which commits were agent-generated, the answer is: most of them, under human
direction, in this repository, inside the hackathon window.
