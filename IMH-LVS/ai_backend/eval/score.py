"""
The one honest scorer for label extraction accuracy — every accuracy number
quoted for this project from here on must be a row this script wrote to
RESULTS.md, not a number recalled from memory or a different one-off script.
Replaces finetune/evaluate_adapter.py's scoring (that file still runs the
2B/7B adapter comparison, but should point its numbers at this module rather
than its own score_field).

Ground truth comes from finetune/reviewed/annotations/*.json — the same
files reviewed via finetune/review_server.py. See merge_label_pages() for
why this scores LABELS (one product's PDF, however many printed pages it
has), not individual pages: the real extraction pipeline
(backend/src/services/labelExtraction.service.ts) already merges fields
across every rasterized page of one PDF into a single result before anyone
uses it, so scoring page-by-page would unfairly mark a front-only page
"wrong" for a nutrition table that was only ever printed on the back.

Three-way CORRECT / WRONG / MISSING outcome per field (or per list item, or
per nutrition-table row) instead of plain right/wrong, because those are
different mistakes worth telling apart: MISSING means the pipeline honestly
found nothing; WRONG means it stated something and that something is
incorrect (including hallucinating a value that isn't on the label at all).
Collapsing them into one "wrong" bucket hides which failure mode is
actually happening.

Modes:
    python eval/score.py --mode ai          # the old one-shot Qwen2-VL-2B pipeline
    python eval/score.py --mode textlayer   # Phase C alone: PDF-text-layer extraction only
    python eval/score.py --mode pipeline    # Phases C+D+E combined: text layer, then OCR
                                             # (with outlined-text detection), then Ollama
                                             # VLM role-resolution for whatever's still blank

Run from ai_backend/: `python eval/score.py --mode pipeline`

Environment variables:
    EVAL_LABEL_PDF_DIR      Directory containing source PDF files for textlayer/pipeline
                            mode (default: ai_backend/finetune/source_labels)
    OLLAMA_URL              Read by the Node CLI (backend/src/config/env.ts), not this
                            script — must be set (e.g. http://127.0.0.1:11434) for
                            --mode pipeline's VLM role-resolution step to actually run.
                            Without it, pipeline mode still runs text layer + OCR.
    EVAL_PIPELINE_BATCH_SIZE  How many PDFs --mode pipeline sends to one Node subprocess
                            at a time (default: 5). Lower this on a memory-constrained
                            machine — a single process holding Ollama and the OCR engine
                            resident for every label at once has been observed getting
                            killed by the OS for running out of memory.
"""
import argparse
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from rapidfuzz import fuzz

EVAL_DIR = Path(__file__).resolve().parent
AI_BACKEND_DIR = EVAL_DIR.parent
ANNOTATIONS_DIR = AI_BACKEND_DIR / "finetune" / "reviewed" / "annotations"
IMAGES_DIR = AI_BACKEND_DIR / "finetune" / "images"
RESULTS_MD = EVAL_DIR / "RESULTS.md"
RUNS_DIR = EVAL_DIR / "runs"
# The client's Masters catalogue (accuracy2 plan Step 2) -- built by
# build_masters.py from the reviewed ground truth. A list read at runtime,
# never a string literal in extraction code (see masterSnap.service.ts's own
# note on why that's not hardcoding). Its mere presence on disk is what
# --masters on (the default when it exists) picks up.
MASTERS_JSON = EVAL_DIR / "masters.json"

FIELDS = [
    "brand_name", "product_name", "colour_theme", "flavour", "claims", "logo",
    "layout", "nutrition_table", "fssai_number", "ingredients",
    "marketing_company", "address", "customer_care_number",
    "customer_care_email", "package_size", "manufacturing_company",
]

# A single fact with one correct spelling — scored by exact (normalized) match.
EXACT_FIELDS = {
    "brand_name", "product_name", "flavour", "fssai_number",
    "marketing_company", "customer_care_number", "customer_care_email",
    "package_size", "manufacturing_company",
}
# A free-text description with no single correct wording — scored by
# substring containment in either direction, so a shorter-but-correct
# description still counts, and so does a longer one that contains the
# expected text.
FUZZY_FIELDS = {"logo", "layout", "address"}
# Set-of-items fields — scored item by item, not as one all-or-nothing unit.
LIST_FIELDS = {"colour_theme", "claims", "ingredients"}
# nutrition_table is the only dict field; handled by its own branch below.

# Step 3 (accuracy plan): logo/layout/colour_theme are genuinely visual —
# the brief (§9) compares logo and layout as IMAGES, not text descriptions;
# the CLI emits layout: null for every label by construction (never a text
# value anywhere in this pipeline, see extract-pipeline.ts's own comment),
# so it contributes 45 forced "missing" that have nothing to do with text
# extraction quality; and colour_theme/logo are free-text descriptions with
# no single right wording. The 80% target applies to the 13 TEXT_FIELDS;
# these three get their own "visual" block instead (see aggregate_new_metric).
VISUAL_FIELDS = {"logo", "layout", "colour_theme"}
TEXT_FIELDS = [f for f in FIELDS if f not in VISUAL_FIELDS]

# Step 2 (accuracy plan): the nine scalar fields that go through the Node
# extraction pipeline's fillBlanks cascade (backend/src/services/
# labelExtraction.service.ts's FieldSource type) and so can carry a
# field_sources entry in a --mode pipeline record. manufacturing_company is
# a fixed constant (never extracted) and claims/ingredients/nutrition_table/
# colour_theme have their own non-cascading extraction paths — none of the
# four ever has a field_sources entry, by construction.
FIELD_SOURCE_TRACKED_FIELDS = [
    "brand_name", "product_name", "flavour", "fssai_number",
    "marketing_company", "address", "customer_care_number",
    "customer_care_email", "package_size",
]


def normalize(value):
    if value is None:
        return None
    if isinstance(value, str):
        collapsed = " ".join(value.split()).strip().lower()
        return collapsed or None
    return value


def _empty(value):
    return value is None or value == [] or value == {}


