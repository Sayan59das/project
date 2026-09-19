"""
The real ceiling of the CPU pipeline -- not a guess, a measurement.

For every cell the last real run got WRONG or MISSING, checks whether the
EXPECTED value is present in text a machine can actually read: the PDF's own
text layer, Tesseract's whole-page OCR, or PP-OCR's strip-based line reader
(the reader recoverDisplayTextCandidates already runs in production and
throws away after keeping 10 lines -- see backend/scripts/dump-readable-text.ts,
which this script reads the output of).

Uses the SAME normalization and match rule the new metric uses --
normalize_value(), normalize_nutrition_key(), _is_fuzzy_match() -- imported
directly from score.py, not reimplemented, so this can never quietly drift
from what actually earns a cell "correct" in a real run.

Usage (from ai_backend/): python eval/ceiling.py [--run pipeline-vlm-off.json]
Reads eval/runs/<run>.json (the run's `details`) and the dumped text at
<READABLE_TEXT_DIR> (env var, or the script's own default scratch path).
Writes its table to stdout; nothing here is a RESULTS.md accuracy row --
per the project's own rule, this is a ceiling, not a claim.
"""
import argparse
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from score import (  # noqa: E402
    LIST_FIELDS,
    normalize,
    normalize_value,
    normalize_nutrition_key,
    _is_fuzzy_match,
    RUNS_DIR,
)

SCALAR_FIELDS_FUZZY_CHECKABLE = {
    "brand_name", "product_name", "flavour", "fssai_number", "marketing_company",
    "address", "customer_care_number", "customer_care_email", "package_size",
    "manufacturing_company",
}

READABLE_TEXT_DIR = Path(
    os.environ.get(
        "READABLE_TEXT_DIR",
        r"C:\Users\sayan\AppData\Local\Temp\claude\F--IM-healthcare-project"
        r"\61772783-b4ab-415c-8f25-cee4c652cd51\scratchpad\readable_text_v2",
    )
)

VISUAL = {"logo", "layout", "colour_theme"}

# The same light, order-preserving cleanup normalize_value() applies before
# its VALUE-specific trailing-strip regexes -- applied here to each haystack
# too, so "12,5" in a value and "12.5" in the OCR dump compare equal, and a
# unit stuck to its number ("125mg") matches one that isn't ("125 mg").
_DECIMAL_COMMA = re.compile(r"(?<=\d),(?=\d)")
_UNIT_NO_SPACE = re.compile(r"(\d)\s*(mcg|\u00b5g|\u03bcg|kcal|mg|iu|g)\b")


def normalize_haystack(text: str) -> str:
    n = " ".join(text.split()).strip().lower()
    n = _DECIMAL_COMMA.sub(".", n)
    n = _UNIT_NO_SPACE.sub(lambda m: f"{m.group(1)} {'mcg' if m.group(2) in ('\u00b5g', '\u03bcg') else m.group(2)}", n)
    return n


def load_sections(path: Path) -> dict:
    """Splits a dump-readable-text.ts output file into its three sections."""
    text = path.read_text(encoding="utf-8", errors="replace")
    sections = {"TEXT_LAYER": "", "OCR": "", "PPOCR": ""}
    parts = re.split(r"===(TEXT_LAYER|OCR|PPOCR)===\n", text)
    for i in range(1, len(parts), 2):
        tag = parts[i]
        sections[tag] = sections.get(tag, "") + parts[i + 1]
    return {k: normalize_haystack(v) for k, v in sections.items()}


