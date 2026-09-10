"""
Step 3 of the fine-tuning pipeline: turn the human-verified annotations into
the (image, prompt, target JSON) triples the trainer consumes.

The prompt is IMPORTED from the production extraction service rather than
copied here — the adapter is trained to answer that exact wording, so a
divergent copy would silently cost accuracy at inference time.

Targets are serialised with the field order the prompt asks for, not
Python dict order, so the model learns one stable output shape instead of
having to infer which key comes next from 44 inconsistent examples.

Run from the ai_backend directory:
    python finetune/build_training_set.py
"""
import json
import random
import re
from pathlib import Path

from app.services.extraction import EXTRACTION_PROMPT, LABEL_FIELDS

BASE = Path(__file__).resolve().parent
REVIEWED = BASE / "reviewed" / "annotations"
IMAGES = BASE / "images"
OUT = BASE / "dataset"

# The order the prompt lists the fields in — imported rather than copied for
# the same reason as EXTRACTION_PROMPT above: extraction.py's completeness
# check (which fields a response omitted entirely) and this file's target
# key order must agree on one canonical field list, not two that can drift.
FIELD_ORDER = LABEL_FIELDS


def _norm(value) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def _signals(label: dict) -> list[tuple]:
    """The (brand, product) and (brand, product, fssai) pairs a page's own
    label offers as evidence of which real-world product it belongs to.
    Both are returned (when non-empty) rather than just the fuller one,
    because two pages of the SAME source file can each have only PART of
    the identity legible — confirmed on MHJ Lutein Domestic's own two
    pages: page 1 reads brand+product but not the FSSAI (on the back
    panel), page 2 reads only the FSSAI. Neither page's full triple matches
    the other's, so grouping strictly on the triple would treat them as
    unrelated; the shared (brand, product) pair is what actually connects
    them."""
    brand, product, fssai = _norm(label.get("brand_name")), _norm(label.get("product_name")), _norm(label.get("fssai_number"))
    out = []
    if brand and product:
        out.append(("bp", brand, product))
        if fssai:
            out.append(("bpf", brand, product, fssai))
    return out


class UnionFind:
    """Merges source files into product families: two files land in the
    same family the moment ANY page of either shares an identity signal
    with ANY page of the other — transitively, so if A matches B and B
    matches C, all three end up one family even though A and C might never
    share a signal directly."""

    def __init__(self):
        self.parent: dict = {}

    def find(self, item):
        self.parent.setdefault(item, item)
        while self.parent[item] != item:
            self.parent[item] = self.parent[self.parent[item]]
            item = self.parent[item]
        return item

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


def group_records_by_product(records: list[dict]) -> dict:
    """Returns {source_file: family_root}. See UnionFind and _signals above
    for the mechanics; this is the "why per FILE, not per page" half: a
    file's OWN pages always belong together (a die-line's blank cap-base
    face has no signal of its own but is still that die-line's page), and
    two DIFFERENT files land in the same family only via a shared signal —
    which is exactly the cross-file leakage this replaces a hardcoded
    filename list for (see module docstring below main() for the concrete
    failures this caught: Sleeprio, Calrio and HSN each arrived as two
    differently-named files of the same product, and one of the four
    fine-tuning batches — Cal. Vit D IRN120-1..4 — is one product revised
    across four files)."""
    uf = UnionFind()
    signal_owner: dict = {}
    for record in records:
        uf.find(record["source_file"])
        for signal in _signals(record["label"]):
            if signal in signal_owner:
                uf.union(record["source_file"], signal_owner[signal])
            else:
                signal_owner[signal] = record["source_file"]
    return {source_file: uf.find(source_file) for source_file in {r["source_file"] for r in records}}


# Source files whose product family is held out for validation — naming one
# file from a family is enough; group_records_by_product() above pulls in
# every other file of the same real product automatically, under any name
# (a colour proof, a die-line, a dated printer's proof, a numbered revision
# series), which a plain per-file list could not do (see its docstring for
# the leakage this fixed). Deliberately curated, not automatic: two families
# established before the "New Data" batch (does training still fit known
# products) and two from the new batch (does it generalise to genuinely
# unseen products — Immunogum is this dataset's first non-English label).
VALIDATION_SOURCE_FILES = {
    "Calrio IRN159-1.pdf",
    "HSN VF IRN75-1.pdf",
    "Sleeprio IRN157-1.pdf",
    "MHJ Lutein Domestic IRN165-1.pdf",
    "Immunogum 4S IRN131-1.pdf",
    "Iron IRN121-1.pdf",
}


def canonical_target(label: dict) -> str:
    """The label as the model should emit it: prompt field order, empty
    strings normalised to null (the schema's own 'not present' value, so the
    model isn't taught two different ways to say 'absent'), and no ASCII
    escaping so Indian addresses and ° / ® characters train as themselves."""
    ordered = {}
    for key in FIELD_ORDER:
        value = label.get(key)
        if isinstance(value, str) and not value.strip():
            value = None
        if isinstance(value, (list, dict)) and len(value) == 0:
            value = None
        ordered[key] = value
    return json.dumps(ordered, ensure_ascii=False, indent=2)


def main() -> None:
    records = []
    for path in sorted(REVIEWED.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        data = doc.get("data", doc)
        if not data.get("reviewed"):
            print(f"  skipping {path.stem} — not marked reviewed")
            continue

        image_path = IMAGES / f"{path.stem}.png"
        if not image_path.is_file():
            raise SystemExit(f"No page image for {path.stem} at {image_path}")

        records.append({
            "slug": path.stem,
            "source_file": data["sourceFile"],
            "label": data["label"],
            "image": str(image_path),
            "prompt": EXTRACTION_PROMPT,
            "target": canonical_target(data["label"]),
        })

    family_of = group_records_by_product(records)
    val_roots = {family_of[f] for f in VALIDATION_SOURCE_FILES if f in family_of}
    missing = VALIDATION_SOURCE_FILES - set(family_of)
    if missing:
        raise SystemExit(f"VALIDATION_SOURCE_FILES names a file with no reviewed page: {sorted(missing)}")

    for record in records:
        record.pop("label")  # only needed for grouping above, not the trained-on record

    train = [r for r in records if family_of[r["source_file"]] not in val_roots]
    val = [r for r in records if family_of[r["source_file"]] in val_roots]

    # Which actual files ended up in validation, printed by family, so a new
    # VALIDATION_SOURCE_FILES entry that silently pulled in an unintended
    # sibling (or one that unexpectedly pulled in nothing extra) is visible
    # immediately rather than discovered later as a training-set surprise.
    val_files_by_root: dict = {}
    for record in val:
        val_files_by_root.setdefault(family_of[record["source_file"]], set()).add(record["source_file"])
    print("Validation families (by shared brand/product/FSSAI, not filename):")
    for files in val_files_by_root.values():
        print(f"  {sorted(files)}")

    random.Random(0).shuffle(train)

    OUT.mkdir(parents=True, exist_ok=True)
    for name, rows in (("train", train), ("val", val)):
        out_path = OUT / f"{name}.jsonl"
        with out_path.open("w", encoding="utf-8") as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(f"{name}: {len(rows)} examples -> {out_path}")


if __name__ == "__main__":
    main()
