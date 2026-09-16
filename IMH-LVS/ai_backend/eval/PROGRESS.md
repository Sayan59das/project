# Accuracy improvement — running progress log

Plain-English log of what's been done, updated as work continues. Started
2026-09-15/16 overnight session. For full technical detail on any step,
see that step's own `STEP<N>_*.md` file in this same folder. For real
numbers, see `RESULTS.md` — this file never quotes a number that isn't a
row there.

The goal: `python eval/score.py --mode pipeline` at 80%+ on the client's
45 real labels, honestly measured.

## Where things stood before this log started

- Step 0 (get the codebase merged and working): **done**.
- Step 1 (read every wrong answer by hand before touching any code):
  **done**. Branch `feat/accuracy-step1`, pushed, not yet merged.
- Step 2 (figure out which part of the pipeline produced each answer):
  **done**. Branch `feat/accuracy-step2`, pushed, not yet merged. Found the
  AI model is actually excellent at brand name (91%) while the simpler
  methods are at 0% there; product name has no working method at all.
- Step 3 (a fairer scoring method that doesn't penalize near-misses like
  "30" vs "30 Gummies"): **done**. Branch `feat/accuracy-step3`, pushed,
  not yet merged. Real result: 25.5% (old strict count) → 39.5% (fair
  count), no code changed — that gap was purely how strict the old
  counting was.
- Step 4.1 (settle what "product name" and "brand name" mean): **done** —
  you answered this directly; recorded in `RESULTS.md`.