def score_field(field, predicted, expected):
    """Returns {'correct': n, 'wrong': n, 'missing': n} — counts, not a
    single verdict, so scalar fields (always summing to 1) and collection
    fields (summing to however many items/rows are involved) aggregate the
    same way at the top level."""
    if field in LIST_FIELDS:
        want = {normalize(str(item)) for item in (expected or [])}
        got = {normalize(str(item)) for item in (predicted or [])}
        if not want and not got:
            return {"correct": 1, "wrong": 0, "missing": 0}
        return {
            "correct": len(want & got),
            "wrong": len(got - want),
            "missing": len(want - got),
        }

    if field == "nutrition_table":
        want = expected or {}
        got = predicted or {}
        want_norm = {normalize(str(k)): normalize(str(v)) for k, v in want.items()}
        got_norm = {normalize(str(k)): normalize(str(v)) for k, v in got.items()}
        if not want_norm and not got_norm:
            return {"correct": 1, "wrong": 0, "missing": 0}
        correct = sum(1 for k, v in want_norm.items() if k in got_norm and got_norm[k] == v)
        wrong_rows = sum(1 for k, v in want_norm.items() if k in got_norm and got_norm[k] != v)
        missing = sum(1 for k in want_norm if k not in got_norm)
        hallucinated = sum(1 for k in got_norm if k not in want_norm)
        return {"correct": correct, "wrong": wrong_rows + hallucinated, "missing": missing}

    predicted_n, expected_n = normalize(predicted), normalize(expected)

    if expected_n is None:
        if predicted_n is None:
            return {"correct": 1, "wrong": 0, "missing": 0}
        return {"correct": 0, "wrong": 1, "missing": 0}  # hallucinated a value
    if predicted_n is None:
        return {"correct": 0, "wrong": 0, "missing": 1}

    if field in FUZZY_FIELDS:
        match = predicted_n in expected_n or expected_n in predicted_n
    else:
        match = predicted_n == expected_n

    return {"correct": 1, "wrong": 0, "missing": 0} if match else {"correct": 0, "wrong": 1, "missing": 0}


def score_field_detail(field, predicted, expected):
    """score_field()'s sibling: the same comparison, but returns the
    per-item/per-row detail BEHIND the tally instead of just counting it —
    what the predicted and expected values actually were, not just how many
    were right. One dict per scalar field, or one per list item / nutrition
    row for those field types: {'item', 'predicted', 'expected', 'verdict'}
    ('item' is None for a scalar field; the list item's own text, or the
    nutrition row's key, otherwise — always the EXPECTED side's original
    text when there is one, so a near-miss is easy to spot by eye, falling
    back to the predicted side's text only for a pure hallucination with no
    expected counterpart). Values are the original, non-normalized text —
    normalize() decides the verdict, not what a human reviewing the diff
    sees. See TestScoreFieldDetailMatchesScoreField: this must never
    silently drift from score_field()'s own tally for the same inputs."""
    if field in LIST_FIELDS:
        expected_list = expected or []
        predicted_list = predicted or []
        if not expected_list and not predicted_list:
            return [{"item": None, "predicted": None, "expected": None, "verdict": "correct"}]
        want_norm = {normalize(str(item)): item for item in expected_list}
        got_norm = {normalize(str(item)): item for item in predicted_list}
        details = []
        for key, original in want_norm.items():
            if key in got_norm:
                details.append({"item": original, "predicted": got_norm[key], "expected": original, "verdict": "correct"})
            else:
                details.append({"item": original, "predicted": None, "expected": original, "verdict": "missing"})
        for key, original in got_norm.items():
            if key not in want_norm:
                details.append({"item": original, "predicted": original, "expected": None, "verdict": "wrong"})
        return details

    if field == "nutrition_table":
        want = expected or {}
        got = predicted or {}
        if not want and not got:
            return [{"item": None, "predicted": None, "expected": None, "verdict": "correct"}]
        want_norm = {normalize(str(k)): (k, v) for k, v in want.items()}
        got_norm = {normalize(str(k)): (k, v) for k, v in got.items()}
        details = []
        for norm_key, (orig_key, orig_val) in want_norm.items():
            if norm_key in got_norm:
                _got_key, got_val = got_norm[norm_key]
                verdict = "correct" if normalize(str(orig_val)) == normalize(str(got_val)) else "wrong"
                details.append({"item": orig_key, "predicted": got_val, "expected": orig_val, "verdict": verdict})
            else:
                details.append({"item": orig_key, "predicted": None, "expected": orig_val, "verdict": "missing"})
        for norm_key, (orig_key, orig_val) in got_norm.items():
            if norm_key not in want_norm:
                details.append({"item": orig_key, "predicted": orig_val, "expected": None, "verdict": "wrong"})
        return details

    # Scalar (EXACT_FIELDS or FUZZY_FIELDS) — mirrors score_field()'s own branch exactly.
    predicted_n, expected_n = normalize(predicted), normalize(expected)

    if expected_n is None:
        if predicted_n is None:
            return [{"item": None, "predicted": None, "expected": None, "verdict": "correct"}]
        return [{"item": None, "predicted": predicted, "expected": None, "verdict": "wrong"}]
    if predicted_n is None:
        return [{"item": None, "predicted": None, "expected": expected, "verdict": "missing"}]

    if field in FUZZY_FIELDS:
        match = predicted_n in expected_n or expected_n in predicted_n
    else:
        match = predicted_n == expected_n

    return [{"item": None, "predicted": predicted, "expected": expected, "verdict": "correct" if match else "wrong"}]


# ============================================================
# Step 3 (accuracy plan) — a metric a client would sign
# ============================================================
# normalize() above is whitespace+case only. normalize_value() adds
# unit-level normalization on top, for nutrition_table values, package_size,
# and list-field items — fields where the same real-world value legitimately
# gets printed/OCR'd in slightly different but equivalent forms. Every rule
# here is grounded in a real pair from a Step 1 `eval/diff.py` run (see the
# tests, and STEP1_FAILURE_ANALYSIS.md), not invented.
_DECIMAL_COMMA = re.compile(r"(?<=\d),(?=\d)")
_UNIT_NO_SPACE = re.compile(r"(\d)\s*(mcg|µg|μg|kcal|mg|iu|g)\b")
_TRAILING_PARENTHETICAL = re.compile(r"\s*\([^)]*\)\s*$")
_TRAILING_PERCENT_RDA = re.compile(r"\s*%\s*rda\s*$")
_TRAILING_BARE_PERCENT = re.compile(r"(?<=\d)\s*%$")


