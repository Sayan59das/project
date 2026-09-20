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

**Update, next morning, memory allowed a real attempt**: tried the
obvious fix described above — stop letting the plain-text method guess a
brand/product name at all, let the AI model take over that job entirely.
Built it, and before trusting it, checked it against this project's own
existing tests (not the client's 45 labels — this project's OWN test
PDFs, used to catch regressions). It broke several of them: this
project's own test labels (brand names like "VitaFit", "Nutrinol",
"Homeo-Vita", "Sharp Mind Plus", "She-Arise") are cases where the
plain-text method currently gets the brand right, reading real words
that really are the brand name on those specific labels. A blanket "never
trust the plain-text guess" rule would have thrown away correct answers
on these to fix wrong answers on the client's labels — a real step
backward disguised as a fix.

**So the "0 right out of 17" number needs a correction**: that's true for
the client's 45 labels specifically, not true in general — this
project's own test labels prove the plain-text method genuinely works
sometimes, when the real brand name is actual readable text on the label
(not a stylised picture/logo, which is what's happening on the client's
Riomedica-family labels specifically). The fix isn't "never trust
plain text for this field" — it's "tell the two situations apart," and
that's a harder, smarter problem than the overnight write-up made it
sound. The code change was reverted rather than kept in a half-right
state. No safe, generic way to tell the two situations apart has been
found yet — this remains open for now, but a smaller, safer fix was
found afterward (see below).

**Later update: a small, real fix was found and kept.** Instead of the
big "never trust plain text" rule that broke other labels, a much
narrower rule was tried: don't let the plain-text method guess a brand
name that is really just a piece of the already-correctly-found company
name. This came from reading one label's actual computer-read text
directly (Calrio Gummies): on a sideways panel of the package, the word
"RIOMEDICA" gets read on its own short line, separate from the full
company name "RIOMEDICA HEALTHCARE PVT. LTD." that the tool had already
correctly found elsewhere on the same label. The old check only looked
one way — "does this line contain the full company name" — which missed
this, because here it's the other way around: the short guess is
*part of* the company name, not the other way round. Fixed by checking
both directions, with a minimum length so short unrelated words (like
"Cal") don't get wrongly blocked just because they happen to appear
inside a longer, unrelated company name.

