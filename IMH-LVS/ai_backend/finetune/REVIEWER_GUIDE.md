# Step 4.2 — human review guide

This is the list for the one-hour review the accuracy plan asks for. The
tool to do it with already exists and already works — `review_server.py` —
nothing needed building here, just checking it worked and lining up what to
look at.

## How to start

From `ai_backend/`:

```
python finetune/review_server.py
```

Then open **http://127.0.0.1:8850/** in a browser. This only talks to your
own machine (127.0.0.1) — nothing about any label ever leaves it.

Click a page in the grid, check the fields against the full-resolution
image next to them, fix anything wrong, and click **Save & Mark Reviewed**.
That's what gives it a real timestamp instead of the placeholder one every
annotation currently has (see "why this matters" below).

## What to check (in priority order)

**1. All 45 labels — 5 fields, ~225 cells, the main hour of work.** For
every label, check: `brand_name`, `product_name`, `marketing_company`,
`package_size`, `flavour`, against the label image right next to them. Two
things to keep in mind while doing this, since they were decided already
and should just be applied consistently rather than re-decided per label:

- **product_name** = the brand wordmark ("AM7", "Sleeprio"), not the
  descriptive line underneath it ("Eye Multivitamin Gummies for Kids &
  Adults").
- **brand_name** = whichever text is biggest/most prominent on the front,
  not necessarily the legal/marketing company's name.

**2. A 15-label sample — nutrition_table and ingredients, row by row.**
Full review of these two fields on every label would take much longer than
an hour; this sample is spread across different brand families rather than
clustered, so it should catch the more common patterns without demanding
the full 45:

1. AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf
2. Cal. Vit D IRN120-2.pdf
3. Calcimax Pack 30 IRN168-2.pdf
4. Calrio IRN159-1.pdf
5. Crisper Cal. Vit. D IRN-137-1 (1).pdf
6. EYE WELLNESS DOMESTIC LABEL MHJ.pdf
7. Final New-Calcimax 6 Pack 16.02.26  .pdf
8. Immunogum 4S IRN131-1.pdf
9. Iron IRN121-3.pdf
10. Iron VF IRN36-1.pdf
11. LXIR Shilajit STICK VF IRN19-1.pdf
12. MHJ Immunity Domestic IRN217-1.pdf
13. Novocal IRN220-1.pdf
14. PMS VF IRN71-1.pdf
15. Sleeprio Gummies.pdf

**3. The 12 known page-conflicts.** 11 of these are `layout`/`logo` —
free-text visual descriptions of two different pages/panels of the same
label (e.g. a flattened carton front+back vs. a bottle cap face) — these
usually aren't really wrong, just two true descriptions of two different
things, and they don't affect the 80% target at all (Step 3 moved visual
fields out of it). Worth a glance if a page comes up in your review, not
worth going out of your way for. The one text-field conflict already got
fixed automatically (see below) since it was a mechanical application of
the product_name decision above, not a new judgment call.

## Why this matters (so the "why" isn't lost)

Every one of the 60 annotation files currently says `"reviewed": true`
with a `reviewedAt` timestamp — but they were all stamped within about 60
milliseconds of each other by a script, not actually looked at by a
person. The numbers in `RESULTS.md` are being measured against that
unverified data. This pass is what makes "45 labels, human-checked" in the
final report actually true rather than a claim nobody checked.

## Already done automatically (not part of your hour)

- The `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` page-1/page-2 product_name
  conflict is fixed — page 1 had the descriptor line, page 2 already had
  the correct wordmark ("AM7 Gummies"); page 1 now matches, with a real
  timestamp and a note explaining why. This wasn't a new judgment call,
  just applying the decision above consistently — a genuinely new
  ambiguous case would have been left for you, not guessed.