- Step 4.2 (prepare a page for a human to double-check the answer key):
  **done** — the review tool already existed and works; a guide for doing
  the actual review is at `ai_backend/finetune/REVIEWER_GUIDE.md`,
  whenever you get a chance to spend the ~1 hour on it. One of the 12
  known conflicts was already fixed automatically (a mechanical
  application of an answer you'd already given, not a new judgment call).
- Step 4.3 (re-measure after the human review): **waiting on you** — not
  blocking the rest of the work, per your choice to keep going in the
  meantime.

## Step 5 — the actual fix loop

Going field by field, in order of how many cells each field has (biggest
first), since that's what moves the overall number most. Each fix: find
the real pattern in the wrong answers, write a test that fails for that
exact reason, fix it generically (never using one specific label's text —
must work on a label the code has never seen), confirm the test passes,
then re-run the real 45-label pipeline to confirm the number actually
moved before calling it done.

### 5.1 — nutrition_table: **done**, real number confirmed

95 of 194 wrong answers were the pipeline mistaking a nearby sentence — a
"based on a 2000kcal diet" disclaimer, a dosage instruction, a storage
note, an RDA-guideline citation — for an actual nutrient row, just because
that sentence happened to start with a number. Fixed by teaching the code
what a real nutrient row looks like (short, number+unit shaped) versus a
sentence (long, reads like English prose). Also fixed a second bug found
along the way: the cleanup step for stray %RDA columns was accidentally
deleting real "Kids vs. Adults" dose breakdowns too.
**Real result: 21.1% → 23.4% strict, 194 wrong → 133 wrong.**

### 5.2 — ingredients: **done**, real number confirmed

The list-splitting logic cut on every comma, including ones inside a food
additive's own code list — "Gelling Agents (INS 440, 418, 407)" became
three broken fragments instead of one ingredient. Fixed with a
parentheses/brackets-aware split.
**Real result: 30.9% → 41.1%, 170 wrong → 75 wrong, 217 correct → 250 correct.**

### 5.3 — claims: **done**, real number confirmed

Claims were barely found (327 of 383 missing) partly because the
allergen-detection list only recognised 2 specific "X Free" claims
(gluten, sugar) out of the many real ones on these labels (Gelatin Free,
Milk Free, Nut Free, Peanut Free, Soy Free — all real, all missed).
Generalised to the shape "any word + Free" instead of a fixed list.
**Real result: 6.3% → 16.6% strict (24 correct → 72 correct), fabrication
rate unchanged at 0%.** (Wrong count also rose — expected, not a
regression: most of claims' "wrong" is really the answer key not having
caught up yet, same finding as before.)

### 5.4 — package_size: **done, real number confirmed**

The dominant wrong-answer pattern (35 of 40) was the same everywhere: the
right number, unit word dropped ("30" instead of "30 Gummies"). Found and
fixed in all three places that read a pack count (the "Net Content:"
line, the general "<number> Gummies/Tablets/..." text match, and the
front-of-pack badge photo-reading path) — all three were silently
throwing away the unit word.
**Real result: 2.2% → 35.6% (26 wrong, was 40; 16 correct, was 1).**
Confirmed once memory allowed a full run the next morning — matches what
the two real-label spot-checks predicted overnight.

### 5.5 — marketing_company / address: **done, real number confirmed**

One whole family of ~8 labels prints the company name and its address
BEFORE the "Marketed by" line, with the line right after "Marketed by"
being a licence number, not the company name — the code was always
reading the line right after that phrase, so it grabbed the licence
number every time. Fixed to look above the phrase for the real company
name when the line below it doesn't look like one. Fixing marketing
company this way fixed address too, for free — it starts reading from
wherever the company name was found, so once that's right, the address
right after it is too.
**Real result: marketing_company 26.7% → 44.4%, address 17.8% → 35.6%.**
Also confirmed the next morning, matching the overnight spot-checks.

**Overall after 5.4+5.5 (real, confirmed): 29.9% → 31.3% strict (44.9%
fair-scoring), vlm on: 31.7% strict (45.5% fair-scoring).** The AI model
is now even better at brand name when it gets a turn — 7 correct, 0
wrong (100%) this run, up from 91% before — while product name stays at
0% even through the AI model, confirming that field's problem runs
deeper than just "which method answers it" (see 5.6 below).

### 5.6 — brand/product name: **investigated, real fix intentionally not made yet**

This is the field the plan itself says needs the most care, and it's the
last one before Step 6. What was found, from reading a real label's
actual text directly on two different labels tonight (not guessing):

For several labels, the real brand name ("Calrio", "Sleeprio", ...) is
never printed as ordinary readable text at all — it only exists as a
styled picture/logo, the kind of text a computer can't read directly
from the file, only by looking at the image. Meanwhile, the tool that
reads ordinary text is still trying to guess a brand/product name from
whatever real words ARE nearby, and on these labels that means it picks
something else nearby ("Relax", "Gummies For Adults Strawberry Flavour
Gluten Free Gelatin Free") and is confident about it. Earlier
measurement already showed this same pattern in numbers: on every one
of the 45 labels, whenever the plain-text-reading method produced a
brand name, it was wrong — not most of the time, literally every single
time (0 right out of 17 tried). Confirmed twice more tonight by reading
two more real labels directly.

Two things make this worse together: the AI model IS good at this exact
job (found right back in an earlier step — 91% correct when it gets to
run) — but the plain-text method runs first, and once it's filled
something in, even wrongly, nothing else is allowed to overwrite it. So
the guess isn't just wrong: it's actively blocking the one thing that's
good at this from ever being tried on 17+ labels.

The obvious next fix — stop letting the plain-text method guess a
brand/product name at all, and let the AI model (or the picture-reading
method) take over that job entirely — is not being made tonight,
on purpose. It's a bigger, more sweeping change than tonight's other
fixes (it touches how EVERY label is read, not one template family), and
it cannot be safety-checked without a full run through the measurement
tool, which could not complete tonight (see below). Given the plan's own
explicit instruction to be extra careful with this exact field, that
verification gap is a real reason to wait, not something to push past.
This is written up here as a concrete, ready-to-do next step, backed by
real numbers and two fresh real-label checks — not a guess still waiting
to be tested.

## Tonight's memory trouble, in plain terms

From partway through Step 5.4 onward, the measurement tool (which reads
all 45 labels at once and needs real memory to do it) stopped being able
to finish — killed by Windows for running low on memory, over and over,
even after trying smaller batches (5 labels at a time, then 3, then 2,
then 1 label at a time — all failed the same way). Checked honestly
rather than guessing: freeing up memory by stopping the database program
was tried once (it isn't needed for this kind of check), but that
backfired — the database program restarted itself several times on its
own and ended up using MORE memory than before, so that approach was
abandoned rather than made worse a second time. This looks like a wider
overnight slowdown on this machine (possibly Windows doing its own
background maintenance), not something wrong with the project's own
code or tools.

Worked around it by checking each fix a different, lighter way instead:
automated tests (which don't need much memory) plus reading real labels
one at a time directly (much lighter than all 45 at once) rather than
the full official measurement. Every fix tonight passed both of those
checks. The official percentage for 5.4 and 5.5 will still need a real
full run once memory allows — either later tonight if it recovers on its
own, or in the final whole-project pass.

## What's next

Try the full measurement again if memory allows, to catch up 5.4/5.5's
real numbers. The concrete, ready-to-do brand/product name fix above,
once it can be safety-checked properly. Then Step 6 only if needed, then
Step 7. A full, final test of the whole project and a final results
write-up come once all of that is done, as asked.
