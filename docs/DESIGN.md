# Tiba 2.0 — visual identity: research, argument, verdict

Method replicated from the Tiba 1.0 identity session: one brief fired in parallel at a
9-model council (Tier 1 free models + IlmuClaw as Tier 2), reasoning from colour theory and
colour psychology about *this* product — never copying an existing brand's palette — then an
adversarial pass, then Jernih/Keruh filtering to a single verdict.

**This is not a port of Tiba 1.0.** 1.0 was batch payroll for gig workers: a human-facing
tool with a trust-and-warmth brief, which is why it landed on cream + deep blue + amber.
2.0 is machine infrastructure whose core function is *declining to pay*. Different emotional
brief, different answer.

---

## What the council said (4 usable verdicts of 9)

| | Qwen3.6 | GPT-OSS-120B | Compound-Mini | IlmuClaw |
|---|---|---|---|---|
| Mode | LIGHT | LIGHT | LIGHT | LIGHT |
| Accent | `#2563EB` | `#006D77` | `#006D77` | `#2c5f7c` |
| Paid | `#059669` | `#2a9d8f` | `#2a9d8f` | `#2c5f7c` |
| Held | `#D97706` | `#E9C46A` | `#e9c46a` | `#d9a666` |
| Refused | slate `#6B7280` | red `#D62828` | steel `#5a6d7c` | brown `#8b4513` |
| Body type | Inter | Inter | Inter | Inter |

Unanimous: LIGHT mode, Inter for body. Near-unanimous: JetBrains Mono, amber for held.
3 of 4 explicitly warned *against* red for refusals — and the one that chose red contradicted
itself in its own "avoid" line.

## The finding that mattered

Two models independently returned the **identical** hex `#006D77`. That looks like signal.
It is not.

The Tiba 1.0 council — a **different product**, batch payroll for gig workers — converged on
*teal + warm amber + light neutral*. This council, for autonomous machine payments with
refusal as the feature, converged on essentially the same palette. Two unrelated products,
same answer, same class of model.

**Conclusion: teal + amber is a fintech-trust cliché that an LLM council regresses to
regardless of the brief.** The convergence is an artefact of training data, not evidence.
Its colour recommendations are therefore discarded. Its *structural* agreements — light mode,
body typeface, "never render a refusal as an error" — survive, because those were argued from
constraints rather than association.

## Jernih / Keruh — what was kept and what was thrown out

**Kept from the adversarial pass:**

- The cliché catch above. The most valuable output of the whole exercise.
- Inter for *display* is invisible. It is the most-used interface typeface on earth; on a
  projector against judges who have seen a thousand dashboards it says nothing.
- A neutral-grey refusal **undersells the product**. Grey reads "inert, nothing happened."
  A refusal here is an active, correct, expensive decision — the machine did work and
  concluded no.
- The UI must show *why* it refused, not merely *that* it refused.

**Thrown out:**

- **"Dark mode wins."** Rejected. It contradicts the one thing argued from a real constraint
  (projector legibility in a lit room), and its supporting reasons were association, not
  evidence. More decisively: dark-mode-plus-accent *is* the cliché in this specific room.
  Swapping one default for a more common default is not differentiation.
- **Its typeface picks.** "Robot Slab" is not a typeface — fabricated (verified: Google Fonts
  returns 400; the real family is Roboto Slab). Oswald is a condensed poster face that reads
  sports/editorial-headline. Nunito Sans is rounded and friendly, wrong for a policy engine.
  Every typeface below was verified to return 200 from the Google Fonts API before listing.
- **"The boundary is the product is wrong."** The model misread the brief; that is the
  product thesis, not a council conclusion.

---

## Verdict

### 1. The organising idea

**Colour appears only where a decision was made.**

The interface is near-monochrome: ink on paper. Chrome, navigation, buttons, borders, and
labels carry no hue at all. The *only* saturated colour anywhere is a decision outcome —
paid, held, refused. Look at any screen and your eye goes straight to where the machine
exercised judgement, because it is the only coloured thing on the page.

This is the thesis rendered as a rule rather than decorated with a palette, and it is what
separates Tiba from every dashboard that paints its sidebar.

### 2. Mode — LIGHT

Kept, but not for "light means transparency," which is a metaphor, not a reason. Kept because
the room is lit, the projector will wash out low-contrast darks, and because a dark interface
with a bright accent is the single most pattern-matched look in the building. The
differentiated choice here is paper.

Not the cream of 1.0 (`#f7f3ea`) — that was warm and human for a payroll tool. This is bone:
cooler, flatter, closer to a printed record.

### 3. Palette

