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

### 5.4 — package_size: **fix done and committed, real number pending**

The dominant wrong-answer pattern (35 of 40) was the same everywhere: the
right number, unit word dropped ("30" instead of "30 Gummies"). Found and
fixed in all three places that read a pack count (the "Net Content:"
line, the general "<number> Gummies/Tablets/..." text match, and the
front-of-pack badge photo-reading path) — all three were silently
throwing away the unit word. Confirmed working correctly by reading two
real labels directly (not through the full scoring tool, see below) —
both now come back with the unit word attached, matching the answer key.

**Why no real scoring number yet**: the full 45-label measurement tool
would not finish tonight — 5 attempts in a row, at shrinking batch sizes,
all got shut down by Windows for running low on memory. Tried freeing
memory by stopping the database program (not needed for this measurement)
but that backtracked — it restarted itself multiple times and left LESS
memory free than before, so that was undone and not attempted again.
Confirmed the fix genuinely works by testing it directly on two real
labels instead (much lighter than the full 45-label run), which is solid
evidence the code is correct — just not yet the full official percentage.
Will get the real number as soon as the measurement tool can complete a
full run, likely either later tonight if memory recovers on its own, or
in the final whole-project test pass at the end.

## What's next

5.5 (address / marketing company) → 5.6 (brand/product name, blocked on
your review pass being done first for the brand/product part
specifically). Then Step 6 only if needed, then Step 7. Once memory
allows, a full pipeline run to confirm 5.4's real number and catch it up
in `RESULTS.md`. A full, final test of the whole project and a final
results write-up come once all of that is done, as asked.
