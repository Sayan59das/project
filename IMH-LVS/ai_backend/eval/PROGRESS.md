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

## What's happening now: Step 5 — the actual fix loop

Going field by field, in order of how many cells each field has (biggest
first), since that's what moves the overall number most. Each fix: find
the real pattern in the wrong answers, write a test that fails for that
exact reason, fix it generically (never using one specific label's text —
must work on a label the code has never seen), confirm the test passes,
then re-run the real 45-label pipeline to confirm the number actually
moved before calling it done.

### 5.1 — nutrition_table (532 cells, was 21.1% strict / 44.6% fair)

**Status: first fix landed, verifying with a real run next.**

Found: 95 of 194 wrong answers were the pipeline mistaking a nearby
sentence — a "based on a 2000kcal diet" disclaimer, a dosage instruction,
a storage note, an RDA-guideline citation — for an actual nutrient row,
just because that sentence happened to start with a number. Fixed by
teaching the code what a real nutrient row looks like (short, number+unit
shaped) versus a sentence (long, reads like English prose) — a generic
shape rule, not anything specific to one label's wording. Along the way,
found and fixed a second bug: the existing cleanup step for stripping
stray %RDA columns was also accidentally deleting real "how much for
kids vs. adults" breakdowns that happened to contain a % sign.

Tests: 4 new ones added, all using real wrong-answer examples pulled
straight from the tool's own diff output, not made up. 32/33 relevant
tests passing (the 1 failure is a pre-existing, already-documented missing
test file unrelated to this).

Not yet fixed in nutrition_table (left for a later pass on this same
field, per the plan's "two or three passes per field"): a smaller pattern
where a two-population label (e.g. "Kids" vs "Adults" get different
amounts) only captures one of the two numbers; a handful of short
fragments that aren't sentences but also aren't real values.

## What's next

5.1 verification run → 5.2 (ingredients) → 5.3 (claims, likely blocked
mostly on your review pass since its real problem is missing answer-key
entries) → 5.4 (package size) → 5.5 (address / marketing company) → 5.6
(brand/product name). Then Step 6 only if needed, then Step 7. A full,
final test of the whole project and a final results write-up come once
all of that is done, as asked.
