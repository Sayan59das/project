"""
Step 5: does the fine-tune actually extract better?

Validation loss falling is necessary but not sufficient — it says the model
assigns higher probability to the right tokens, not that the service returns
better field values. This measures the thing the company actually cares
about: how many of the 16 fields come back correct on pages the model has
never seen.

Runs through ExtractionService itself rather than calling the model directly,
so the JSON repair, the FSSAI/logo/colour validators and the schema coercion
are all in the path exactly as they are in production.

Takes one argument so base and tuned can be measured in separate processes —
two 2B models do not fit on this card at once:
    python finetune/evaluate_adapter.py base
    python finetune/evaluate_adapter.py tuned
"""
import json
import os
import sys
from pathlib import Path

from PIL import Image

BASE = Path(__file__).resolve().parent
VAL = BASE / "dataset" / "val.jsonl"
# Same env var and same reasoning as train_lora.py's ADAPTER_OUT: unset
# locally (unchanged default), but lets `tuned` mode check an adapter
# trained elsewhere — e.g. the 7B Colab run, which saves to a Drive path,
# not this local folder.
ADAPTER = Path(os.environ.get("FINETUNE_ADAPTER_OUT", str(BASE / "adapters" / "label-extraction-lora")))
RESULTS = BASE / "eval"

FIELDS = [
    "brand_name", "product_name", "colour_theme", "flavour", "claims", "logo",
    "layout", "nutrition_table", "fssai_number", "ingredients",
    "marketing_company", "address", "customer_care_number",
    "customer_care_email", "package_size", "manufacturing_company",
]

# Fields whose value is a single fact with one correct spelling — a company
# name or a licence number is either the printed one or it is wrong. Scored
# exact (case- and whitespace-insensitive).
EXACT_FIELDS = {
    "brand_name", "product_name", "flavour", "fssai_number",
    "marketing_company", "customer_care_number", "customer_care_email",
    "package_size", "manufacturing_company",
}


def normalise(value):
    if value is None:
        return None
    if isinstance(value, str):
        return " ".join(value.split()).strip().lower() or None
    return value


def score_field(field, predicted, expected):
    """Returns (credit, possible). Free-text and collection fields are scored
    by overlap rather than exact string equality: two equally correct readings
    of an ingredient list can order or punctuate items differently, and
    grading those as total failures would understate both models equally but
    hide the difference between them."""
    predicted, expected = normalise(predicted), normalise(expected)

    if expected is None:
        # Correctly leaving a field blank is a real skill here — over half of
        # these pages are proofs where most fields genuinely aren't printed,
        # and the base model's habit was to invent something.
        return (1.0, 1.0) if predicted is None else (0.0, 1.0)
    if predicted is None:
        return (0.0, 1.0)

    if field in EXACT_FIELDS:
        return (1.0 if predicted == expected else 0.0, 1.0)

    if isinstance(expected, list):
        want = {normalise(str(item)) for item in expected}
        got = {normalise(str(item)) for item in (predicted if isinstance(predicted, list) else [predicted])}
        return (len(want & got) / len(want), 1.0) if want else (1.0, 1.0)

    if isinstance(expected, dict):
        want = {normalise(str(k)) for k in expected}
        got = {normalise(str(k)) for k in (predicted if isinstance(predicted, dict) else {})}
        return (len(want & got) / len(want), 1.0) if want else (1.0, 1.0)

    # Remaining free text (logo, layout, address): credit substring containment
    # in either direction, so a shorter-but-correct description still counts.
    return (1.0 if (predicted in expected or expected in predicted) else 0.0, 1.0)


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else "base"
    if mode == "tuned":
        os.environ["LABEL_LORA_ADAPTER"] = str(ADAPTER)
    else:
        os.environ.pop("LABEL_LORA_ADAPTER", None)

    from app.services.extraction import ExtractionService

    rows = [json.loads(line) for line in VAL.read_text(encoding="utf-8").splitlines() if line.strip()]
    service = ExtractionService(use_mock=False)

    per_field = {field: [0.0, 0.0] for field in FIELDS}
    blank_results = 0
    records = []

    for row in rows:
        expected = json.loads(row["target"])
        predicted = service.extract_from_image(Image.open(row["image"]).convert("RGB")).model_dump()

        # An all-null return is the failure mode the drafts kept hitting: the
        # model produced something unparseable and the service fell back to
        # empty. Counted separately because it is qualitatively different from
        # getting individual fields wrong.
        if all(predicted.get(field) in (None, [], {}) for field in FIELDS):
            blank_results += 1

        page_credit = 0.0
        for field in FIELDS:
            credit, possible = score_field(field, predicted.get(field), expected.get(field))
            per_field[field][0] += credit
            per_field[field][1] += possible
            page_credit += credit

        records.append({"slug": Path(row["image"]).stem, "score": round(page_credit / len(FIELDS), 3),
                        "predicted": predicted})
        print(f"  {Path(row['image']).stem}: {page_credit/len(FIELDS):.1%}", flush=True)

    total_credit = sum(v[0] for v in per_field.values())
    total_possible = sum(v[1] for v in per_field.values())

    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / f"{mode}.json").write_text(json.dumps({
        "mode": mode,
        "pages": len(rows),
        "overall": total_credit / total_possible,
        "blank_results": blank_results,
        "per_field": {f: (v[0] / v[1] if v[1] else None) for f, v in per_field.items()},
        "records": records,
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n{mode}: overall {total_credit/total_possible:.1%} across {len(rows)} pages, "
          f"{blank_results} all-null results")


if __name__ == "__main__":
    main()