def normalize_value(field, value, strip_parenthetical=True):
    """Value-level normalization beyond normalize()'s whitespace+case.

    strip_parenthetical defaults to True (nutrition_table values,
    package_size) but is turned off for list-field items (ingredients,
    claims): a nutrition value's trailing parenthetical is almost always a
    %DV/RDA annotation safe to drop symmetrically from both sides ('12
    kcal' vs '12 kcal (<0.6% DV)' — the headline number+unit is what's
    being compared, not the annotation). An ingredient's parenthetical is
    often its main distinguishing content ('Vitamin C (Ascorbic acid)') —
    stripping it there would throw away exactly what the token-set list
    matcher (score_list_field_fuzzy) is designed to use instead."""
    n = normalize(value)
    if n is None:
        return None
    n = _DECIMAL_COMMA.sub(".", n)
    n = _UNIT_NO_SPACE.sub(lambda m: f"{m.group(1)} {'mcg' if m.group(2) in ('µg', 'μg') else m.group(2)}", n)
    if strip_parenthetical:
        n = _TRAILING_PARENTHETICAL.sub("", n)
    n = _TRAILING_PERCENT_RDA.sub("", n)
    n = _TRAILING_BARE_PERCENT.sub("", n)
    n = n.rstrip(" .,;:")
    return n or None


def normalize_nutrition_key(key):
    """Nutrition row KEYS get their own normalization: strip a parenthetical
    unit ('Energy (kcal)' -> 'energy'), then compare by TOKEN SET so word
    order and connecting punctuation don't matter ('Total Fat' and
    'Fat, total' both become the same {'total', 'fat'})."""
    n = normalize(key)
    if n is None:
        return None
    n = re.sub(r"\([^)]*\)", " ", n)
    n = re.sub(r"[,:]", " ", n)
    tokens = frozenset(n.split())
    return tokens if tokens else None


def _is_fuzzy_match(predicted_n, expected_n):
    """Levenshtein ratio >= 0.85, OR one side contains the other with the
    shorter side at least 4 characters (so a 2-character fragment like "IN"
    can't trivially "match" by being a substring of "INDIA")."""
    if predicted_n is None or expected_n is None:
        return False
    if predicted_n == expected_n:
        return True
    if predicted_n in expected_n or expected_n in predicted_n:
        if min(len(predicted_n), len(expected_n)) >= 4:
            return True
    return (fuzz.ratio(predicted_n, expected_n) / 100.0) >= 0.85


def score_field_fuzzy(field, predicted, expected):
    """New-metric sibling of score_field() for a SCALAR field (EXACT_FIELDS
    or FUZZY_FIELDS): same correct/missing handling, but a strict WRONG is
    given a second chance via normalize_value() + _is_fuzzy_match(). Returns
    {'correct_strict','correct_fuzzy','wrong','missing'} — correct_strict's
    count is always <= correct_fuzzy's (a strict match is trivially also a
    fuzzy one), so correct_fuzzy is the headline and correct_strict stays
    visible in the same row for comparison, per the directive."""
    strict = score_field(field, predicted, expected)
    if strict["wrong"] == 0:
        return {**strict, "correct_strict": strict["correct"], "correct_fuzzy": strict["correct"]}
    predicted_n = normalize_value(field, predicted)
    expected_n = normalize_value(field, expected)
    if _is_fuzzy_match(predicted_n, expected_n):
        return {"correct_strict": 0, "correct_fuzzy": 1, "wrong": 0, "missing": 0}
    return {"correct_strict": 0, "correct_fuzzy": 0, "wrong": 1, "missing": 0}


def score_list_field_fuzzy(field, predicted, expected):
    """New-metric sibling of score_field() for a list field (claims,
    ingredients — NOT colour_theme, which Step 3.4 moves to the visual
    block entirely). Each expected item is matched against the single best
    still-unclaimed predicted item by rapidfuzz's token-set ratio (handles
    a parenthetical clarification like 'Vitamin C (Ascorbic acid)' matching
    the simpler 'Vitamin C', since token-set ratio scores on token overlap
    rather than full-string equality) — >= 0.85 counts as a match; matched
    pairs are removed from the pool so one predicted item can't satisfy two
    different expected items."""
    strict = score_field(field, predicted, expected)
    expected_list = list(expected or [])
    predicted_list = list(predicted or [])
    if not expected_list and not predicted_list:
        return {"correct_strict": 1, "correct_fuzzy": 1, "wrong": 0, "missing": 0}

    got_norm = [normalize_value(field, item, strip_parenthetical=False) for item in predicted_list]
    unclaimed = {i for i, n in enumerate(got_norm) if n is not None}

    correct_fuzzy = 0
    for want_item in expected_list:
        want_n = normalize_value(field, want_item, strip_parenthetical=False)
        if want_n is None:
            continue
        best_idx, best_score = None, 0.0
        for i in unclaimed:
            s = fuzz.token_set_ratio(want_n, got_norm[i]) / 100.0
            if s > best_score:
                best_score, best_idx = s, i
        if best_idx is not None and best_score >= 0.85:
            correct_fuzzy += 1
            unclaimed.discard(best_idx)

    missing = len(expected_list) - correct_fuzzy
    wrong = len(unclaimed)  # predicted items that matched nothing — hallucinated / unmatched
    return {"correct_strict": strict["correct"], "correct_fuzzy": correct_fuzzy, "wrong": wrong, "missing": missing}


def score_nutrition_table_fuzzy(predicted, expected):
    """New-metric sibling of score_field()'s nutrition_table branch: rows
    are matched by normalize_nutrition_key() (token-set equality) instead
    of exact key text, and a matched row's values are compared via
    normalize_value() + _is_fuzzy_match() instead of exact/normalized
    string equality."""
    strict = score_field("nutrition_table", predicted, expected)
    want = expected or {}
    got = predicted or {}
    if not want and not got:
        return {"correct_strict": 1, "correct_fuzzy": 1, "wrong": 0, "missing": 0}

    want_keyed = {}
    for k, v in want.items():
        nk = normalize_nutrition_key(k)
        if nk is not None:
            want_keyed[nk] = v
    got_keyed = {}
    for k, v in got.items():
        nk = normalize_nutrition_key(k)
        if nk is not None:
            got_keyed[nk] = v

    correct_fuzzy = 0
    wrong = 0
    for nk, want_v in want_keyed.items():
        if nk in got_keyed:
            if _is_fuzzy_match(normalize_value("nutrition_table", got_keyed[nk]), normalize_value("nutrition_table", want_v)):
                correct_fuzzy += 1
            else:
                wrong += 1
    missing = len(want_keyed) - correct_fuzzy - wrong
    wrong += sum(1 for nk in got_keyed if nk not in want_keyed)  # hallucinated rows
    return {"correct_strict": strict["correct"], "correct_fuzzy": correct_fuzzy, "wrong": wrong, "missing": missing}