| Role | Hex | Contrast | Why |
|---|---|---|---|
| Background | `#FBFAF7` | — | Bone. A document, not an app surface. |
| Surface | `#FFFFFF` | — | Cards lift off the ground by being *whiter*, not darker. |
| Ink (text) | `#14161A` | 17.35:1 AAA | Near-black. Authority comes from weight, not colour. |
| Muted | `#6A7078` | 4.79:1 AA | Labels, metadata, timestamps. |
| Border | `#E4E2DC` | — | Hairlines only. Structure without noise. |
| **Paid** | `#1F6B4A` | 6.44:1 AA on white | Deep, unbright green. Settled, not celebratory — money moving is the boring case. |
| **Held** | `#8A5E12` | 5.69:1 AA on white | Deep amber. Tint `#F6E9CE` with ink text (15.06:1) for fills. |
| **Refused** | `#7A2E2E` | 9.30:1 AAA on white | Oxblood. See below. |

There is no accent colour. Primary buttons are solid ink. That is deliberate: an accent
would compete with the decision colours for attention, and attention on decisions is the
entire design.

### 4. Refused — resolving the council's split

The council split four ways on the most important colour, and 3 of 4 warned against red.
They were right about the *reason* and wrong about the *cause*.

Red reads as "error" because of how error states are **treated** — a pale pink fill, a warning
triangle, a thin red rule, positioned as an interruption. It is not the hue. A deep oxblood
applied as a **solid filled block, set in the same position and weight as the paid state**,
reads as a stamp: *declined, on purpose, by an authority.* That is a ledger convention, not
an alert convention.

So: `#7A2E2E`, solid fill, white text, identical geometry to the paid pill. Never a tint,
never an icon, never a border-left rule, never accompanied by the word "error" or "failed".
The word is **REFUSED**.

Grey was rejected because it says nothing happened. Something did happen: two isolated
channels each did real work and independently reached incompatible conclusions, and the
system correctly declined to guess. That deserves visual weight equal to a payment.

### 5. Typography

All verified present on Google Fonts.

- **Display — Instrument Serif.** A high-contrast editorial serif. It says *record,
  document, receipt, instrument* — which is literally what this product emits. It is also
  the opposite of every dashboard in the room, and it is legible at large sizes on a
  projector. Used only for page headlines.
- **Body — Inter.** The council was right for the right reason: it is invisible in body copy,
  which is what body copy should be. Distinctiveness belongs in the display face.
- **Mono — JetBrains Mono.** Request IDs, digests, work-order refs, reason codes, artifacts.
  There is a lot of machine text here and it needs to be scannable.

Scale: display 56/72px, h2 28px, body 16px, small 14px, mono 12–13px.

### 6. Per-surface hierarchy

- **`/` landing** — one sentence of argument in Instrument Serif, then the proof panel. The
  first thing the eye should hit is a real refusal with its reason, not a feature grid.
  Lead with the product refusing; that is the pitch.
- **`/console`** — the test-payment panel is the whole point of the page and goes first. Caps
  render as ink bars that fill; only the *breach* state takes colour.
- **`/ledger`** — the proof surface, currently a data dump. Fix: the decision column is the
  first column, not the fourth. Every other column is ink and mono. A judge scanning it should
  see a vertical stripe of decisions and nothing else competing.
- **`/r/[token]`** — a receipt, so set it like one. Decision at the top at full weight, both
  channels' request IDs and what each concluded below it, digest last.

### 7. Making the refusal legible — ranked

1. **Show both channels' answers side by side, disagreeing.** The reason code
   `QUORUM_SPLIT:amount_micros` means nothing to a judge. `Channel A read 250.00 · Channel B
   read 2.50 · refused` is self-evident and needs no explanation from the stage. This is the
   single highest-value change in the whole redesign.
2. **Give refused and paid identical visual weight.** Same pill geometry, same position, same
   type size. Equal treatment is the argument: both are correct outcomes.
3. **State the counterfactual in plain words.** "Would have paid 250.00 USDC" under a
   refusal. It makes the saved money concrete.

### 8. Cut

- The cyan/emerald/amber/red Tailwind default palette. Four hues competing, none meaning
  anything.
- `font-black` everywhere. Weight is being used as a substitute for hierarchy.
- The 3-step "how it works" grid on the landing page. Judges do not read three boxes in 90
  seconds; the proof panel does that job better.

### 9. Open question for the pitch, not the code

The demo shows refusals working. It does not yet show the *cost* of not having them — the
counterfactual payment that would have gone out. Point 7.3 covers this in the UI, but the
verbal pitch should carry it too.