This was checked against every one of this project's own real test
labels first (not just the client's), so it would not repeat the
overnight mistake — all of them still pass, nothing that used to work
broke.

**Real, measured result, run on all 45 client labels again:**
- With the AI model turned off: one wrong brand-name guess became a
  blank instead (no longer actively wrong, but no new correct answer
  either, since plain text still has nothing better to offer there).
- With the AI model turned on: brand_name accuracy moved from **17.8%
  to 20.0%** (8 correct → 9 correct, out of 45). Blocking the one bad
  guess freed that label up for the AI model to have a turn, and the AI
  model — which is very good at this field, 100% correct whenever it
  gets to try — got it right.

**Honest scope of this fix**: it is small. It only catches the specific
case where the wrong guess overlaps the real company's name. Most other
wrong brand-name guesses (ordinary marketing text with no connection to
the company name, like "Relax") are not touched by this and remain
wrong. Overall headline accuracy barely moved because of this one
change alone. product_name is still stuck at 0% everywhere, including
through the AI model — a separate, still-unexplained problem that this
fix does not address.

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

## Continuing Step 5 the next day: nutrition table and claims, round two

Step 5's own fields (nutrition table, ingredients, claims) were each given
one dedicated round already (5.1/5.2/5.3), but the real numbers showed
nutrition table and claims were still the two biggest problem areas by
far — together almost 40% of everything being measured, and both still
under 25% correct. Since the plan says to chase the biggest levers first,
this continued digging into those two specifically rather than moving on.

**Nutrition table — found a real structural gap.** Reading the wrong/
missing list by hand (the same technique from Step 1) showed something
different from Step 5.1's problem: on several labels, EVERY SINGLE
nutrition row was missing — not a few rows wrong, the whole table blank.
Dumping one such label's actual PDF text directly (Derocal IRN177-1.pdf)
showed why: its nutrition table is printed as an image, not real text —
so the tool that reads a PDF's built-in text has nothing to find there.
The surprising part: the tool ALSO never tried its other reading method
(reading the image itself, the way a person would) for this specific
piece of information — that method only ever ran for the other fields
(company name, address, etc.), never for the nutrition table, even
though it was already being used on the same page for other things.

Built a fix that teaches the image-reading method the same row-and-column
logic already used for real PDF text, so it can find a nutrition table
that only exists as a picture. First version of this was too blunt — it
forced the image-reading method to run on EVERY label just in case, and
that had a real side effect: the image-reading method's own name-guessing
logic (built for when the ordinary reading fails) sometimes overwrote an
already-correct brand or product name with a wrong guess, once it started
running on labels where it never used to run at all. A real, measured
run confirmed this: brand name accuracy dropped rather than rose. Caught
this by checking real before/after numbers rather than just checking that
tests passed, exactly the lesson from the earlier overnight brand-name
mistake this document already describes. Fixed by keeping the two things
completely separate: if a label's other fields are already correctly
read, only a narrow, isolated check for the nutrition table's image runs
— it never touches or risks the fields that were already right.

**Claims — found two real bugs, one already-shipped and one new.**
Reading the wrong-answer list for claims (real score.py output) showed
the "any word right before 'free'" rule added in Step 5.3 was too loose:
across many labels, a misread letter or two from the image-reading method
right before a genuine "free" elsewhere on the label was being reported
as its own fake claim ("Wilk Free", "Nay Free", "D Free" — real garbage
from a real run, none of it printed on any label). Fixed by only
accepting that shape when the word right before "free" is a real,
common allergen/dietary word (gluten, milk, soy, nut, peanut, dairy,
egg, wheat, gelatin, and others) — a small, general list that applies to
any label in this industry, not anything specific to one client's
products, the same principle Step 5.3's original fix already followed.

Reading the MISSING list (not just the wrong one) for claims turned up a
second, real, previously-uncaught claim shape: dumping a real label's
text (Cal. Vit D IRN120-1.pdf) showed it prints "NO GELATIN", "NO
GLUTEN", "NO MILK", "NO PEANUT", "NO NUT", "NO SOY" as six separate
badges — a completely different way of saying the same kind of thing as
"gluten free", which nothing in the tool recognised at all. Added a
second, matching rule for that shape, gated by the exact same allergen
word list so it stays safe (the word "no" alone is far too common in
ordinary label prose — "do not exceed", "no warranty" — to match on its
own). The same label also has a longer sentence ("Free of: Wheat, Milk,
Eggs, Soy, Tree Nuts, Peanuts, Fish...") that mentions even more
allergens, but the real ground-truth answers for this label only count
the six standalone badges, not that longer sentence — so that sentence
was deliberately left alone rather than parsed too, to avoid inventing
claims the human reviewers didn't actually record.

**Two more small, real claims bugs found and fixed the same way.** A
label (EYE WELLNESS DOMESTIC LABEL MHJ.pdf) prints bare "No
Preservatives", but the one existing rule for this always reported "No
Added Preservatives" regardless of whether "Added" was actually printed
— fabricating a claim the label doesn't make while missing the one it
does. Split into two separate rules so each only fires for its own exact
wording. The same label also makes a real claim, "No Artificial
Colours", that nothing recognised at all — added as a new rule.

**One more real claim shape was found, then deliberately NOT built.**
The same label family (Iron IRN74-1.pdf, confirmed by reading its actual
text) prints a combined badge, "FREE FROM   GLUTEN | MILK | SOY", as its
own single claim — alongside, not instead of, the six separate "GLUTEN
FREE"/"MILK FREE"/... badges already covered. Building a matcher for
this was straightforward, but it uncovered a real, structural problem:
this app joins every claim on a label into one saved value using
" | " as the separator between claims — the exact same character this
one claim's own text contains. The code that reads that saved value back
apart (`scripts/extract-pipeline.ts`'s `parseDelimited`) does a plain
split on that separator, so this one claim would come back shattered
into three wrong pieces ("Free From Gluten", "Milk", "Soy") instead of
staying one claim — worse than not extracting it at all. Properly fixing
this means either picking a different separator for claims that won't
collide with real label text (risks quietly no longer matching the exact
wording some ground-truth answers already use), or storing claims as a
real list all the way through instead of one joined-up piece of text
(the correct fix, but changes something several other parts of the code
rely on). Left this for the human to decide rather than picking one
unasked — noted in the code so it isn't lost. Affects a small number of
labels (around 4 missing claim cells seen so far), so it's a minor
opportunity either way, not a blocker.

All of today's claims fixes are written and passed a compile check; the
official before/after numbers are still pending a full run — testing was
paused partway through this work at the user's request, to be done
together as one batch rather than one run per fix. Not yet claiming a
percentage for any of them in RESULTS.md until that real run happens,
per the standing rule that every number quoted here has to be a row
`score.py` actually wrote.

**Package size — a genuine ambiguity, taken to the user rather than
guessed at.** Reading the wrong-answer list for package_size showed the
single biggest pattern in the whole session so far: 22 of the 26 wrong
answers were "<number> N" when the real answer was "<number> Gummies" or
"<number> Sticks" — the tool was preferring a generic regulatory count
label ("Net Content: 30 N") over the product's own front-of-pack wording
("30 Gummies"). Tempting to just flip the order and call it fixed, but
checking it against a real label first (the lesson from the earlier
overnight brand-name mistake, applied again) turned up a real complication:
one label that currently gets the RIGHT answer ("30 N") genuinely prints
BOTH things — a real "Net Content: 30 N" line AND a real, separate "30
GUMMIES" front badge — and the human reviewers picked "N" for that one
specifically. The same shape of text is the right answer on some labels
and the wrong answer on others, with nothing in the text itself to tell
them apart. Rather than guess, this was put to the user directly with
the real evidence and the real tradeoff (fixes the 22, may cost the
handful like this one). The user chose to make the switch anyway, as the
better bet across all 45 labels. Done: the tool now tries the product's
own form-word wording first, and only falls back to the regulatory "N"
count when no form word is found on the label at all. All 8 existing
tests for this still pass by hand-tracing the logic (not yet run for
real, same testing pause as above), and two new tests lock in the new
behaviour plus the still-correct fallback.

**Ingredients — one more clean, mechanical bug found and fixed.**
Looked at ingredients next since its missing count was still large even
after Step 5.2's fix. Comparing the WRONG list against the MISSING list
side by side turned up a clear, purely mechanical pattern: "Vitamin D."
(with a trailing period) was being reported as WRONG while "Vitamin D"
(no period) was MISSING — the exact same fact, just with the whole
ingredients declaration's own closing full stop stuck onto whichever
item happened to be last. 27 of 75 wrong answers in one real run were
exactly this shape. Fixed by trimming one trailing period off every
split item (not just the last one, since a source PDF's own line breaks
can land the stray punctuation anywhere) — an ingredient name is never
itself supposed to end with a period, so this is safe. Also looked at:
a second real pattern where the label uses "and" instead of a comma
before the last item in a short list ("...Flavour and Food Colour:
...") — ground truth splits there too, but this fix was NOT made; it is
a real risk on any ingredient name that legitimately contains the word
"and", and needs more evidence before it is safe to build generically,
so this was left alone rather than guessed at. Also plenty of ingredient
wrong-answers were pure OCR garbage on the labels with little/no real
PDF text (letters and words that don't spell anything) — not something a
text-shape rule can safely clean up, so also left alone.

Also looked at address next (12 wrong, 16 missing), but it did not have
one clear, high-confidence pattern the way nutrition table, claims,
package size and ingredients did — it's a mix of separate problems
(company name text bleeding into the address, a PDF font-ligature
encoding glitch showing "office" as "ofce", and some addresses
that are just genuinely hard multi-line "Registered office: ...
Corporate office: ..." text) needing more careful, separate
investigation later rather than a quick fix now.

## Real numbers for everything above, now that testing resumed

The user gave the go-ahead to test. Backend test suite: 461 tests, 442-445
pass depending on the run; every failure traced to a known, pre-existing
cause (a handful of database tests that were already flaky before this
session from stale seed data, one OCR engine test that times out under
load, one fixture file moved out of `Dataset_Example` earlier in the
project's own history) or to running many tests at once competing for
the same database connections — confirmed by re-running the affected
files one at a time, where they all pass cleanly. Two real mistakes in
today's own new tests were caught and fixed by the test run itself:
one test asserted the wrong letter-casing for a value that was always
going to keep the label's own printed casing (not a code bug, a wrong
expectation), and one real bug where the new "No X" claim rule was
firing a second time on text a badge rule had already correctly claimed
in full ("No Artificial Colours" also (wrongly) produced a bare "No
Artificial") — fixed by checking whether an existing claim already
starts with the new one, not just whether it's an exact match.

**Full 45-label measurement, before vs. after everything in this
session** (`--vlm off`, since `--vlm on` came back byte-for-byte
identical this run — the AI model's brand-name help didn't get a chance
to run on any label this time, a real, honest result to report, not
something today's fixes touched):

Overall: **31.3% → 34.4%** strict match, **44.9% → 46.7%** fuzzy/fair
match (the 80% target metric).

- **claims**: 19.4% → 24.6% (fair match). Wrong answers dropped from 71
  to 35 — confirms the OCR-garbage cleanup worked. Missing dropped from
  269 to 256 — the new "NO X" badge rule recovering real claims.
- **package_size**: 37.8% → 55.6% (fair match). 8 labels moved from
  wrong to correct, 0 moved the other way in the aggregate — the
  form-word-first reordering paid off cleanly, at least in this run.
- **ingredients**: strict match jumped 250 → 271 correct (the trailing-
  period fix); the fair/fuzzy number stayed flat at 305, because the
  fairer metric was already treating "Vitamin D." and "Vitamin D" as the
  same thing — so this fix only helps the stricter of the two numbers,
  not the one the 80% goal is measured on.
- **nutrition table**: roughly flat on its own, 49.8% → 49.1% (fair
  match) — it DID recover 8 previously-blank cells (missing dropped
  211 → 203), but most of those came back as wrong rather than right,
  because the picture-reading method still misreads digits/units often
  enough that finding MORE of the table isn't the same as reading it
  MORE ACCURATELY. Coverage isn't the bottleneck for this field anymore;
  reading accuracy is.
- **Everything else** (brand name, product name, address, flavour,
  marketing company, FSSAI number, customer care fields, manufacturing
  company): completely unchanged, confirming none of today's fixes had
  any side effect on fields they weren't meant to touch.

## Brand/product name: the real fix, and an honest correction

Reading brand_name's real wrong-answer list turned up something big: ten
different labels expect the brand "BioFaith", eight expect "ChewNectar",
several more expect "WOOBY" or "Calcimax" — over half of every wrong or
missing brand_name answer in the whole 45-label set comes from just
these few names. All of them are stylised logo graphics with no real
text anywhere on the label (the same known problem this document already
describes), and the tool's fallback guesses were things like "Gelatin"
(an allergen callout) or "12.00 mm" (a print-spec dimension) — real text
on the label, just nowhere near the actual brand.

The AI model has already been shown to be very good at exactly this job
(100% correct whenever it gets a turn) -- the problem was it almost
never got a turn, because the check deciding "is this field done" only
asks "is there SOME value here", not "is this value any good". A
wrong-but-non-empty guess was permanently blocking the one thing that
could fix it, the same trap the nutrition-table fix solved for a
different field. Fixed the same safe way: a small, targeted check
(reusing the same generic allergen word list from the claims work, plus
a simple measurement-pattern check) recognises these specific known-bad
shapes and gives the AI model a narrow, isolated chance to answer --
never touching any other field, so the same mistake that broke other
labels back in the reverted Step 5.6 attempt can't happen again here.
Checked against every real-fixture test that caught THAT mistake before
committing this one; all still pass.

**An honest correction on testing, not the fix itself.** The first two
real measurements of this fix showed no change at all, which was
confusing given how it tested by hand on one real label. Dug into why
and found a real mistake: the AI model needs one setting (`OLLAMA_URL`)
that has to be present in the terminal actually running the measurement,
and it had silently gone missing at some point after Docker was
restarted earlier tonight -- so every "AI model on" measurement run
today, including the ones already committed for the nutrition-table fix,
was quietly running with the AI model OFF the whole time, despite saying
"on". This is the exact same mistake this project's own history already
made and documented once before (2026-09-15, see the correction note
earlier in RESULTS.md) -- worth remembering properly this time. It did
NOT affect the nutrition table, claims, package size, or ingredients
numbers already reported, since none of those fixes involve the AI
model at all -- only today's brand-name work was actually untested until
this was caught and fixed.

**Real result, with the setting actually correct this time:**
brand_name **2.2% → 35.6%** (fuzzy), 15 of 15 AI-model answers correct
(100%, zero wrong -- the model's own accuracy on this field holds up
exactly as it did in every earlier measurement). product_name also moved,
**11.1% → 26.7%** (fuzzy), the AI model doesn't always volunteer a
product name even when it gets the brand right, so this gain is smaller.
Every other field's numbers are byte-for-byte unchanged from the
measurement right before this fix, confirming it really is isolated.

## Address: two clean fixes, done

Went back to the two clear address problems found earlier tonight:

1. Several labels print a line like "A Division of LXIR Medilabs Pvt
   Ltd" between the company's own name and its real address (e.g. HSN
   IRN75-1.pdf). The old collection logic treated that line as the start
   of the address; fixed by skipping it, the same way a parenthetical
   aside next to it is already skipped.
2. One label's real text prints "Delhi- 110015" (a real, minor PDF-
   text-layer spacing quirk -- no space before the hyphen) where every
   other label and the ground truth both have "Delhi - 110015". Fixed
   with a narrow, targeted rule: only inserts a space where a letter
   sits directly against a hyphen that already has whitespace after it,
   so it can't touch a plot/lot number like "3/416" or "Plot no.- 3/416"
   (no letters on either side of THOSE hyphens).

Both landed cleanly. A real 45-label measurement (this one needed two
retries -- see the note below) confirms it: address **37.8% → 46.7%**
(fuzzy), 16→19 correct, wrong dropped from 12→8. Every other field's
number is byte-for-byte unchanged from the measurement right before this
fix, confirming it's isolated. Not fixed, on purpose, and still open: a
font-ligature encoding glitch ("office" prints as "of[unreadable
character]ce") and the "Registered office / Corporate office" two-address
structure on a few labels -- both need more specific investigation than
tonight had time for.

**A memory/stability note, not a code problem.** Tonight's measurement
runs hit real trouble getting through: two were killed by Windows for
running low on memory (the same kind of pressure documented earlier
tonight), and one crashed outright with an internal Node.js error
partway through, writing nothing. None of these were caused by anything
in today's code changes -- confirmed by simply retrying the exact same
command with a smaller batch size (how many labels get processed by one
subprocess at a time) each time, which eventually got a clean run
through with no code changes at all. Went from the default batch size
down to 2, then to 1 (one label at a time, slower but most stable)
before it finally went through cleanly.

## A third claims fix, built and unit-tested -- real number still pending

Kept going on claims after the address fixes landed: one more real,
recurring pattern, "Libre de Gelatina", "Libre de Gluten", "Libre de
Lacteos", "Libre de Mani", "Libre de Nuez", "Libre de Soya" -- a
Spanish-language label (Immunogum 4S IRN131-1.pdf, exported to
Venezuela) prints six standalone "LIBRE DE X" allergen badges, the exact
same shape as the English "NO X" badges already fixed, just a different
language. Confirmed by dumping the label's own real text before writing
anything. Built the matcher the same safe way -- gated by a small,
separate Spanish allergen word list, not a blanket rule -- and along the
way found and fixed a real, subtle bug the test suite itself caught:
JavaScript's word-boundary check only understands plain English letters
by default, so it was silently failing to match "MANÍ" (with an accent
on the last letter) even though the word itself was captured correctly.
Fixed by removing the now-unnecessary boundary check. All 31 tests in
this file pass, including two new ones for this fix, and the full
real-fixture regression set (45/45) still passes.

**The real 45-label number for this one fix is NOT yet confirmed.**
Every attempt to run the official measurement tonight after this point
failed -- six times in a row, across both AI-model-on and AI-model-off
settings and every batch size from 5 down to 1 label at a time: two runs
crashed outright with an internal Node.js error, four were killed by
Windows for running low on memory. Free memory kept swinging between
roughly 2.5GB and 8GB from one check to the next with nothing obviously
holding onto it in between, which points to the same wider overnight
system pressure already documented earlier tonight, not anything in
this fix or any other code changed tonight -- but six failures in a row
is past the point of "try again," so this is being left honestly
unmeasured rather than guessed at, exactly as this document's own
standing rule requires (never quote a number that isn't a real row this
tool wrote). The code and its tests are solid on their own evidence;
what's missing is only the final real-world confirmation number, which
needs the machine to be in a calmer state to get.

## The machine settled down -- real numbers for both pending fixes

The measurement finally went through cleanly (batch size 1 again).

**Spanish claims fix: confirmed, clean, exactly as expected.** claims
went from 90 to 96 correct (strict count) -- exactly the six "Libre de"
badges this fix targeted, not one more, not one less. Fair-match
accuracy for claims: 24.6% -> 26.2%. No other field moved.

**Font-ligature fix: real and safe, but no measured win yet, honestly.**
Also tried at the same time. It does exactly what it says -- the
Cal. Vit D / Iron IRN121 labels no longer have a broken character where
"office" should be -- but none of the four address cells it touches
flipped from wrong to correct, because those same cells have a SEPARATE,
bigger problem too: the label prints "Registered office: ... Corporate
office: ..." as two distinct addresses, and this tool still only reads
it as one merged, incomplete block missing the second half entirely.
Fixing the broken character alone wasn't enough on its own for these
specific cells. Kept anyway -- it's a real, correct, safe improvement to
the raw text (and a needed first step before the bigger two-office fix
could ever work), just not one with its own accuracy number to show yet.
Not treated as a finished win in the numbers above; the address field's
own accuracy is unchanged this round.

## Looked at "Registered office / Corporate office" -- decided not to guess

Read this structure's real text directly (Cal. Vit D IRN120-3.pdf):

```
B-1/357 Registered office:
Janakpuri, New Delhi - 110058
NESCO IT Park, Corporate office:
Building 4, North Wing,
Western Express Highway,
Goregaon, Mumbai, Maharashtra
```

The real content ("B-1/357", "NESCO IT Park") is drawn BEFORE its own
"Registered office:" / "Corporate office:" label in the PDF's own
content stream, even though it belongs AFTER the label when read as a
sentence -- the ground truth reads "Registered office: B-1/357
Janakpuri...". Recovering this correctly would mean detecting the label,
reaching backward to the text drawn just before it, and re-ordering --
a real, working fix, but only confirmed on this ONE template family so
far (4 cells: Cal. Vit D IRN120-3/4, Iron IRN121-3/4). Unlike tonight's
other fixes (allergen words, corporate-division lines, hyphen spacing --
all clearly general, industry-wide conventions), this specific
before-the-label draw order looks like it could just as easily be this
one template's own graphic design choice, not something that
generalizes to a label never seen. Rather than build something this
narrow's worth of code on one confirmed example and risk it being wrong
for the next label that uses "Registered office" differently, this is
being left alone -- a real, human judgment call, not a guess made
because it was late.

## Tonight's honest stopping point

Tried four more times to get one clean measurement with the AI model
turned on and everything from tonight combined in a single run, spacing
the attempts out (up to 30 minutes apart) to give the machine time to
settle. All four were killed for low memory. The pattern is consistent
enough to draw a real conclusion from: every run WITHOUT the AI model
succeeded tonight; every run WITH it, after the very first two brand-name
confirmations early in the night, failed. This points at the AI model's
own memory use specifically (it has to load and run a real, several-
gigabyte model each time) stacking on top of everything else already
running, not random bad luck. Stopping here rather than trying a fifth,
sixth, seventh time -- diminishing returns, and every fix already has
its own real confirmed number on record without needing this one
combined snapshot.

**What's actually confirmed and safe, as of right now:**
- Combined, AI model OFF: **34.8% exact match / 47.3% fair match**
  (real, from a clean run tonight).
- Brand name, AI model ON: **35.6%** (up from 2.2%), confirmed in its
  own clean run earlier tonight, before anything unrelated changed it.
- Product name, AI model ON: **26.7%** (up from 11.1%), same run.
- Every other fix's own number is in this document above, each backed
  by its own real RESULTS.md row.

The one thing NOT captured tonight is a single run with everything
(claims/ingredients/package size/address/ligature AND the AI model)
measured together at once -- not because any of it is in doubt, just
because the machine wouldn't stay up long enough to do that one extra
confirmation. Getting that one combined number is the very first thing
to do once memory is behaving normally again.

## Morning: the combined number, confirmed, plus two more small fixes

Memory recovered this morning. The one missing combined measurement
(everything from last night, AI model on, all at once) finally went
through cleanly: **35.5% exact match / 48.4% fair match** -- the real,
current, best-known number, up from the 25.5% starting point.

Also found and fixed two more real, small bugs while reading
product_name's wrong-answer list:

1. A real wrong answer (Calcimax Pack 30/60 IRN168/169-2.pdf): product
   name came back as "Meyer Organics Pvt. Ltd." -- the label's own
   marketing company name. Fixed: a company-suffix-shaped line ("Pvt.
   Ltd.", "Ltd.", "LLP", "Inc.", ...) is never treated as a real product
   name candidate, whether or not it happens to match the marketing
   company field's own value.

2. Excluding that surfaced a SECOND wrong candidate sitting right behind
   it on the same label: "Not To Be Sold Loose", standard Indian
   packaged-goods regulatory boilerplate. The existing boilerplate list
   already excluded "to be sold" -- but only when it was the very first
   word on the line, so this real "Not..." phrasing slipped through.
   Fixed the same way "not for medicinal" was already handled elsewhere
   in the same list.

Both fixes are real, safe, and verified (32/32 tests, including the
real-fixture regression set). Honest finding: fixing both did NOT flip
these two specific cells to correct -- there turned out to be a THIRD,
then apparently a fourth, competing wrong candidate on this one
template ("Substances . . .", then nothing at all). Each fix removed
exactly the garbage it targeted, confirmed by checking the real diff
again after each one -- this is real, incremental data-quality
improvement, not wasted work -- but this one label's product name isn't
fully solved yet, and chasing it further would mean guessing at an
open-ended list of exclusions rather than fixing the actual root cause
(the title-block logic has no POSITIVE signal for "this is the product
name," only an ever-growing list of things to rule out). Left here
rather than continuing to whack individual moles on one template.

## Claims: a real, deeper bug found and fixed, confirmed

Read claims' still-missing list again and noticed several labels in the
Cal. Vit D family still missing their "No Gelatin"/"No Gluten"/etc.
badges even though the same fix already worked for a different label in
the same family. Dumped the real text two different ways to compare:
the plain flattened PDF text keeps "NO GELATIN NO GLUTEN..." together
correctly, but the geometry-based "reading order" text (used as claims'
main source because it's generally better for other labels) scrambles
this particular badge cluster into two unrelated lines because it sits
close to the nutrition table -- "NO" ends up on one nutrition row,
"GELATIN" on a different one, and the claim is lost entirely. Confirmed
by testing extractClaims against each version of the real text directly.

Fixed by extracting claims from BOTH versions of the text and combining
what each one finds, instead of picking one -- safe because a claim
found either way is still something really printed on the label, and
every claim rule already only accepts a small, safe list of allergen/
dietary words regardless of which text surfaced it. 56/56 tests pass.

**Real, confirmed result:** claims 96 -> 105 correct (strict), 101 -> 110
(fuzzy), missing dropped from 250 to 241. Accuracy 26.2% -> 28.3%.
**New combined headline: 35.9% exact match / 48.8% fair match.**

## While the client's reviewer works: one more brand-name fix, written but not yet tested

The client's own team is reviewing labels for Step 4.3 right now, and
testing is paused at the user's request during that review, so this fix
is written and reasoned through carefully but genuinely NOT YET VERIFIED
-- no claim of a real number for it until it can actually be run.

Went looking for one more real pattern behind brand_name's remaining
wrong answers and found one, without needing to touch the fragile
title-block selection logic itself (that logic has already broken once
before from a blanket change, Step 5.6). Several of the still-wrong
guesses are print-production/pre-press jargon: "Cmyk", "Matt Uv",
"Bottom Dia Colour Cmyk", "Process Color Convert To Pantone Client File
Color", "Emboss I Gr" -- all real, from a real diff.py run. These come
from this client's own "VF" file variants specifically, which turn out
to be die-line/vector-file production proofs rather than finished
consumer artwork, so print-spec text sits right where the extractor
looks for a prominent front-of-pack name.

Fixed the same safe, proven way as the allergen-word and measurement
checks already in nameFieldMissing: a small, specific print-production
word list, checked as a CONTAINS match rather than "entirely composed
of" (a real brand containing "cmyk" is not a realistic risk the way a
real brand containing "milk" is). Deliberately left out a bare "uv" on
its own -- this client's own catalog already has a real claim in the
same marketing space ("Blue Light Protection"), so a bare "uv" match
would risk wrongly excluding a genuine future "UV Protection" brand or
product name; only the specific print-finish phrases ("matt uv", "spot
uv", "gloss uv") are excluded, which carry no such risk.

Traced by hand against 7 test cases (5 real print-jargon values that
should be caught, 2 realistic "UV Protect"-style names that should NOT
be) -- all reasoned through correctly, but this needs an actual test run
to confirm rather than hand-tracing alone. That real run is the very
first thing to do once testing resumes.

## Testing resumed: the print-production-term fix is confirmed

The full suite ran (backend, frontend, `ai_backend` pytest, all three).
The print-production-term fix from the section above passed every one
of its own tests cleanly, including the 5 real print-jargon values and
2 realistic "UV Protect"-style names it was hand-traced against
earlier -- the hand-tracing held up under a real run. Backend also
turned up 10 pre-existing test failures unrelated to this fix or
anything touched today: 8 are local database seed-count drift from
accumulated testing activity (not a code bug), 2 are a connection
timeout on the very last, heaviest tests of an unusually long single
run, and 1 is a fixture file (`Multivitamin IRN56-3.pdf`) that was
already missing from `Dataset_Example/` before today, per this
project's own git history. None of the 10 touch this fix.

## Step 4.3: the full human review, finished

All 45 client labels (60 printed pages) have now been checked directly
against their real images -- the review that Step 4.2 built the tool
for. Real, unambiguous mistakes found in the answer key itself along
the way were fixed directly: a text-encoding glitch in two Calcimax
labels' addresses, a Spanish-language label that had lost every accent
mark across several fields, and several nutrition tables missing their
%DV column even though the source label prints it. Genuinely ambiguous
cases -- a label's own artwork printing two different gummy counts, or
one company's registered address spelled two different ways across
sibling label files -- were resolved with the reasoning written down in
each file's own review notes, rather than picked silently.

## The combined measurement: running now

With the ground truth now fully reviewed and every pending code fix
tested, the real `--mode pipeline` measurement (AI model on) is running
against all 45 labels. Not quoting a number here until it's a real row
in `RESULTS.md`, per this document's own standing rule.

## The combined measurement, in: a real, confirmed 34.7% / 48.6%

That run finished and wrote a real row. **34.7% exact match / 48.6%
fair match** -- a small dip from the previous headline (35.9% / 48.8%),
not a regression. The cause is understood and expected: the ground-
truth review just finished (previous section) fixed real mistakes in
the answer key itself, including several nutrition tables that were
missing their own %DV column even though the label prints it. Once the
answer key asks for that column, any extractor that still drops it
(the code hadn't been touched yet at this point) counts as wrong where
it used to count as right by accident. A more honest answer key
producing a slightly lower number, for a reason that's fully explained
and traceable to specific real fields, is the expected and correct
outcome of doing the review properly -- not a sign anything broke.

That gives two clear, real gaps to close next, both already visible in
field-level detail: the package_size conflict pattern found during the
ground-truth review (a front-badge count contradicted by two
independent back-panel numbers, Step 5's package_size section above),
and the nutrition table %DV column the review just confirmed is
sometimes genuinely printed and expected.

## Both known gaps, closed: package_size conflicts and nutrition %DV

**package_size.** Implemented the conflict-resolution rule reasoned
through in the ground-truth review: when a front-of-pack badge count
(e.g. "10 GUMMIES") disagrees with the label's own Net Content
declaration AND that disagreement is independently corroborated by the
label's own serving-size x servings-per-container math, the
corroborated total wins over the badge -- but keeps the badge's own
real unit word, not Net Content's bare "N". Deliberately narrow: this
does NOT become a general "prefer Net Content" rule -- a badge with
only ONE disagreeing signal (no serving-math corroboration either way)
still keeps winning, exactly as before, confirmed by its own dedicated
test. 4 new tests, all passing; no existing package_size test's
expectation changed.

**nutrition_table %DV.** The code has, since early in this project,
deliberately thrown away a nutrition row's extra %DV/%RDA column
("170 mg **100%**") to avoid capturing an unrelated Children/Teens/
Adults age-group breakdown as if it were the row's own value. The
ground-truth review found this was too broad: plenty of real rows
print exactly ONE %DV figure for that same value, genuinely belongs to
it, and the reviewed answer key now expects it, formatted as
"170 mg (100% DV)". Fixed narrowly, mirroring the same caution as the
package_size fix above: a row with exactly one extra %-figure now
keeps it, appended in that "(<value> DV)" form; a row with two or more
(an actual Children/Teens/Adults-style multi-column split) is still
left dropped, unchanged -- which figure belongs to which age group
isn't recoverable from the row alone, a different, unattempted piece
of work. Applies the same way whether the row came from the PDF text
layer (two separate code paths there: side-by-side cells, and one
merged string with the %DV run stripped by regex) or from OCR word
boxes on a rasterized page. 4 new tests, all passing; one existing
test's expectation updated to match (it had asserted the old drop-it
behavior for exactly this single-extra-column shape).

Both fixes: `npx tsc --noEmit` clean, their own test files pass in
full, and the broader regression suite (package_size + real-PDF
`labels.extract` + `packageSizeOcr`, 38 tests) also passes in full,
unrelated to this session's own changes.

## The combined measurement, in again: 36.5% / 48.6%

Real `--mode pipeline` run (AI model on, all 45 labels), with both
fixes above in place. **36.5% exact match / 48.6% fair match** --
overall exact-match accuracy up 1.8 points (34.7% -> 36.5%, 735 -> 773
correct, 434 -> 396 wrong, missing unchanged). The 13-text-field
"new metric" moved the same way: 37.1% -> 39.1% exact match, fair
match flat at 48.6%.

Field-level, both fixes did exactly what they were built to do:
- `package_size`: 16 -> 19 correct (strict), 26 -> 23 wrong. The
  fair-match count for this field didn't move (stayed 20) -- meaning
  these 3 were already being counted as basically-right under fuzzy
  matching before today; the fix made them byte-for-byte right too.
- `nutrition_table`: 94 -> 129 correct (strict), 167 -> 132 wrong. Same
  shape as package_size -- fair-match count stayed flat at 228, so
  fuzzy matching had already been forgiving this exact gap. The real
  win here is the STRICT number, the one a client reading the table
  literally would trust, closing a big chunk of the gap between "the
  fuzzy metric thinks this is fine" and "the text is actually correct."

So fair match (the 80% target metric) hasn't moved today -- both fixes
closed a strict/fuzzy gap that fuzzy matching was already smoothing
over, not new ground fuzzy didn't already cover. That's still real,
useful progress (a client reading the raw extracted text now sees the
literally-correct value far more often), just not the lever that moves
the 48.6% number itself. The remaining room, per the by-source and
new-metric tables in this run's `RESULTS.md` row, is still mostly
brand_name/product_name (identity fields, the two fields Step 6 -- a
bigger AI model -- was specifically proposed for) and claims/
nutrition_table's still-missing rows (fields genuinely absent from the
label vs. not yet found).

## Is 80% even reachable? A real ceiling, measured

Before spending more effort chasing 80%, checked whether it's actually
possible on these 45 files. For every value currently wrong or
missing, checked whether that value exists ANYWHERE in text a machine
can read (the PDF's own text layer, or OCR of the rasterized page) --
a narrower, more honest question than "did the extractor find it."

**Real result: only 53% of the entire gap (556 of 1050 non-visual
wrong/missing values) is present in machine-readable text at all.**
The other 47% only exists as artwork pixels -- stylised logos,
outlined display type, nutrition panels baked into the image -- text
no parser can ever reach, however good the code gets.

Translated into the metric itself: even a PERFECT extractor that
recovered every single readable value would only raise strict-match
accuracy from 37.6% to about **66.6%**. Not 80%. That is a hard
ceiling set by the label files themselves, confirmed by measurement,
not a guess.

Field-level, the readable-but-missed room is very unevenly spread:
ingredients is the best bet (74% of its gap is genuinely readable),
nutrition_table and claims are closer to a coin flip (~50%/42%
readable). Also found, inside the "14 labels with a 100% blank
nutrition_table" list: 4 of them have their ENTIRE table readable --
that's a pure extraction bug on those specific files, not a content
problem, and the cheapest kind of fix to chase next.

**Conclusion: 80% is not realistically reachable through extraction
improvements alone on these 45 files.** A real, meaningfully higher
number than today is reachable; 80% specifically would need a vision
model that can actually read the artwork-only 47% well -- and that
has now been tried twice (Step 6's bigger local model, and the vision-
model fallback below) with two failures, not two successes.

## The vision-model fallback: real gains, real fabrication, both fixed

`AI_EXTRACTION_URL` -- a SECOND, separate AI fallback (its own local
Python service, `ai_backend/`, running Qwen2-VL-2B) has existed in the
code and been configured in `backend/.env` this whole project, but the
service itself was never once running during any measurement so far.
Started it and tested it for real, on one of the 14 blank-nutrition
labels (HSN VF IRN75-1.pdf).

**Real gains, checked against the actual answer key**: brand_name
"BioFaith" (exactly right; the text-layer pipeline reads garbage,
"12.00 mm", there instead), and 3 of 8 real claims recovered that the
main pipeline finds zero of.

**Real fabrication, same check**: ingredients invented outright
("Lactose, 120 mg" -- not on the label at all), a nutrition table with
4 of 17 rows and wrong numbers, and refusal text ("No Marketing
Company Provided", "Not Available") stored as if it were a real value.

Fixed all three, test-driven (`aiExtraction.fallback.test.ts`, 9
tests):
- The fallback may no longer supply ingredients or a nutrition table
  at all -- both already have grounded readers, and this model doesn't
  read either faithfully. A blank stays a MISSING a reviewer can
  investigate; it no longer becomes a convincing lie.
- A small set of "this is not an answer" phrase shapes (`None`,
  `N/A`, `Not Available`, `No <X> Provided`, ...) are rejected outright
  rather than stored, narrow enough that real content starting with
  "No" ("No Added Sugar", "Novocal") still passes.
- The fallback may now OVERWRITE a field the caller has already judged
  to be garbage (a bare measurement, OCR debris, print-shop jargon --
  the same `nameFieldMissing` judgement every other recovery pass in
  this codebase already honours), which is what let "BioFaith" replace
  "12.00 mm" instead of being silently blocked by it forever.

## Two more real claims bugs, found reading the real wrong-answer list

- `Health Supplement` was in the fixed badge list on the reasoning
  that it reads like `Vegetarian` or `Halal`. A real 45-label run
  showed that reasoning was wrong: WRONG on 20 different labels,
  correct on precisely zero. Every reviewed label treats it as the
  product's regulatory CATEGORY, not a claim the marketer chose to
  make. Removed.
- "This food is by its nature gluten free." -- a standard disclaimer
  sentence printed on several labels in this client's catalog, not a
  claim badge -- was being read as a real "Gluten Free" claim, adding
  a wrong, redundant entry right alongside the label's own correctly-
  found "No Gluten" badge elsewhere. Excluded by the disclaimer's own
  generic shape ("by (its) nature ... free"), narrow enough that a
  real standalone "Gluten Free" badge with no such lead-in still gets
  reported, confirmed by its own test.

A THIRD real pattern was found and deliberately NOT shipped: several
labels print a combined "FREE FROM GLUTEN MILK SOY" declaration that
the reviewed ground truth records as one claim, 'Free From Gluten |
Milk | Soy'. A matcher for this was built and worked correctly as a
function -- then turned out to be unshippable, because this whole
codebase joins a label's separate claims into one string with the
same ' | ' character (see `CLAIM_DELIMITER` in
`scripts/extract-pipeline.ts`) that the ground truth chose to use
INSIDE this one claim's own text. Downstream scoring would split the
combined claim back into three meaningless fragments, so the fix could
only ever relabel three WRONG claims as three MISSING ones -- no real
accuracy gain -- without a separate, deliberate decision to change how
claims are delimited project-wide. Caught by the fix's own test before
it shipped; backed out rather than pretend it works.

## Real, measured result: 36.5% / 48.6% -> 36.7% / 49.0%

Ran the full real `--mode pipeline` measurement three times to get an
honest before/after/after-again:

1. **vlm off, `ai_backend` fallback ON** (isolates the fallback's own
   fixes from Ollama): ingredients and nutrition_table came back
   BYTE-FOR-BYTE IDENTICAL to the no-fallback baseline -- real,
   measured confirmation that the "never supply ingredients/nutrition"
   fix holds under load, not just in a unit test. Fabrication rate on
   both: 0%.
2. **vlm on, `ai_backend` ON, claims fixes not yet in** -- not run
   separately; folded straight into the final combined run below.
3. **vlm on + `ai_backend` on + both claims fixes** (the real,
   final combined state): **36.7% exact match / 49.0% fair match**,
   up from 36.5% / 48.6%. claims moved the most: wrong count 43 -> 15,
   exactly the size of drop the two claims fixes predicted.
   ingredients and nutrition_table: unchanged again, confirming zero
   fabrication under the full, real, stressed pipeline, not just OCR
   fallback in isolation.

**One honest cost, not hidden**: brand_name got WORSE in that same
final run (35.6% -> 28.9%), and none of today's code changes touch
brand_name at all. The by-source table shows the drop is entirely
inside `vlm-role-resolution` (Ollama), whose own success count fell
from 15 correct to 12. This run also spent long stretches under 500MB
of free system memory -- Ollama and `ai_backend` sharing one 6GB GPU
-- confirmed twice already this session to cause real memory-pressure
failures (see `hardware-has-gpu` memory note). The likely explanation
is resource contention degrading the AI model's own responses under
load, not a code regression.

**Real, concrete finding from this: `ai_backend` provides close to
ZERO benefit when Ollama is also running.** Ollama fills brand/product
name first on almost every label, so `ai_backend`'s own fallback
condition (only fires when those specific fields are still blank)
almost never triggers -- confirmed by the by-source table showing no
`vlm-fallback` entries at all for identity fields in the combined run.
Running both together buys nothing measurable while actively risking
the contention/crash behavior seen three times this session.
Recommendation: run one or the other, never both at once.