def score_field_new_metric(field, predicted, expected):
    """The new metric's per-field score — dispatches by field type exactly
    like score_field(), but every branch adds a correct_fuzzy count
    alongside correct_strict/wrong/missing. Visual fields (logo, layout,
    colour_theme) get the strict result unchanged in both columns — they
    don't participate in the fuzzy text metric at all; see aggregate_new_
    metric for where they go instead."""
    if field in VISUAL_FIELDS:
        strict = score_field(field, predicted, expected)
        return {**strict, "correct_strict": strict["correct"], "correct_fuzzy": strict["correct"]}
    if field in LIST_FIELDS:
        return score_list_field_fuzzy(field, predicted, expected)
    if field == "nutrition_table":
        return score_nutrition_table_fuzzy(predicted, expected)
    return score_field_fuzzy(field, predicted, expected)


def aggregate_new_metric(field_results):
    """field_results: a list of {field: {'correct_strict','correct_fuzzy',
    'wrong','missing'}} dicts, one per scored label (score_field_new_
    metric's shape, not score_field's). Returns {'text': {...}, 'visual':
    {...}} — text is every TEXT_FIELDS field aggregated with correct_fuzzy
    as the headline accuracy (strict_accuracy kept alongside for
    comparison); visual is the three VISUAL_FIELDS aggregated by their
    strict count only, fuzzy matching not being meaningful for a free-text
    visual description."""
    per_field = defaultdict(lambda: {"correct_strict": 0, "correct_fuzzy": 0, "wrong": 0, "missing": 0})
    for record in field_results:
        for field, counts in record.items():
            per_field[field]["correct_strict"] += counts["correct_strict"]
            per_field[field]["correct_fuzzy"] += counts["correct_fuzzy"]
            per_field[field]["wrong"] += counts["wrong"]
            per_field[field]["missing"] += counts["missing"]

    def _block(fields):
        out = {}
        overall = {"correct_strict": 0, "correct_fuzzy": 0, "wrong": 0, "missing": 0}
        for field in fields:
            counts = per_field.get(field, {"correct_strict": 0, "correct_fuzzy": 0, "wrong": 0, "missing": 0})
            total = counts["correct_fuzzy"] + counts["wrong"] + counts["missing"]
            out[field] = {**counts, "total": total}
            for key in overall:
                overall[key] += counts[key]
        overall_total = overall["correct_fuzzy"] + overall["wrong"] + overall["missing"]
        overall["total"] = overall_total
        overall["accuracy"] = (overall["correct_fuzzy"] / overall_total) if overall_total else 0.0
        overall["strict_accuracy"] = (overall["correct_strict"] / overall_total) if overall_total else 0.0
        return {"per_field": out, "overall": overall}

    return {"text": _block(TEXT_FIELDS), "visual": _block(VISUAL_FIELDS)}


def compute_fabrication(predictions_by_source, ground_truth):
    """Step 3.5: how often does the pipeline confidently produce a value for
    a field the label genuinely doesn't have one for? Worse than a MISSING
    cell (an honest "I don't know") because a fabricated value looks like a
    real answer. Tallied per field as a count and a rate — out of every
    label where the field is genuinely blank, the only labels a fabrication
    could happen on ("opportunities"). This must never go up in exchange
    for accuracy (the directive's own words)."""
    fabricated = defaultdict(int)
    opportunities = defaultdict(int)
    for source_file, (expected, _pages, _conflicts) in ground_truth.items():
        predicted = predictions_by_source.get(source_file) or {}
        for field in FIELDS:
            if not _empty(expected.get(field)):
                continue
            opportunities[field] += 1
            if not _empty(predicted.get(field)):
                fabricated[field] += 1
    return {
        field: {
            "fabricated": fabricated[field],
            "opportunities": opportunities[field],
            "rate": (fabricated[field] / opportunities[field]) if opportunities[field] else 0.0,
        }
        for field in FIELDS
        if opportunities[field] > 0
    }


def _record_conflict(conflicts, key, first_value, new_value):
    existing = next((c for c in conflicts if c[0] == key), None)
    if existing:
        if new_value not in existing[1]:
            existing[1].append(new_value)
    else:
        conflicts.append((key, [first_value, new_value]))


def merge_label_pages(pages):
    """Combines however many printed pages one product's PDF has into one
    label dict, matching how the real extraction pipeline already merges
    fields across every rasterized page before anyone uses the result (see
    this module's own docstring).

    List fields (claims, ingredients, colour_theme) and nutrition_table's
    rows are UNIONED across pages, deduplicated, in page order — a front
    panel showing a few claims and a back panel showing different ones is
    normal, not a conflict; the real claim set for the label is everything
    printed anywhere on it. A genuinely repeated nutrition-table row with a
    DIFFERENT value on two pages is still a real conflict and is reported.

    Every other field keeps first-non-empty-value-wins, in page order, and
    reports a (field, [values]) conflict when two pages disagree — a real
    case in this project's own data is a front/back pack-count mismatch,
    which must be surfaced, never silently resolved by picking one value
    and hiding that the source data disagrees with itself."""
    merged = {}
    conflicts = []
    for page in pages:
        for field, value in page.items():
            if _empty(value):
                continue

            if field in LIST_FIELDS:
                existing = merged.setdefault(field, [])
                for item in value:
                    if item not in existing:
                        existing.append(item)
                continue

            if field == "nutrition_table":
                existing = merged.setdefault(field, {})
                for row_name, amount in value.items():
                    if row_name not in existing:
                        existing[row_name] = amount
                    elif existing[row_name] != amount:
                        _record_conflict(conflicts, f"nutrition_table.{row_name}", existing[row_name], amount)
                continue

            if field not in merged:
                merged[field] = value
            elif merged[field] != value:
                _record_conflict(conflicts, field, merged[field], value)
    return merged, conflicts


