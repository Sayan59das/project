"""
eval/diff.py — see exactly what a scored run got right/wrong/missing for
one field, instead of just its tally. score.py's summary alone can say
"42 wrong product names"; this shows WHICH 42, predicted vs expected, one
label per line, grouped by verdict — the tool that has to exist before
touching the extractor, per Step 1 of the accuracy-improvement plan.

Reads eval/runs/<mode>.json, written by `score.py --mode <mode>` — run that
first. Requires a run written after score_labels() started keeping
per-item detail (score.py's own "details" key); an older run file needs
re-running.

Usage:
    python eval/diff.py --mode pipeline --field product_name
"""
import argparse
import json
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parent
RUNS_DIR = EVAL_DIR / "runs"


def load_details(mode, field):
    run_path = RUNS_DIR / f"{mode}.json"
    if not run_path.is_file():
        raise SystemExit(f"No run found at {run_path} — run `python eval/score.py --mode {mode}` first.")
    data = json.loads(run_path.read_text(encoding="utf-8"))
    if "details" not in data:
        raise SystemExit(
            f"{run_path} has no per-item detail — it predates that feature. "
            f"Re-run `python eval/score.py --mode {mode}`."
        )
    return [d for d in data["details"] if d["field"] == field]


def format_row(row):
    predicted = row["predicted"] if row["predicted"] is not None else "—"
    expected = row["expected"] if row["expected"] is not None else "—"
    label = row.get("source_file", row.get("item", "?"))
    return f"  {label}: predicted={predicted!r}  expected={expected!r}"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mode", choices=["ai", "textlayer", "pipeline"], required=True)
    parser.add_argument("--field", required=True)
    args = parser.parse_args(argv)

    rows = load_details(args.mode, args.field)
    if not rows:
        print(f"No rows found for field {args.field!r} in {args.mode!r} mode — check the field name.")
        return

    # Worst first: a reviewer's attention belongs on WRONG (a confident
    # mistake) before MISSING (an honest blank), and both before CORRECT
    # (included so the count context isn't lost, not because it needs
    # reading row by row).
    for verdict in ["wrong", "missing", "correct"]:
        matching = [r for r in rows if r["verdict"] == verdict]
        if not matching:
            continue
        print(f"\n=== {verdict.upper()} ({len(matching)}) ===")
        for row in matching:
            print(format_row(row))


if __name__ == "__main__":
    main()