def value_present(expected, haystack_norm: str, field: str, is_list_item: bool) -> bool:
    """Mirrors _is_fuzzy_match's containment rule, one-sided: the expected
    value (normalized the same way score.py normalizes a VALUE) must appear
    as a substring of the haystack, with the same >=4-char floor
    _is_fuzzy_match uses to stop a short fragment trivially "matching"
    everywhere. No haystack-wide fuzzy/Levenshtein pass -- OCR text runs to
    thousands of characters per label and a real substring/token check is
    what "is this actually printed here" means; a loose full-text fuzzy
    ratio against a huge haystack would over-credit near-nothing matches."""
    expected_n = normalize_value(field, str(expected), strip_parenthetical=not is_list_item)
    if not expected_n or len(expected_n) < 4:
        return False
    if expected_n in haystack_norm:
        return True
    # Token-set fallback -- LIST ITEMS ONLY (ingredients, claims). A real
    # PP-OCR line reads a nutrition row's "name value %" as one contiguous
    # string (confirmed on real dumps: "Energy 16 kcal <1% <1%"), so a
    # genuine nutrition/scalar value should already hit the substring check
    # above; a token-set fallback there was measured to false-positive on
    # short values ("12 kcal" registered "present" in a haystack containing
    # only "Sodium 12 mg" and "8 kcal totally unrelated" -- neither is a
    # real match). List items are long and multi-word enough (>=3 distinct
    # tokens required here, longer than the risky 2-token case above) that
    # the same failure mode is far less likely, and their real value is
    # recovering an item OCR split across two strips/lines.
    if is_list_item:
        tokens = [t for t in re.split(r"\W+", expected_n) if len(t) >= 3]
        if len(tokens) >= 3 and all(t in haystack_norm for t in tokens):
            return True
    return False


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run", default="pipeline-vlm-off.json")
    args = parser.parse_args()

    run_path = RUNS_DIR / args.run
    if not run_path.is_file():
        sys.exit(f"No run at {run_path} -- run score.py first.")
    with open(run_path, encoding="utf-8") as f:
        run = json.load(f)
    details = run["details"]
    label_count = len(set(d["source_file"] for d in details))

    if not READABLE_TEXT_DIR.is_dir():
        sys.exit(f"No dumped text at {READABLE_TEXT_DIR} -- run dump-readable-text.ts first.")

    cache = {}

    def sections_for(source_file: str):
        if source_file not in cache:
            path = READABLE_TEXT_DIR / f"{source_file}.txt"
            cache[source_file] = load_sections(path) if path.is_file() else None
        return cache[source_file]

    # field -> {gap, text_layer, tesseract, ppocr, any, none}
    stat = defaultdict(lambda: defaultdict(int))
    # field -> source_file -> {gap, any}  (for the whole-field-missing bucketing)
    per_label = defaultdict(lambda: defaultdict(lambda: {"gap": 0, "any": 0}))
    missing_dumps = set()

    for d in details:
        field = d["field"]
        if field in VISUAL:
            continue
        if d["verdict"] not in ("wrong", "missing"):
            continue
        expected = d.get("expected")
        if expected in (None, "", "(none)") or (isinstance(expected, (list, dict)) and not expected):
            continue

        # A strict-wrong/missing cell that is ALREADY fuzzy-correct (the
        # predicted value is close enough to pass score_field_fuzzy's own
        # check) must not also be counted as part of the recoverable gap --
        # it already contributes to current_correct below, and double
        # counting it would inflate the ceiling. Only exact for SCALAR
        # fields, where "predicted" and "expected" are one value each, the
        # same shape score_field_fuzzy compares; list/table fields do
        # cross-item bipartite fuzzy matching this script does not
        # replicate, so their gap stays the strict one (see the report's
        # own caveat below).
        if field in SCALAR_FIELDS_FUZZY_CHECKABLE and d["verdict"] == "wrong":
            predicted_n = normalize_value(field, d.get("predicted"))
            expected_n = normalize_value(field, expected)
            if _is_fuzzy_match(predicted_n, expected_n):
                continue  # already fuzzy-correct; not part of the gap at all

        source_file = d["source_file"]
        s = sections_for(source_file)
        row = stat[field]
        row["gap"] += 1
        per_label[field][source_file]["gap"] += 1

        if s is None:
            missing_dumps.add(source_file)
            continue

        is_list_item = field in LIST_FIELDS
        found_any = False
        for section_name, cache_key in (("TEXT_LAYER", "text_layer"), ("OCR", "tesseract"), ("PPOCR", "ppocr")):
            if value_present(expected, s[section_name], field, is_list_item):
                row[cache_key] += 1
                found_any = True
        if found_any:
            row["any"] += 1
            per_label[field][source_file]["any"] += 1
        else:
            row["none"] += 1

    if missing_dumps:
        print(f"!! no dumped text for {len(missing_dumps)} label(s) (excluded from the ceiling):")
        for m in sorted(missing_dumps):
            print("   ", m)
        print()

    rows = sorted(stat.items(), key=lambda kv: -kv[1]["gap"])
    totals = defaultdict(int)
    print(f"Ceiling check -- run: {args.run} ({label_count} labels), text dumped from: {READABLE_TEXT_DIR.name}")
    print()
    print(f"{'field':<24}{'gap':>6}{'text-layer':>12}{'tesseract':>11}{'ppocr':>8}{'any':>6}{'none':>6}{'any%':>7}")
    print("-" * 80)
    for field, row in rows:
        for k in ("gap", "text_layer", "tesseract", "ppocr", "any", "none"):
            totals[k] += row[k]
        pct = (100.0 * row["any"] / row["gap"]) if row["gap"] else 0.0
        print(
            f"{field:<24}{row['gap']:>6}{row['text_layer']:>12}{row['tesseract']:>11}"
            f"{row['ppocr']:>8}{row['any']:>6}{row['none']:>6}{pct:>6.1f}%"
        )
    print("-" * 80)
    pct = (100.0 * totals['any'] / totals['gap']) if totals['gap'] else 0.0
    print(
        f"{'TOTAL':<24}{totals['gap']:>6}{totals['text_layer']:>12}{totals['tesseract']:>11}"
        f"{totals['ppocr']:>8}{totals['any']:>6}{totals['none']:>6}{pct:>6.1f}%"
    )

    # Fuzzy ceiling: current correct_fuzzy count + every gap cell where the
    # expected value is present in SOME reader, over the same denominator
    # the new-metric fuzzy row uses.
    overall = run.get("new_metric", {}).get("text", {}).get("overall", {})
    current_correct = overall.get("correct_fuzzy", 0)
    current_total = overall.get("total", 0)
    if current_total:
        current_pct = 100.0 * current_correct / current_total
        ceiling_correct = current_correct + totals["any"]
        ceiling_pct = 100.0 * ceiling_correct / current_total
        print()
        print(
            f"Current fuzzy (new metric, text fields): {current_correct}/{current_total} = {current_pct:.1f}%"
        )
        print(
            f"CEILING if every present-in-any-reader cell were recovered: "
            f"{ceiling_correct}/{current_total} = {ceiling_pct:.1f}%"
        )
        print(
            "  (exact for the 9 scalar fields -- cells already fuzzy-correct despite a strict\n"
            "  'wrong' verdict are excluded from the gap so they are not double-counted.\n"
            "  claims/ingredients/nutrition_table use the STRICT gap unadjusted, since their\n"
            "  fuzzy match is cross-item bipartite matching this script does not replicate --\n"
            "  their true ceiling is very slightly LOWER than shown here, not higher.)"
        )
    else:
        print("\n(no new_metric block in this run file -- current/ceiling fuzzy % not computed)")

    # Whole-field-missing vs partial, for the three list/table fields.
    print()
    print("Whole-field-missing labels (entire field came back empty on that label):")
    for field in ("nutrition_table", "ingredients", "claims"):
        if field not in per_label:
            continue
        whole = [sf for sf, v in per_label[field].items() if v["gap"] >= 3 and v["any"] == 0]
        partial = [sf for sf, v in per_label[field].items() if v["gap"] >= 3 and 0 < v["any"] < v["gap"]]
        print(f"  {field}: {len(whole)} whole-missing, {len(partial)} partial-missing (of labels with >=3 gap cells)")
        for sf in sorted(whole):
            print(f"      {sf}")


if __name__ == "__main__":
    main()