def aggregate(field_results):
    """field_results: a list of {field: {'correct','wrong','missing'}} dicts,
    one per scored label. Returns per-field and overall tallies with
    accuracy = correct / total."""
    per_field = defaultdict(lambda: {"correct": 0, "wrong": 0, "missing": 0})
    for record in field_results:
        for field, counts in record.items():
            per_field[field]["correct"] += counts["correct"]
            per_field[field]["wrong"] += counts["wrong"]
            per_field[field]["missing"] += counts["missing"]

    per_field_out = {}
    overall = {"correct": 0, "wrong": 0, "missing": 0}
    for field, counts in per_field.items():
        total = counts["correct"] + counts["wrong"] + counts["missing"]
        per_field_out[field] = {**counts, "total": total}
        overall["correct"] += counts["correct"]
        overall["wrong"] += counts["wrong"]
        overall["missing"] += counts["missing"]

    overall_total = overall["correct"] + overall["wrong"] + overall["missing"]
    overall["total"] = overall_total
    overall["accuracy"] = (overall["correct"] / overall_total) if overall_total else 0.0

    return {"per_field": per_field_out, "overall": overall}


def load_ground_truth():
    """Returns {sourceFile: (merged_label_dict, [(slug, page)], conflicts)}.
    The slug is always taken from the annotation file's own name, not an
    `image_file` key inside it — 44 of the 60 real annotation files predate
    that field and don't have one, while every file's name IS its slug by
    construction (review_server.py writes `<slug>.json`)."""
    by_source = defaultdict(list)
    for path in sorted(ANNOTATIONS_DIR.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        doc["_slug"] = path.stem
        by_source[doc["sourceFile"]].append(doc)

    grouped = {}
    for source_file, docs in by_source.items():
        docs.sort(key=lambda d: d.get("page", 0))
        merged, conflicts = merge_label_pages([d.get("label", {}) for d in docs])
        pages = [(d["_slug"], d.get("page", 0)) for d in docs]
        grouped[source_file] = (merged, pages, conflicts)
    return grouped


def score_labels(predictions_by_source, ground_truth):
    """predictions_by_source: {sourceFile: merged_predicted_label_dict}.
    Returns (field_results, conflicts_seen, details) for aggregate() and
    eval/diff.py — details is the flat list of every score_field_detail()
    row, across every label and field, each tagged with its source_file and
    field so eval/diff.py can filter/group them without recomputing
    anything."""
    field_results = []
    all_conflicts = []
    all_details = []
    for source_file, (expected, _pages, conflicts) in ground_truth.items():
        if conflicts:
            all_conflicts.append((source_file, conflicts))
        predicted = predictions_by_source.get(source_file, {})
        record = {}
        for field in FIELDS:
            predicted_value = predicted.get(field)
            expected_value = expected.get(field)
            record[field] = score_field(field, predicted_value, expected_value)
            for detail in score_field_detail(field, predicted_value, expected_value):
                all_details.append({"source_file": source_file, "field": field, **detail})
        field_results.append(record)
    return field_results, all_conflicts, all_details


def score_labels_new_metric(predictions_by_source, ground_truth):
    """Step 3's sibling of score_labels(): same per-label, per-field loop,
    scored with score_field_new_metric() instead of score_field(). Kept as
    a separate pass rather than folded into score_labels() itself so the
    strict metric's own numbers (and eval/diff.py, which reads score_field_
    detail's strict verdicts) are never at risk of drifting because of a
    Step 3 change — the directive is explicit that the strict row keeps
    being written unchanged. Returns a list of {field: {'correct_strict',
    'correct_fuzzy','wrong','missing'}} dicts, one per label, ready for
    aggregate_new_metric()."""
    field_results = []
    for source_file, (expected, _pages, _conflicts) in ground_truth.items():
        predicted = predictions_by_source.get(source_file, {})
        record = {}
        for field in FIELDS:
            record[field] = score_field_new_metric(field, predicted.get(field), expected.get(field))
        field_results.append(record)
    return field_results


def compute_by_source_table(predictions_by_source, ground_truth):
    """Step 2 (accuracy plan): is a given extraction pass net-positive or
    net-negative on a given field? A --mode pipeline record carries
    field_sources (which pass wrote each of the nine FIELD_SOURCE_TRACKED_
    FIELDS' non-blank values) alongside its predicted fields; this joins
    that against score_field()'s own correct/wrong verdict for the same
    field, tallied per (field, source) pair across every label.

    A field with no field_sources entry for a label — meaning it's blank in
    the prediction, or came from a mode/script that doesn't emit
    field_sources at all (--mode textlayer, --mode ai) — contributes
    nothing: there's no source to credit or blame for a MISSING cell, and a
    mode with no field_sources produces an empty table entirely, which is
    correct (this table only means something for --mode pipeline).

    Returns {(field, source): {'correct': n, 'wrong': n}}."""
    counts = defaultdict(lambda: {"correct": 0, "wrong": 0})
    for source_file, (expected, _pages, _conflicts) in ground_truth.items():
        predicted = predictions_by_source.get(source_file) or {}
        sources = predicted.get("field_sources") or {}
        for field in FIELD_SOURCE_TRACKED_FIELDS:
            source = sources.get(field)
            if not source:
                continue
            result = score_field(field, predicted.get(field), expected.get(field))
            counts[(field, source)]["correct"] += result["correct"]
            counts[(field, source)]["wrong"] += result["wrong"]
    return dict(counts)


def format_by_source_table(by_source):
    """Renders compute_by_source_table()'s output as markdown lines, sorted
    by field then source for a stable diff between runs. Empty input (any
    mode other than pipeline, or a pipeline run against extraction code that
    predates field_sources) produces no lines at all, so write_results_md
    can unconditionally append this and get nothing extra when it doesn't
    apply."""
    if not by_source:
        return []
    lines = [
        "\n**Accuracy by source** (which pass produced each field's value — "
        "a source with more wrong than correct is actively hurting that "
        "field and is a candidate to gate off; MISSING cells have no source "
        "and aren't counted here):",
        "| field | source | correct | wrong | accuracy |",
        "|---|---|---|---|---|",
    ]
    for field, source in sorted(by_source.keys()):
        counts = by_source[(field, source)]
        total = counts["correct"] + counts["wrong"]
        acc = (counts["correct"] / total) if total else 0.0
        lines.append(f"| {field} | {source} | {counts['correct']} | {counts['wrong']} | {acc:.1%} |")
    return lines


def run_ai_mode():
    """Runs today's existing one-shot Qwen2-VL-2B pipeline (ExtractionService)
    over every ground-truth page, merging predictions per sourceFile the same
    way merge_label_pages() combines ground truth, so the comparison is
    apples-to-apples."""
    from PIL import Image

    from app.services.extraction import ExtractionService

    ground_truth = load_ground_truth()
    service = ExtractionService(use_mock=False)

    predictions_by_source = {}
    for source_file, (_expected, pages, _conflicts) in ground_truth.items():
        page_predictions = []
        for slug, _page_num in pages:
            image_path = IMAGES_DIR / f"{slug}.png"
            if not image_path.is_file():
                print(f"  WARNING: no image for {slug}, skipping this page", file=sys.stderr)
                continue
            predicted = service.extract_from_image(Image.open(image_path).convert("RGB")).model_dump()
            page_predictions.append(predicted)
            print(f"  {slug}: extracted", flush=True)
        merged, _conflicts = merge_label_pages(page_predictions)
        predictions_by_source[source_file] = merged

    return predictions_by_source, ground_truth


def _collect_ground_truth_pdfs(ground_truth):
    """PDFs are read from EVAL_LABEL_PDF_DIR, which defaults to ai_backend's
    finetune/source_labels directory but can be overridden via the
    EVAL_LABEL_PDF_DIR environment variable."""
    label_pdf_dir = Path(os.environ.get("EVAL_LABEL_PDF_DIR", AI_BACKEND_DIR / "finetune" / "source_labels"))
    pdf_paths = []
    for source_file in ground_truth.keys():
        pdf_path = label_pdf_dir / source_file
        if pdf_path.is_file():
            pdf_paths.append(pdf_path)
        else:
            print(f"  WARNING: no PDF for {source_file}, skipping", file=sys.stderr)
    if not pdf_paths:
        raise SystemExit(f"No PDFs found in {label_pdf_dir} — please check the directory exists and contains PDFs")
    return pdf_paths


def _subprocess_env(vlm, masters="off"):
    """The Node CLI subprocess's environment: inherits everything the parent
    process has (so a real OLLAMA_URL already configured for --vlm on just
    keeps working, no extra setup needed), except when --vlm off explicitly
    blanks OLLAMA_URL for THIS call only — isVlmEnabled() in ollamaVlm
    .service.ts is exactly `env.ollamaUrl !== ''`, so this is the one lever
    that forces the VLM role-resolution step off regardless of what's
    configured in the ambient environment, which is the only way to measure
    the pipeline's own non-VLM accuracy against the exact same code path
    used with it on.

    masters="on" points EVAL_MASTERS_JSON (read by extract-textlayer.ts /
    extract-pipeline.ts, accuracy2 plan Step 2) at this eval directory's own
    masters.json for THIS call only; masters="off" (the historical behavior,
    still the default) removes it even if the ambient environment happens to
    have it set, so a masters-off run is never accidentally contaminated by
    whatever the shell was last configured for -- same isolation guarantee
    the vlm lever already gives OLLAMA_URL."""
    env = os.environ.copy()
    if vlm == "off":
        env["OLLAMA_URL"] = ""
    if masters == "on":
        env["EVAL_MASTERS_JSON"] = str(MASTERS_JSON)
    else:
        env.pop("EVAL_MASTERS_JSON", None)
    return env


def _run_node_extraction_cli_once(script_name, pdf_paths, mode_label, backend_dir, vlm="on", masters="off"):
    """One subprocess invocation of a backend/scripts/*.ts CLI over however
    many PDFs are passed. Returns predictions keyed by source file."""
    cmd = ["node", "-r", "tsx/cjs", f"scripts/{script_name}", *[str(p) for p in pdf_paths]]

    try:
        # encoding="utf-8" explicitly: on Windows, text=True alone decodes
        # with the console's default codepage (cp1252), which cannot
        # represent every byte a real label's extracted text can contain
        # (confirmed live — a real address field crashed this with
        # UnicodeDecodeError on a single non-cp1252 byte) and fails
        # silently in a background reader thread, leaving `result.stdout`
        # as None rather than raising here.
        result = subprocess.run(
            cmd, cwd=backend_dir, capture_output=True, text=True, encoding="utf-8", check=True,
            env=_subprocess_env(vlm, masters)
        )
    except subprocess.CalledProcessError as e:
        raise SystemExit(f"{mode_label} extraction failed: {e.stderr}")

    try:
        records = json.loads(result.stdout)
    except json.JSONDecodeError as e:
        raise SystemExit(f"Failed to parse {mode_label} extraction output as JSON: {e}")

    predictions_by_source = {}
    for record in records:
        source_file = record.pop("source_file")
        # Normalize nutrition_table to empty dict when null (so score_field sees a dict).
        if record.get("nutrition_table") is None:
            record["nutrition_table"] = {}
        predictions_by_source[source_file] = record

    return predictions_by_source


def _run_node_extraction_cli(script_name, pdf_paths, mode_label, batch_size=None, vlm="on", masters="off"):
    """Runs a backend/scripts/*.ts CLI (extract-textlayer.ts or
    extract-pipeline.ts — both accept the same <pdf>... argv and print the
    same JSON-array-of-records shape) and returns predictions keyed by
    source file, ready to hand to score_labels() alongside ground truth.

    batch_size splits pdf_paths across multiple subprocess calls instead of
    one process holding all of them — real finding, not a hypothetical one:
    a single Node process keeping Ollama and the OCR engine resident for
    every label in one run was killed by the OS for running this
    development machine (16GB total RAM, shared with everything else
    already open) out of memory partway through a 45-label run. Each batch's
    process exits and releases its memory before the next one starts, so
    the footprint stays bounded by one batch's worth of work rather than
    growing for the whole run. None (the default) keeps the old
    one-process-for-everything behavior — used by run_textlayer_mode, which
    has no model/engine memory of its own to worry about."""
    backend_dir = AI_BACKEND_DIR.parent / "backend"
    batch_size = batch_size or len(pdf_paths)

    predictions_by_source = {}
    for start in range(0, len(pdf_paths), batch_size):
        batch = pdf_paths[start : start + batch_size]
        predictions_by_source.update(
            _run_node_extraction_cli_once(script_name, batch, mode_label, backend_dir, vlm, masters)
        )
    return predictions_by_source


def run_textlayer_mode(masters="off"):
    """Runs the text-layer-only extraction pipeline (Node CLI via
    backend/scripts/extract-textlayer.ts) over every ground-truth label's PDF,
    merging predictions per sourceFile the same way merge_label_pages()
    combines ground truth, so the comparison is apples-to-apples. The CLI is
    invoked ONCE with all available PDFs and returns a JSON array of
    extraction results.

    masters="on" points the CLI at this eval directory's own masters.json
    (see _subprocess_env) so brand/flavour/claims candidates come from the
    client's real catalogue instead of running anchor-less; "off" (the
    default, and the only configuration every pre-Step-2 measurement ever
    ran under) leaves those candidate lists empty."""
    ground_truth = load_ground_truth()
    pdf_paths = _collect_ground_truth_pdfs(ground_truth)
    predictions_by_source = _run_node_extraction_cli("extract-textlayer.ts", pdf_paths, "Text layer", masters=masters)
    return predictions_by_source, ground_truth


def run_pipeline_mode(vlm="on", masters="off"):
    """Runs the FULL pipeline (Node CLI via backend/scripts/extract-pipeline.ts:
    text layer, then OCR with outlined-text detection, then Ollama VLM
    role-resolution for whatever is still blank — Phases C+D+E combined)
    over every ground-truth label's PDF. Same PDF collection and JSON-record
    handling as run_textlayer_mode(), against the full-pipeline CLI instead
    of the text-layer-only one.

    vlm="on" (default) uses whatever OLLAMA_URL is already configured in the
    ambient environment — unchanged from before this parameter existed.
    vlm="off" forces the VLM role-resolution step off for this run
    regardless of the ambient environment (see _subprocess_env), so both can
    be measured from the exact same code path and land side by side in
    RESULTS.md (Step 2, accuracy plan).

    masters="on"/"off" — see run_textlayer_mode's own note; same lever here.

    Runs in small batches (see _run_node_extraction_cli's own docstring) —
    this mode is the one that keeps Ollama and the OCR engine loaded, so
    it's the one that actually needs the memory headroom batching buys."""
    ground_truth = load_ground_truth()
    pdf_paths = _collect_ground_truth_pdfs(ground_truth)
    batch_size = int(os.environ.get("EVAL_PIPELINE_BATCH_SIZE", "5"))
    predictions_by_source = _run_node_extraction_cli(
        "extract-pipeline.ts", pdf_paths, "Full pipeline", batch_size=batch_size, vlm=vlm, masters=masters
    )
    return predictions_by_source, ground_truth


def _git_sha():
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=AI_BACKEND_DIR, text=True).strip()
    except Exception:
        return "unknown"


