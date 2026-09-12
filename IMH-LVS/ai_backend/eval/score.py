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
    python eval/score.py --mode ai          # today's one-shot Qwen2-VL-2B pipeline
    python eval/score.py --mode textlayer   # Phase C's PDF-text-layer extraction
    python eval/score.py --mode pipeline    # the full new pipeline (Phase C+D+E)
textlayer/pipeline are wired into the CLI now but raise a clear error until
those phases exist — see run_textlayer_mode/run_pipeline_mode below.

Run from ai_backend/: `python eval/score.py --mode ai`

Environment variables:
    EVAL_LABEL_PDF_DIR      Directory containing source PDF files for textlayer mode
                            (default: ai_backend/finetune/source_labels)
"""
import argparse
import json
import os
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parent
AI_BACKEND_DIR = EVAL_DIR.parent
ANNOTATIONS_DIR = AI_BACKEND_DIR / "finetune" / "reviewed" / "annotations"
IMAGES_DIR = AI_BACKEND_DIR / "finetune" / "images"
RESULTS_MD = EVAL_DIR / "RESULTS.md"
RUNS_DIR = EVAL_DIR / "runs"

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
    Returns (field_results, conflicts_seen) for aggregate()."""
    field_results = []
    all_conflicts = []
    for source_file, (expected, _pages, conflicts) in ground_truth.items():
        if conflicts:
            all_conflicts.append((source_file, conflicts))
        predicted = predictions_by_source.get(source_file, {})
        field_results.append({field: score_field(field, predicted.get(field), expected.get(field)) for field in FIELDS})
    return field_results, all_conflicts


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


def run_textlayer_mode():
    """Runs the text-layer-only extraction pipeline (Node CLI via
    backend/scripts/extract-textlayer.ts) over every ground-truth label's PDF,
    merging predictions per sourceFile the same way merge_label_pages()
    combines ground truth, so the comparison is apples-to-apples.

    PDFs are read from EVAL_LABEL_PDF_DIR, which defaults to ai_backend's
    finetune/source_labels directory but can be overridden via the
    EVAL_LABEL_PDF_DIR environment variable. The CLI is invoked ONCE with
    all available PDFs and returns a JSON array of extraction results."""
    ground_truth = load_ground_truth()

    # Determine PDF directory from environment or default.
    label_pdf_dir = Path(os.environ.get("EVAL_LABEL_PDF_DIR", AI_BACKEND_DIR / "finetune" / "source_labels"))

    # Collect PDFs that exist for labels in ground truth.
    pdf_paths = []
    for source_file in ground_truth.keys():
        pdf_path = label_pdf_dir / source_file
        if pdf_path.is_file():
            pdf_paths.append(pdf_path)
        else:
            print(f"  WARNING: no PDF for {source_file}, skipping", file=sys.stderr)

    if not pdf_paths:
        raise SystemExit(f"No PDFs found in {label_pdf_dir} — please check the directory exists and contains PDFs")

    # Run the Node CLI subprocess to extract text layer data.
    # Derive backend directory from ai_backend's parent.
    backend_dir = AI_BACKEND_DIR.parent / "backend"
    cmd = ["node", "-r", "tsx/cjs", "scripts/extract-textlayer.ts", *[str(p) for p in pdf_paths]]

    try:
        result = subprocess.run(cmd, cwd=backend_dir, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as e:
        raise SystemExit(f"Text layer extraction failed: {e.stderr}")

    # Parse the JSON array and build predictions by source file.
    try:
        records = json.loads(result.stdout)
    except json.JSONDecodeError as e:
        raise SystemExit(f"Failed to parse extraction output as JSON: {e}")

    predictions_by_source = {}
    for record in records:
        # Pop source_file since it's a key, not a field in the prediction dict.
        source_file = record.pop("source_file")

        # Normalize nutrition_table to empty dict when null (so score_field sees a dict).
        if record.get("nutrition_table") is None:
            record["nutrition_table"] = {}

        predictions_by_source[source_file] = record

    return predictions_by_source, ground_truth


def run_pipeline_mode():
    raise NotImplementedError(
        "pipeline mode needs Phases C, D and E of the extraction rebuild plan "
        "(see README.md) — not built yet."
    )


def _git_sha():
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=AI_BACKEND_DIR, text=True).strip()
    except Exception:
        return "unknown"


def write_results_md(mode, summary, conflicts, label_count):
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
        f"\n## {date} — mode `{mode}` — {sha}\n",
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
    args = parser.parse_args()

    if args.mode == "ai":
        predictions_by_source, ground_truth = run_ai_mode()
    elif args.mode == "textlayer":
        predictions_by_source, ground_truth = run_textlayer_mode()
    else:
        predictions_by_source, ground_truth = run_pipeline_mode()

    field_results, conflicts = score_labels(predictions_by_source, ground_truth)
    summary = aggregate(field_results)

    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    run_path = RUNS_DIR / f"{args.mode}.json"
    run_path.write_text(json.dumps({
        "mode": args.mode,
        "summary": summary,
        "conflicts": conflicts,
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    write_results_md(args.mode, summary, conflicts, label_count=len(ground_truth))
    print(f"{args.mode}: overall {summary['overall']['accuracy']:.1%} across {len(ground_truth)} labels")


if __name__ == "__main__":
    main()
