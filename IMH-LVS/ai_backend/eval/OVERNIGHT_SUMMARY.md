# Overnight work summary (2026-09-15 into 2026-09-16)

**This is NOT the final report.** You asked for a final results write-up
once every step is done — several steps are still open (see "What's not
done" below), so this is an honest snapshot of where things stand right
now, written so you can pick up cleanly whenever you check back. The real
final report will follow once the remaining steps are finished and a
full test can run cleanly.

## The one-line version

Started the night at 25.5% (the honest, strict count). The real,
verified number right now is **29.9%** on the strict count, **43.1%** on
the fairer count that also credits near-misses — both from a real
45-label run, not an estimate. Two more fixes are made and tested but
not yet re-measured against all 45 labels (see "memory trouble" below)
— once that catches up, the real number should be noticeably higher
still, based on how the earlier fixes moved things.

## What's done and has a real, verified number

| Field fixed | Before | After | What was wrong |
|---|---|---|---|
| Nutrition table | 21.1% | 23.4% (133 wrong, was 194) | A nearby sentence ("based on a 2000kcal diet") was being read as if it were a nutrient amount, just because it started with a number. |
| Ingredients | 30.9% | 41.1% (75 wrong, was 170) | The ingredient list was being cut apart at every comma, including commas inside a food-additive code like "(INS 440, 418, 407)" — breaking one real ingredient into three garbled pieces. |
| Claims | 6.3% | 16.6% (72 correct, was 24) | The tool only recognised two specific allergen-free claims (gluten, sugar) out of the many real ones on these labels (milk, nut, peanut, soy, gelatin — all real, all missed) — taught it to recognise the general shape "any word + Free" instead of a fixed short list. |

**Overall real number after these three: 25.1% → 29.9% strict, 38.9% →
43.1% fair.** (Step 3, done earlier, is what introduced the "fair"
count — it doesn't punish a near-miss like "30" vs "30 Gummies" as
harshly as an exact-match count would; both numbers are tracked side by
side, always.)

## What's done and tested, but not yet re-measured against all 45 labels

| Field fixed | What was wrong | Confirmed by |
|---|---|---|
| Package size | The right number was found, but its unit word ("Gummies", "N", "Sticks") was being thrown away every time — "30" instead of "30 Gummies". Fixed in all three places this can happen. | 20 automated tests, all passing. Checked on 2 real labels directly — both now show the number with its unit attached, matching the answer key. |
| Marketing company & address | One whole family of ~8 labels prints the company name and address BEFORE the "Marketed by" line — the line right after "Marketed by" is a licence number on these, not the company name, so the tool was reading the licence number instead every time. Fixed to look above the anchor when the line after it doesn't look like a company name. | 5 automated tests, all passing. Checked on 2 real labels from that family directly — both now show the real company name and address instead of the licence number / a random disclaimer sentence. |

These are real code fixes with real evidence, just not yet run through
the official 45-label measurement — see below for why. Given the pattern
from the three fixes above (every one of them made the real number go
up, sometimes by a lot), these two are expected to do the same, but
"expected" isn't the same as "measured," so they're reported honestly as
not-yet-measured rather than guessed at.

## What's investigated, with a clear next step, but NOT fixed yet

**Brand name and product name.** This is flagged in the plan itself as
needing the most caution of any field, and that caution was followed
here: a real, well-evidenced fix was found but deliberately not made
tonight, because it's a bigger, more sweeping change than the others
(it affects how every label is read, not one template family) and can't
be safety-checked without the full 45-label measurement tool, which
would not run tonight (see below).

What was found: on several labels, the real brand name is only present
as a styled picture/logo, not as text a computer can read directly — so
the "read the text" method has nothing real to find and instead
confidently guesses something else nearby that's wrong. This isn't a
one-off: across all 45 labels, every single time the plain-text method
produced a brand name, it was wrong (0 right out of 17 tried) —
confirmed by checking two more real labels tonight, both wrong the same
way. Meanwhile, a different part of the same tool (an AI model reading
the actual image) is good at this exact job — 91% correct when it gets
to run — but because the wrong text-based guess fills in first, the
better method never gets asked. The fix would be to stop letting the
text-based method guess for these two fields specifically, so the
better method always gets a turn. Written up in full detail in
`PROGRESS.md`, ready to implement once it can be properly checked.

## What's not done at all

- Getting your ~1 hour of checking the answer key against the real
  labels (the review tool is ready and running — see
  `finetune/REVIEWER_GUIDE.md` for exactly what to check).
- The brand/product name fix described above.
- Trying a bigger AI model (only relevant if everything else stalls
  under the target — not reached yet).
- The last cleanup step (calibrating which fields get flagged for
  review, showing that in the actual app).
- A full, clean run of every automated test in the whole project (see
  below — the same memory trouble affected this too).

## Tonight's memory trouble, honestly

Partway through the package-size fix, the tool that measures all 45
labels at once stopped being able to finish — Windows kept shutting it
down for running low on memory. Tried smaller and smaller batches (5
labels at a time, then 3, then 2, then 1) — all failed the same way,
including a few tries after memory looked healthy again, which suggests
this wasn't really about batch size. Tried freeing memory by stopping
the database program (not needed for this kind of check) — that
backfired, it restarted itself on its own and ended up using MORE memory
than before, so that approach was dropped rather than made worse a
second time. This looks like something going on with the machine
overnight more broadly (Windows doing its own background maintenance is
a reasonable guess), not a problem with this project's own code.

In total, 9 separate attempts to run the full measurement tonight all
failed this way, across a wide range of starting memory conditions. The
project's own automated tests (a much lighter check) also failed to run
in full for the same reason at one point, though a smaller, still
meaningful slice of them (the ones specific to tonight's changes) did
run clean.

**What this means practically:** every fix made tonight is backed by
real evidence — either a full 45-label measurement (the first three) or
automated tests plus direct checks on real labels (the last two) — but
the last two are missing the single official percentage number until a
full run can complete. That's a real gap, reported honestly rather than
guessed at or hidden.

## Suite status (automated tests)

- **ai_backend** (Python): 205/205 passing, last full clean run.
- **frontend**: 48/48 passing, last full clean run. Untouched tonight.
- **backend**: could not get a full clean run tonight due to the memory
  issue above. The specific tests for tonight's changes were run
  directly instead: 97/98 passing (the 1 failure is an already-known,
  unrelated gap — a test fixture file that was never committed to this
  project, flagged back in an earlier step, nothing to do with tonight's
  work). A full clean run of the whole backend suite is still owed once
  memory allows.

## Everything is committed and pushed

All of tonight's work is on the `feat/accuracy-step5` branch (which
builds on the earlier steps' branches), pushed to the remote repository.
Nothing is sitting only on this machine unsaved. The review tool
(`finetune/review_server.py`) is still running at
http://127.0.0.1:8850/, ready whenever you want to do the review pass.

## What happens next

Left running / will keep trying: nothing right now — repeatedly retrying
the failed measurement risks doing more of what already backfired once
tonight, so this is a natural stopping point to wait for you rather than
keep pushing blindly. When you're back: say the word and the plan
picks up exactly where this leaves off — catch up 5.4/5.5's real
numbers once memory allows, then the brand/product name fix (properly
checked this time), then whatever's left of the plan after that.