def format_new_metric_block(new_metric):
    """Renders aggregate_new_metric()'s {'text','visual'} output as markdown:
    the 13 TEXT_FIELDS' headline (correct_fuzzy accuracy, with strict shown
    alongside for comparison — this is the number the 80% target applies
    to), then the 3 VISUAL_FIELDS as their own block, scored strictly only
    (fuzzy text-matching isn't meaningful for a free-text visual
    description). Empty/missing input produces no lines."""
    if not new_metric or not new_metric.get("text"):
        return []
    text, visual = new_metric["text"], new_metric["visual"]
    lines = [
        f"\n**New metric — text fields only** ({len(TEXT_FIELDS)} fields; logo/layout/colour_theme are "
        "scored separately below, per the brief comparing them as images, not text). "
        f"Accuracy: **{text['overall']['accuracy']:.1%}** (fuzzy/normalized — the 80% target) "
        f"/ {text['overall']['strict_accuracy']:.1%} (strict, for comparison to the row above)\n",
        "| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |",
        "|---|---|---|---|---|---|",
    ]
    for field in TEXT_FIELDS:
        c = text["per_field"].get(field, {"correct_strict": 0, "correct_fuzzy": 0, "wrong": 0, "missing": 0, "total": 0})
        acc = (c["correct_fuzzy"] / c["total"]) if c["total"] else 0.0
        lines.append(f"| {field} | {c['correct_strict']} | {c['correct_fuzzy']} | {c['wrong']} | {c['missing']} | {acc:.1%} |")

    lines.append(
        f"\n**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, "
        f"not part of the 80% text target; strict matching only): {visual['overall']['strict_accuracy']:.1%}\n"
    )
    lines.append("| field | correct | wrong | missing | accuracy |")
    lines.append("|---|---|---|---|---|")
    for field in VISUAL_FIELDS:
        c = visual["per_field"].get(field, {"correct_strict": 0, "wrong": 0, "missing": 0, "total": 0})
        acc = (c["correct_strict"] / c["total"]) if c["total"] else 0.0
        lines.append(f"| {field} | {c['correct_strict']} | {c['wrong']} | {c['missing']} | {acc:.1%} |")
    return lines


