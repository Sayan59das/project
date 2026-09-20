# Step 7 — VLM as a grounded reader on crops (design/test at small scale)

The directive scoped this step as design-and-test-only: "VLM as a grounded
reader on crops (needs a 24GB GPU, not available now — design/test at
small scale only)." Ships no production code. This documents what was
tested, on what hardware, and what it found.

## The hypothesis

The original critique's point #4: `prepareImage()` sends every VLM image
at a fixed 1008px width regardless of content — too small to read small
table text. The fix direction: instead of sending the whole page squeezed
to 1008px, crop out just the region of interest (e.g. the nutrition panel)
and send that crop at real resolution.

## Test setup

Hardware: this machine's RTX 4050 Laptop GPU (6GB VRAM) — not the 24GB the
directive assumed would be needed. Model: `qwen2.5vl:3b` (the existing
default, unchanged).

Label: `Dr. Chewitals Vision IRN13-1.pdf` — picked because it had the
single largest remaining `nutrition_table` gap (17 wrong/missing cells) in
the full 45-label masters-on run after Steps 1-4, and because its
nutrition panel turned out to be baked into the artwork as an image with
**no PDF text layer at all** for that panel (confirmed: `extractTextSpans`
+ `segmentPanels` find no panel matching the nutrition-header regex,
though the surrounding ingredients/disclaimer text IS real PDF text) —
exactly the shape of label this whole step exists for.

Crop-region detection (real code, not eyeballed): rasterize at 300dpi, run
`recognizePageWithWords` (Tesseract), find word boxes matching a small
nutrient-name vocabulary (Energy, Protein, Carbohydrate, Vitamin, ...),
take the union bounding box of those hits, widen right by 1.2x (to include
the value column the anchor words themselves don't cover) and pad
vertically. When a label's nutrition panel DOES have real PDF text-layer
geometry, the same crop can be computed directly from
`segmentPanels`/`projectSpanToPixels` instead — both paths were written
and exercised, this label happened to need the OCR-anchor fallback.

Two arms, same model, same call shape (`/api/chat`, `format: schema`,
`temperature: 0`), same `TRANSCRIBE`-style JSON-rows prompt:
- **Arm A**: today's production behavior — whole page rasterized, resized
  to 1008px wide (`prepareImage`'s exact transform).
- **Arm B**: the nutrition-panel crop, native 300dpi resolution, no
  downscaling.

## Result

| | Arm A (whole page, 1008px) | Arm B (crop, native 300dpi) |
|---|---|---|
| Latency | 5.6s | 5.2s |
| Rows correct | ~0 of 13 | **13 of 13** |

Arm A did not just read worse — it **hallucinated a plausible-looking but
wrong table**: a "Calcium 10 mg" row that doesn't exist anywhere on this
label, "Sodium 0 mg" against a real "8 mg", "Vitamin C 5.94 mg" against a
real "30 mg", "Vitamin A (as Retinyl Palmitate)" against the label's own
"(as Vitamin A Palmitate)". Every value differs from ground truth. This is
the fabrication risk in concrete form: not obviously wrong output, output
that reads as a normal, complete, confident nutrition panel and is simply
not what's printed.

Arm B matched ground truth on all 13 rows, name and value, near-exact
(cosmetic differences only — e.g. "D-Alpha" vs "D-alpha" capitalization).
Visual confirmation: the crop image itself is cleanly legible at normal
zoom (checked directly, not just inferred from the model's answer).

Latency was NOT the tradeoff it might be assumed to be — the crop
answered in about the same wall-clock time as the whole page, despite
being higher pixel resolution for the region that matters, because it's a
much smaller image overall (one panel, not a full label page).

## What this means for the 24GB GPU assumption

The directive's own framing assumed this needed hardware we don't have.
That assumption does not hold for the specific thing tested here: the
existing 3B model, already running on a 6GB laptop GPU, reads a real,
previously-unreadable nutrition panel essentially perfectly once given a
real-resolution crop instead of a squeezed whole page. Nothing about this
result required a bigger model — the problem was resolution, not capacity.

## What was NOT tested, and is NOT being proposed as done

This is one label, one field (nutrition_table), one arm of a two-arm
comparison — a design validation, not a measurement. Turning this into a
real feature needs, at minimum:
- Crop-region detection robust across every label's layout (front panel,
  back panel, wraparound, carton die-line, ...), not just the two paths
  exercised here.
- A grounding/validation step before trusting a crop-read value — this
  whole codebase's standing rule is that a wrong answer must never look
  more confident than a blank one, and a crop read is still a model
  guess, not an OCR fact, until checked against something (e.g. the
  deterministic parser's own partial read, or a vocabulary check on
  nutrient names).
- Extending the idea to claims/ingredients crops, not just nutrition
  tables (the same 1008px-squeeze problem applies to small badge text
  anywhere on the page).
- Real measurement across many labels, not one hand-picked worst case.

None of that is implemented. This document is the record of why it looks
worth building, not a claim that it's built.
