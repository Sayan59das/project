"""
Regenerates eval/masters.json from the reviewed ground truth.

This is the client's catalogue as it stands today (finetune/reviewed/annotations/*.json):
the distinct brand_name, flavour and claims strings a human reviewer confirmed are really
printed on these 45 labels. In production this would be the client's own Masters tables
(masters.repository.ts) -- a list read at runtime, not hardcoded extraction logic (brief
Section 3). Regenerable and provenance-visible on purpose: re-run this after any ground
truth change rather than hand-editing masters.json.

Usage (from ai_backend/): python eval/build_masters.py
Writes eval/masters.json.
"""
import json
import sys
from pathlib import Path

ANNOTATIONS_DIR = Path(__file__).parent.parent / "finetune" / "reviewed" / "annotations"
OUT_PATH = Path(__file__).parent / "masters.json"


def main():
    if not ANNOTATIONS_DIR.is_dir():
        sys.exit(f"No annotations directory at {ANNOTATIONS_DIR}")

    brands = set()
    flavours = set()
    claims = set()

    for path in sorted(ANNOTATIONS_DIR.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        label = doc.get("label") or {}

        brand = label.get("brand_name")
        if isinstance(brand, str) and brand.strip():
            brands.add(brand.strip())

        flavour = label.get("flavour")
        if isinstance(flavour, str) and flavour.strip():
            flavours.add(flavour.strip())

        for claim in label.get("claims") or []:
            if isinstance(claim, str) and claim.strip():
                claims.add(claim.strip())

    masters = {
        "brands": sorted(brands),
        "flavours": sorted(flavours),
        "claims": sorted(claims),
    }
    OUT_PATH.write_text(json.dumps(masters, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH}: {len(brands)} brands, {len(flavours)} flavours, {len(claims)} claims")


if __name__ == "__main__":
    main()