def format_fabrication_table(fabrication):
    """Renders compute_fabrication()'s output as markdown. Sorted by rate
    descending (worst first — this is a line a client reads to ask "what
    does it make up," so the worst offender belongs at the top). Empty
    input produces no lines."""
    if not fabrication:
        return []
    lines = [
        "\n**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — "
        "must never go up in exchange for accuracy):",
        "| field | fabricated | opportunities | rate |",
        "|---|---|---|---|",
    ]
    for field, counts in sorted(fabrication.items(), key=lambda kv: kv[1]["rate"], reverse=True):
        lines.append(f"| {field} | {counts['fabricated']} | {counts['opportunities']} | {counts['rate']:.1%} |")
    return lines


def write_results_md(mode_label, summary, conflicts, label_count, by_source=None, new_metric=None, fabrication=None):
    """mode_label is the text shown in the row's own header — plain
    "pipeline" for textlayer/ai, or "pipeline (vlm on)"/"pipeline (vlm off)"
    for a pipeline run, so both sit side by side in the file distinguishable
    by eye (Step 2, accuracy plan). by_source, when given a non-empty
    compute_by_source_table() result, appends the by-source accuracy table
    right after the by-field one; omitted or empty adds nothing."""
    RESULTS_MD.parent.mkdir(parents=True, exist_ok=True)
    existing = RESULTS_MD.read_text(encoding="utf-8") if RESULTS_MD.is_file() else (
        "# Extraction accuracy — RESULTS\n\n"
        "The only source of truth for extraction accuracy numbers on this project. "
        "Every row here was written by `eval/score.py`; if a number isn't here, it "
        "isn't verified — don't quote it.\n"
    )

    date = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    sha = _git_sha()
    overall = summary["overall"]

    lines = [
        f"\n## {date} — mode `{mode_label}` — {sha}\n",
        f"**{label_count} labels, {overall['total']} fields scored.** "
        f"Overall accuracy: **{overall['accuracy']:.1%}** "
        f"({overall['correct']} correct / {overall['wrong']} wrong / {overall['missing']} missing)\n",
        "| field | correct | wrong | missing | accuracy |",
        "|---|---|---|---|---|",
    ]
    for field in FIELDS:
        counts = summary["per_field"].get(field, {"correct": 0, "wrong": 0, "missing": 0, "total": 0})
        acc = (counts["correct"] / counts["total"]) if counts["total"] else 0.0
        lines.append(f"| {field} | {counts['correct']} | {counts['wrong']} | {counts['missing']} | {acc:.1%} |")

    lines.extend(format_by_source_table(by_source or {}))
    lines.extend(format_new_metric_block(new_metric))
    lines.extend(format_fabrication_table(fabrication))

    if conflicts:
        lines.append("\n**Ground-truth conflicts found** (a field printed differently on two pages "
                      "of the same label — resolved by keeping the first page's value; worth a human look):")
        for source_file, field_conflicts in conflicts:
            for field, values in field_conflicts:
                lines.append(f"- `{source_file}` — {field}: {values}")

    RESULTS_MD.write_text(existing + "\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nWrote {RESULTS_MD}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mode", choices=["ai", "textlayer", "pipeline"], required=True)
    parser.add_argument(
        "--vlm", choices=["on", "off"], default="on",
        help="--mode pipeline only: 'on' (default) uses whatever OLLAMA_URL is already configured in the "
             "environment, unchanged from before this flag existed. 'off' forces the VLM role-resolution "
             "step off for this run regardless of the ambient environment, so both can be measured from "
             "the same code path and compared side by side in RESULTS.md (Step 2, accuracy plan)."
    )
    parser.add_argument(
        "--masters", choices=["on", "off"], default=None,
        help="--mode textlayer/pipeline only: whether the extraction is handed the client's Masters "
             "catalogue (eval/masters.json, from build_masters.py) as brand/flavour/claims candidates. "
             "Defaults to 'on' if masters.json exists on disk, 'off' otherwise -- so an environment with "
             "no masters.json built yet runs exactly as every pre-Step-2 measurement did. Pass explicitly "
             "to get a masters-off row even when masters.json exists, for a side-by-side RESULTS.md "
             "comparison (Step 2, accuracy plan)."
    )
    args = parser.parse_args()

    if args.mode != "pipeline" and args.vlm == "off":
        parser.error("--vlm off only applies to --mode pipeline (ai and textlayer never call the VLM)")

    if args.masters is not None and args.mode == "ai":
        parser.error("--masters only applies to --mode textlayer/pipeline (ai mode never calls the Node CLI)")

    if args.masters is None:
        args.masters = "on" if MASTERS_JSON.is_file() else "off"

    if args.mode == "ai":
        predictions_by_source, ground_truth = run_ai_mode()
    elif args.mode == "textlayer":
        predictions_by_source, ground_truth = run_textlayer_mode(masters=args.masters)
    else:
        predictions_by_source, ground_truth = run_pipeline_mode(vlm=args.vlm, masters=args.masters)

    field_results, conflicts, details = score_labels(predictions_by_source, ground_truth)
    summary = aggregate(field_results)
    by_source = compute_by_source_table(predictions_by_source, ground_truth) if args.mode == "pipeline" else {}

    # Step 3: the new metric and fabrication rate are computed on every
    # mode's run (not just pipeline) — the directive keeps the strict row
    # comparable across ai/textlayer/pipeline, and the new metric should be
    # too, so a client can see the same two numbers move together on any
    # of the three baselines, not just the current pipeline.
    new_metric_results = score_labels_new_metric(predictions_by_source, ground_truth)
    new_metric = aggregate_new_metric(new_metric_results)
    fabrication = compute_fabrication(predictions_by_source, ground_truth)

    # A run file is suffixed by whichever of --vlm/--masters were run
    # non-default, so no combination ever clobbers another's file on disk —
    # every one needs to survive for eval/diff.py and eval/ceiling.py to
    # compare them. The all-default combination (vlm on, masters off) keeps
    # the original unsuffixed <mode>.json name for backward compatibility
    # with diff.py's/ceiling.py's existing usage (Steps 1-2).
    suffix_parts = []
    if args.mode == "pipeline" and args.vlm == "off":
        suffix_parts.append("vlm-off")
    if args.masters == "on":
        suffix_parts.append("masters-on")
    run_key = args.mode if not suffix_parts else f"{args.mode}-{'-'.join(suffix_parts)}"
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    run_path = RUNS_DIR / f"{run_key}.json"
    run_path.write_text(json.dumps({
        "mode": args.mode,
        "vlm": args.vlm if args.mode == "pipeline" else None,
        "masters": args.masters if args.mode != "ai" else None,
        "summary": summary,
        "conflicts": conflicts,
        "details": details,
        "by_source": {f"{field}|{source}": counts for (field, source), counts in by_source.items()},
        "new_metric": new_metric,
        "fabrication": fabrication,
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    if args.mode == "pipeline":
        mode_label = f"{args.mode} (vlm {args.vlm}, masters {args.masters})"
    elif args.mode == "textlayer":
        mode_label = f"{args.mode} (masters {args.masters})"
    else:
        mode_label = args.mode
    write_results_md(
        mode_label, summary, conflicts, label_count=len(ground_truth),
        by_source=by_source, new_metric=new_metric, fabrication=fabrication
    )
    print(
        f"{args.mode}: overall {summary['overall']['accuracy']:.1%} strict "
        f"/ {new_metric['text']['overall']['accuracy']:.1%} new-metric (text fields) "
        f"across {len(ground_truth)} labels"
    )


if __name__ == "__main__":
    main()
