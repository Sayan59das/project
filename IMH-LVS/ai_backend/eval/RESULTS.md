# Extraction accuracy — RESULTS

The only source of truth for extraction accuracy numbers on this project. Every row here was written by `eval/score.py`; if a number isn't here, it isn't verified — don't quote it.

## Field definitions (human-decided, 2026-09-15 — Step 4.1)

These answers were given directly by the client and settle what "correct" means
for two fields that were ambiguous on labels like
`AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` (see the ground-truth conflict logged
below, from 2026-09-11). Annotations and extraction work on these two fields
should follow this definition from here on.

- **product_name** = the brand wordmark (e.g. "AM7", "ChewNectar", "Nutrinol"),
  **not** the descriptive line underneath it (e.g. "Eye Multivitamin Gummies
  for Kids & Adults"). Client's own words: "am7 is the brand name and eye
  multivitamin is the discription about the product."
- **brand_name** = whichever text is printed **biggest / most prominent** on
  the front of the label — not necessarily the legal/marketing company's
  registered brand mark, if a different word is visually dominant.

Also decided (Step 1.2, `STEP1_FAILURE_ANALYSIS.md`):

- **claims**: where the extractor returns a real, plausible claim string
  (e.g. "Health Supplement", "Gluten Free") and ground truth currently says
  blank, the ground truth is treated as incomplete, not the extraction as
  wrong. These should be added to ground truth during the Step 4.2 human
  review pass, not coded around in the extractor.

## 2026-09-11 18:33 UTC — mode `ai` — a920a6c

**45 labels, 2348 fields scored.** Overall accuracy: **13.7%** (322 correct / 781 wrong / 1245 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 24 | 16 | 5 | 53.3% |
| product_name | 19 | 25 | 1 | 42.2% |
| colour_theme | 23 | 34 | 64 | 19.0% |
| flavour | 21 | 22 | 2 | 46.7% |
| claims | 36 | 45 | 315 | 9.1% |
| logo | 13 | 9 | 23 | 28.9% |
| layout | 2 | 35 | 8 | 4.4% |
| nutrition_table | 31 | 300 | 274 | 5.1% |
| fssai_number | 8 | 10 | 27 | 17.8% |
| ingredients | 73 | 153 | 460 | 10.6% |
| marketing_company | 7 | 22 | 16 | 15.6% |
| address | 4 | 36 | 5 | 8.9% |
| customer_care_number | 19 | 16 | 10 | 42.2% |
| customer_care_email | 11 | 20 | 14 | 24.4% |
| package_size | 23 | 20 | 2 | 51.1% |
| manufacturing_company | 8 | 18 | 19 | 17.8% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — product_name: ['Eye Multivitamin Gummies for Kids & Adults', 'AM7 Gummies']
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-15 04:31 UTC — mode `textlayer` — 94fda2a

**45 labels, 2187 fields scored.** Overall accuracy: **21.9%** (478 correct / 446 wrong / 1263 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 0 | 21 | 24 | 0.0% |
| product_name | 0 | 22 | 23 | 0.0% |
| colour_theme | 0 | 0 | 87 | 0.0% |
| flavour | 17 | 15 | 13 | 37.8% |
| claims | 16 | 17 | 335 | 4.3% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 112 | 194 | 226 | 21.1% |
| fssai_number | 25 | 2 | 18 | 55.6% |
| ingredients | 192 | 127 | 341 | 29.1% |
| marketing_company | 11 | 8 | 26 | 24.4% |
| address | 5 | 14 | 26 | 11.1% |
| customer_care_number | 18 | 2 | 25 | 40.0% |
| customer_care_email | 22 | 0 | 23 | 48.9% |
| package_size | 1 | 23 | 21 | 2.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — product_name: ['Eye Multivitamin Gummies for Kids & Adults', 'AM7 Gummies']
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-15 05:50 UTC — mode `pipeline` — 1e899f6

**45 labels, 2273 fields scored.** Overall accuracy: **25.5%** (580 correct / 613 wrong / 1080 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 10 | 27 | 8 | 22.2% |
| product_name | 0 | 42 | 3 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 20 | 21 | 4 | 44.4% |
| claims | 24 | 32 | 327 | 6.3% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 112 | 194 | 226 | 21.1% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 217 | 170 | 316 | 30.9% |
| marketing_company | 12 | 18 | 15 | 26.7% |
| address | 8 | 21 | 16 | 17.8% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 1 | 40 | 4 | 2.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — product_name: ['Eye Multivitamin Gummies for Kids & Adults', 'AM7 Gummies']
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-15 09:40 UTC — mode `textlayer` — 8377e1e

**45 labels, 2187 fields scored.** Overall accuracy: **21.9%** (478 correct / 446 wrong / 1263 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 0 | 21 | 24 | 0.0% |
| product_name | 0 | 22 | 23 | 0.0% |
| colour_theme | 0 | 0 | 87 | 0.0% |
| flavour | 17 | 15 | 13 | 37.8% |
| claims | 16 | 17 | 335 | 4.3% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 112 | 194 | 226 | 21.1% |
| fssai_number | 25 | 2 | 18 | 55.6% |
| ingredients | 192 | 127 | 341 | 29.1% |
| marketing_company | 11 | 8 | 26 | 24.4% |
| address | 5 | 14 | 26 | 11.1% |
| customer_care_number | 18 | 2 | 25 | 40.0% |
| customer_care_email | 22 | 0 | 23 | 48.9% |
| package_size | 1 | 23 | 21 | 2.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — product_name: ['Eye Multivitamin Gummies for Kids & Adults', 'AM7 Gummies']
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-15 09:57 UTC — mode `pipeline` — 71d7154

**45 labels, 2273 fields scored.** Overall accuracy: **25.5%** (580 correct / 613 wrong / 1080 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 10 | 27 | 8 | 22.2% |
| product_name | 0 | 42 | 3 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 20 | 21 | 4 | 44.4% |
| claims | 24 | 32 | 327 | 6.3% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 112 | 194 | 226 | 21.1% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 217 | 170 | 316 | 30.9% |
| marketing_company | 12 | 18 | 15 | 26.7% |
| address | 8 | 21 | 16 | 17.8% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 1 | 40 | 4 | 2.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — product_name: ['Eye Multivitamin Gummies for Kids & Adults', 'AM7 Gummies']
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-15 16:33 UTC — mode `pipeline (vlm off)` — 9738c34

**45 labels, 2273 fields scored.** Overall accuracy: **25.1%** (570 correct / 604 wrong / 1099 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 0 | 26 | 19 | 0.0% |
| product_name | 0 | 34 | 11 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 20 | 21 | 4 | 44.4% |
| claims | 24 | 32 | 327 | 6.3% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 112 | 194 | 226 | 21.1% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 217 | 170 | 316 | 30.9% |
| marketing_company | 12 | 18 | 15 | 26.7% |
| address | 8 | 21 | 16 | 17.8% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 1 | 40 | 4 | 2.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 3 | 6 | 33.3% |
| address | text-layer-flattened | 4 | 14 | 22.2% |
| brand_name | tesseract-full-page | 0 | 5 | 0.0% |
| brand_name | text-layer-flattened | 0 | 17 | 0.0% |
| brand_name | text-layer-reading-order | 0 | 4 | 0.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 5 | 6 | 45.5% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 10 | 8 | 55.6% |
| package_size | package-size-ocr | 0 | 2 | 0.0% |
| package_size | tesseract-full-page | 0 | 15 | 0.0% |
| package_size | text-layer-flattened | 0 | 23 | 0.0% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 22 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — product_name: ['Eye Multivitamin Gummies for Kids & Adults', 'AM7 Gummies']
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-15 16:50 UTC — mode `pipeline (vlm on)` — 9738c34

**45 labels, 2273 fields scored.** Overall accuracy: **25.1%** (570 correct / 604 wrong / 1099 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 0 | 26 | 19 | 0.0% |
| product_name | 0 | 34 | 11 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 20 | 21 | 4 | 44.4% |
| claims | 24 | 32 | 327 | 6.3% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 112 | 194 | 226 | 21.1% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 217 | 170 | 316 | 30.9% |
| marketing_company | 12 | 18 | 15 | 26.7% |
| address | 8 | 21 | 16 | 17.8% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 1 | 40 | 4 | 2.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 3 | 6 | 33.3% |
| address | text-layer-flattened | 4 | 14 | 22.2% |
| brand_name | tesseract-full-page | 0 | 5 | 0.0% |
| brand_name | text-layer-flattened | 0 | 17 | 0.0% |
| brand_name | text-layer-reading-order | 0 | 4 | 0.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 5 | 6 | 45.5% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 10 | 8 | 55.6% |
| package_size | package-size-ocr | 0 | 2 | 0.0% |
| package_size | tesseract-full-page | 0 | 15 | 0.0% |
| package_size | text-layer-flattened | 0 | 23 | 0.0% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 22 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — product_name: ['Eye Multivitamin Gummies for Kids & Adults', 'AM7 Gummies']
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

**Correction, 2026-09-15 ~17:00 UTC**: the row immediately above ("mode `pipeline (vlm on)` — 9738c34", 25.1%) is mislabeled and must not be quoted as the VLM-on number. `OLLAMA_URL` was not actually set in the shell that invoked `--vlm on` (an operational mistake, not a code bug — `score.py --vlm on` correctly does nothing but inherit whatever's in the ambient environment, and the ambient environment here had no `OLLAMA_URL` at all), so the VLM role-resolution step never ran. This is visible directly in that row's own "Accuracy by source" table: every entry is `text-layer-flattened`, `text-layer-reading-order`, `tesseract-*`, or `package-size-ocr` — zero `vlm-role-resolution` or `vlm-fallback` entries — which is exactly how a genuine `--vlm off` run looks, and is why this row's number (25.1%) matches the real `--vlm off` row above it almost exactly. Left in place rather than deleted, per the "never delete or edit a row" rule; the real vlm-on row, with `OLLAMA_URL` actually set this time, follows below.

## 2026-09-15 17:08 UTC — mode `pipeline (vlm on)` — 9738c34

**45 labels, 2273 fields scored.** Overall accuracy: **25.5%** (580 correct / 613 wrong / 1080 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 10 | 27 | 8 | 22.2% |
| product_name | 0 | 42 | 3 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 20 | 21 | 4 | 44.4% |
| claims | 24 | 32 | 327 | 6.3% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 112 | 194 | 226 | 21.1% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 217 | 170 | 316 | 30.9% |
| marketing_company | 12 | 18 | 15 | 26.7% |
| address | 8 | 21 | 16 | 17.8% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 1 | 40 | 4 | 2.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 3 | 6 | 33.3% |
| address | text-layer-flattened | 4 | 14 | 22.2% |
| brand_name | tesseract-full-page | 0 | 5 | 0.0% |
| brand_name | text-layer-flattened | 0 | 17 | 0.0% |
| brand_name | text-layer-reading-order | 0 | 4 | 0.0% |
| brand_name | vlm-role-resolution | 10 | 1 | 90.9% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 5 | 6 | 45.5% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 10 | 8 | 55.6% |
| package_size | package-size-ocr | 0 | 2 | 0.0% |
| package_size | tesseract-full-page | 0 | 15 | 0.0% |
| package_size | text-layer-flattened | 0 | 23 | 0.0% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 22 | 0.0% |
| product_name | vlm-role-resolution | 0 | 8 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — product_name: ['Eye Multivitamin Gummies for Kids & Adults', 'AM7 Gummies']
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-15 17:57 UTC — mode `pipeline (vlm off)` — 21a5b4f

**45 labels, 2273 fields scored.** Overall accuracy: **25.1%** (570 correct / 604 wrong / 1099 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 0 | 26 | 19 | 0.0% |
| product_name | 0 | 34 | 11 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 20 | 21 | 4 | 44.4% |
| claims | 24 | 32 | 327 | 6.3% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 112 | 194 | 226 | 21.1% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 217 | 170 | 316 | 30.9% |
| marketing_company | 12 | 18 | 15 | 26.7% |
| address | 8 | 21 | 16 | 17.8% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 1 | 40 | 4 | 2.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 3 | 6 | 33.3% |
| address | text-layer-flattened | 4 | 14 | 22.2% |
| brand_name | tesseract-full-page | 0 | 5 | 0.0% |
| brand_name | text-layer-flattened | 0 | 17 | 0.0% |
| brand_name | text-layer-reading-order | 0 | 4 | 0.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 5 | 6 | 45.5% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 10 | 8 | 55.6% |
| package_size | package-size-ocr | 0 | 2 | 0.0% |
| package_size | tesseract-full-page | 0 | 15 | 0.0% |
| package_size | text-layer-flattened | 0 | 23 | 0.0% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 22 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **38.9%** (fuzzy/normalized — the 80% target) / 26.6% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 0 | 0 | 26 | 19 | 0.0% |
| product_name | 0 | 4 | 30 | 11 | 8.9% |
| flavour | 20 | 27 | 14 | 4 | 60.0% |
| claims | 24 | 30 | 26 | 321 | 8.0% |
| nutrition_table | 112 | 229 | 77 | 208 | 44.6% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 217 | 305 | 82 | 228 | 49.6% |
| marketing_company | 12 | 18 | 12 | 15 | 40.0% |
| address | 8 | 9 | 20 | 16 | 20.0% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 1 | 1 | 40 | 4 | 2.2% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.9%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| layout | 0 | 0 | 45 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| logo | 15 | 0 | 30 | 33.3% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — product_name: ['Eye Multivitamin Gummies for Kids & Adults', 'AM7 Gummies']
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-15 18:17 UTC — mode `pipeline (vlm on)` — 21a5b4f

**45 labels, 2273 fields scored.** Overall accuracy: **25.5%** (580 correct / 613 wrong / 1080 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 10 | 27 | 8 | 22.2% |
| product_name | 0 | 42 | 3 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 20 | 21 | 4 | 44.4% |
| claims | 24 | 32 | 327 | 6.3% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 112 | 194 | 226 | 21.1% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 217 | 170 | 316 | 30.9% |
| marketing_company | 12 | 18 | 15 | 26.7% |
| address | 8 | 21 | 16 | 17.8% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 1 | 40 | 4 | 2.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 3 | 6 | 33.3% |
| address | text-layer-flattened | 4 | 14 | 22.2% |
| brand_name | tesseract-full-page | 0 | 5 | 0.0% |
| brand_name | text-layer-flattened | 0 | 17 | 0.0% |
| brand_name | text-layer-reading-order | 0 | 4 | 0.0% |
| brand_name | vlm-role-resolution | 10 | 1 | 90.9% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 5 | 6 | 45.5% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 10 | 8 | 55.6% |
| package_size | package-size-ocr | 0 | 2 | 0.0% |
| package_size | tesseract-full-page | 0 | 15 | 0.0% |
| package_size | text-layer-flattened | 0 | 23 | 0.0% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 22 | 0.0% |
| product_name | vlm-role-resolution | 0 | 8 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **39.5%** (fuzzy/normalized — the 80% target) / 27.1% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 10 | 10 | 27 | 8 | 22.2% |
| product_name | 0 | 6 | 36 | 3 | 13.3% |
| flavour | 20 | 27 | 14 | 4 | 60.0% |
| claims | 24 | 30 | 26 | 321 | 8.0% |
| nutrition_table | 112 | 229 | 77 | 208 | 44.6% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 217 | 305 | 82 | 228 | 49.6% |
| marketing_company | 12 | 18 | 12 | 15 | 40.0% |
| address | 8 | 9 | 20 | 16 | 20.0% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 1 | 1 | 40 | 4 | 2.2% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.9%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| layout | 0 | 0 | 45 | 0.0% |
| logo | 15 | 0 | 30 | 33.3% |
| colour_theme | 34 | 28 | 53 | 29.6% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — product_name: ['Eye Multivitamin Gummies for Kids & Adults', 'AM7 Gummies']
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-15 18:53 UTC — mode `pipeline (vlm off)` — 2f9d38d

**45 labels, 2212 fields scored.** Overall accuracy: **25.7%** (568 correct / 543 wrong / 1101 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 0 | 26 | 19 | 0.0% |
| product_name | 0 | 34 | 11 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 20 | 21 | 4 | 44.4% |
| claims | 24 | 32 | 327 | 6.3% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 110 | 133 | 228 | 23.4% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 217 | 170 | 316 | 30.9% |
| marketing_company | 12 | 18 | 15 | 26.7% |
| address | 8 | 21 | 16 | 17.8% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 1 | 40 | 4 | 2.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 3 | 6 | 33.3% |
| address | text-layer-flattened | 4 | 14 | 22.2% |
| brand_name | tesseract-full-page | 0 | 5 | 0.0% |
| brand_name | text-layer-flattened | 0 | 17 | 0.0% |
| brand_name | text-layer-reading-order | 0 | 4 | 0.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 5 | 6 | 45.5% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 10 | 8 | 55.6% |
| package_size | package-size-ocr | 0 | 2 | 0.0% |
| package_size | tesseract-full-page | 0 | 15 | 0.0% |
| package_size | text-layer-flattened | 0 | 23 | 0.0% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 22 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **40.0%** (fuzzy/normalized — the 80% target) / 27.4% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 0 | 0 | 26 | 19 | 0.0% |
| product_name | 0 | 4 | 30 | 11 | 8.9% |
| flavour | 20 | 27 | 14 | 4 | 60.0% |
| claims | 24 | 30 | 26 | 321 | 8.0% |
| nutrition_table | 110 | 226 | 17 | 211 | 49.8% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 217 | 305 | 82 | 228 | 49.6% |
| marketing_company | 12 | 18 | 12 | 15 | 40.0% |
| address | 8 | 9 | 20 | 16 | 20.0% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 1 | 1 | 40 | 4 | 2.2% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.9%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| layout | 0 | 0 | 45 | 0.0% |
| logo | 15 | 0 | 30 | 33.3% |
| colour_theme | 34 | 28 | 53 | 29.6% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-15 19:16 UTC — mode `pipeline (vlm off)` — 11173b0

**45 labels, 2117 fields scored.** Overall accuracy: **28.4%** (601 correct / 448 wrong / 1068 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 0 | 26 | 19 | 0.0% |
| product_name | 0 | 34 | 11 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 20 | 21 | 4 | 44.4% |
| claims | 24 | 32 | 327 | 6.3% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 110 | 133 | 228 | 23.4% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 250 | 75 | 283 | 41.1% |
| marketing_company | 12 | 18 | 15 | 26.7% |
| address | 8 | 21 | 16 | 17.8% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 1 | 40 | 4 | 2.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 3 | 6 | 33.3% |
| address | text-layer-flattened | 4 | 14 | 22.2% |
| brand_name | tesseract-full-page | 0 | 5 | 0.0% |
| brand_name | text-layer-flattened | 0 | 17 | 0.0% |
| brand_name | text-layer-reading-order | 0 | 4 | 0.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 5 | 6 | 45.5% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 10 | 8 | 55.6% |
| package_size | package-size-ocr | 0 | 2 | 0.0% |
| package_size | tesseract-full-page | 0 | 15 | 0.0% |
| package_size | text-layer-flattened | 0 | 23 | 0.0% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 22 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **41.3%** (fuzzy/normalized — the 80% target) / 30.1% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 0 | 0 | 26 | 19 | 0.0% |
| product_name | 0 | 4 | 30 | 11 | 8.9% |
| flavour | 20 | 27 | 14 | 4 | 60.0% |
| claims | 24 | 30 | 26 | 321 | 8.0% |
| nutrition_table | 110 | 226 | 17 | 211 | 49.8% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 250 | 305 | 20 | 228 | 55.2% |
| marketing_company | 12 | 18 | 12 | 15 | 40.0% |
| address | 8 | 9 | 20 | 16 | 20.0% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 1 | 1 | 40 | 4 | 2.2% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.9%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| layout | 0 | 0 | 45 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| logo | 15 | 0 | 30 | 33.3% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-15 19:41 UTC — mode `pipeline (vlm off)` — efb5eaa

**45 labels, 2169 fields scored.** Overall accuracy: **29.9%** (649 correct / 500 wrong / 1020 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 0 | 26 | 19 | 0.0% |
| product_name | 0 | 34 | 11 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 20 | 21 | 4 | 44.4% |
| claims | 72 | 84 | 279 | 16.6% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 110 | 133 | 228 | 23.4% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 250 | 75 | 283 | 41.1% |
| marketing_company | 12 | 18 | 15 | 26.7% |
| address | 8 | 21 | 16 | 17.8% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 1 | 40 | 4 | 2.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 3 | 6 | 33.3% |
| address | text-layer-flattened | 4 | 14 | 22.2% |
| brand_name | tesseract-full-page | 0 | 5 | 0.0% |
| brand_name | text-layer-flattened | 0 | 17 | 0.0% |
| brand_name | text-layer-reading-order | 0 | 4 | 0.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 5 | 6 | 45.5% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 10 | 8 | 55.6% |
| package_size | package-size-ocr | 0 | 2 | 0.0% |
| package_size | tesseract-full-page | 0 | 15 | 0.0% |
| package_size | text-layer-flattened | 0 | 23 | 0.0% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 22 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **43.1%** (fuzzy/normalized — the 80% target) / 31.9% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 0 | 0 | 26 | 19 | 0.0% |
| product_name | 0 | 4 | 30 | 11 | 8.9% |
| flavour | 20 | 27 | 14 | 4 | 60.0% |
| claims | 72 | 83 | 73 | 268 | 19.6% |
| nutrition_table | 110 | 226 | 17 | 211 | 49.8% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 250 | 305 | 20 | 228 | 55.2% |
| marketing_company | 12 | 18 | 12 | 15 | 40.0% |
| address | 8 | 9 | 20 | 16 | 20.0% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 1 | 1 | 40 | 4 | 2.2% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.9%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| layout | 0 | 0 | 45 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| logo | 15 | 0 | 30 | 33.3% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-16 03:53 UTC — mode `pipeline (vlm off)` — b265d6e

**45 labels, 2166 fields scored.** Overall accuracy: **31.3%** (679 correct / 469 wrong / 1018 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 1 | 30 | 14 | 2.2% |
| product_name | 0 | 32 | 13 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 71 | 80 | 280 | 16.5% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 110 | 133 | 228 | 23.4% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 250 | 75 | 283 | 41.1% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 16 | 13 | 16 | 35.6% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 16 | 26 | 3 | 35.6% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 3 | 6 | 33.3% |
| address | text-layer-flattened | 12 | 6 | 66.7% |
| brand_name | tesseract-full-page | 0 | 7 | 0.0% |
| brand_name | text-layer-flattened | 1 | 21 | 4.5% |
| brand_name | text-layer-reading-order | 0 | 2 | 0.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 6 | 10 | 37.5% |
| package_size | text-layer-flattened | 8 | 15 | 34.8% |
| product_name | tesseract-full-page | 0 | 8 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 19 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **44.9%** (fuzzy/normalized — the 80% target) / 33.6% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 1 | 1 | 30 | 14 | 2.2% |
| product_name | 0 | 5 | 27 | 13 | 11.1% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 71 | 82 | 69 | 269 | 19.5% |
| nutrition_table | 110 | 226 | 17 | 211 | 49.8% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 250 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 16 | 17 | 12 | 16 | 37.8% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 16 | 17 | 25 | 3 | 37.8% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.8%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| layout | 0 | 0 | 45 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| logo | 15 | 0 | 30 | 33.3% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-16 04:08 UTC — mode `pipeline (vlm on)` — b265d6e

**45 labels, 2166 fields scored.** Overall accuracy: **31.7%** (686 correct / 479 wrong / 1001 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 8 | 30 | 7 | 17.8% |
| product_name | 0 | 42 | 3 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 71 | 80 | 280 | 16.5% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 110 | 133 | 228 | 23.4% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 250 | 75 | 283 | 41.1% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 16 | 13 | 16 | 35.6% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 16 | 26 | 3 | 35.6% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 3 | 6 | 33.3% |
| address | text-layer-flattened | 12 | 6 | 66.7% |
| brand_name | tesseract-full-page | 0 | 7 | 0.0% |
| brand_name | text-layer-flattened | 1 | 21 | 4.5% |
| brand_name | text-layer-reading-order | 0 | 2 | 0.0% |
| brand_name | vlm-role-resolution | 7 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 6 | 10 | 37.5% |
| package_size | text-layer-flattened | 8 | 15 | 34.8% |
| product_name | tesseract-full-page | 0 | 8 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 19 | 0.0% |
| product_name | vlm-role-resolution | 0 | 10 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **45.5%** (fuzzy/normalized — the 80% target) / 33.9% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 8 | 8 | 30 | 7 | 17.8% |
| product_name | 0 | 9 | 33 | 3 | 20.0% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 71 | 82 | 69 | 269 | 19.5% |
| nutrition_table | 110 | 226 | 17 | 211 | 49.8% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 250 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 16 | 17 | 12 | 16 | 37.8% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 16 | 17 | 25 | 3 | 37.8% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.8%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| logo | 15 | 0 | 30 | 33.3% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| layout | 0 | 0 | 45 | 0.0% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-16 06:55 UTC — mode `pipeline (vlm off)` — 0832d8d

**45 labels, 2168 fields scored.** Overall accuracy: **31.3%** (679 correct / 469 wrong / 1020 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 1 | 29 | 15 | 2.2% |
| product_name | 0 | 31 | 14 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 71 | 82 | 280 | 16.4% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 110 | 133 | 228 | 23.4% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 250 | 75 | 283 | 41.1% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 16 | 13 | 16 | 35.6% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 16 | 26 | 3 | 35.6% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 3 | 6 | 33.3% |
| address | text-layer-flattened | 12 | 6 | 66.7% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 21 | 4.5% |
| brand_name | text-layer-reading-order | 0 | 2 | 0.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 6 | 10 | 37.5% |
| package_size | text-layer-flattened | 8 | 15 | 34.8% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 19 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **44.9%** (fuzzy/normalized — the 80% target) / 33.5% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 1 | 1 | 29 | 15 | 2.2% |
| product_name | 0 | 5 | 26 | 14 | 11.1% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 71 | 82 | 71 | 269 | 19.4% |
| nutrition_table | 110 | 226 | 17 | 211 | 49.8% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 250 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 16 | 17 | 12 | 16 | 37.8% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 16 | 17 | 25 | 3 | 37.8% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.8%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| colour_theme | 34 | 29 | 53 | 29.3% |
| layout | 0 | 0 | 45 | 0.0% |
| logo | 15 | 0 | 30 | 33.3% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-16 07:12 UTC — mode `pipeline (vlm on)` — 0832d8d

**45 labels, 2168 fields scored.** Overall accuracy: **31.7%** (687 correct / 480 wrong / 1001 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 9 | 29 | 7 | 20.0% |
| product_name | 0 | 42 | 3 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 71 | 82 | 280 | 16.4% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 110 | 133 | 228 | 23.4% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 250 | 75 | 283 | 41.1% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 16 | 13 | 16 | 35.6% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 16 | 26 | 3 | 35.6% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 3 | 6 | 33.3% |
| address | text-layer-flattened | 12 | 6 | 66.7% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 21 | 4.5% |
| brand_name | text-layer-reading-order | 0 | 2 | 0.0% |
| brand_name | vlm-role-resolution | 8 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 6 | 10 | 37.5% |
| package_size | text-layer-flattened | 8 | 15 | 34.8% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 19 | 0.0% |
| product_name | vlm-role-resolution | 0 | 11 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **45.6%** (fuzzy/normalized — the 80% target) / 34.0% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 9 | 9 | 29 | 7 | 20.0% |
| product_name | 0 | 10 | 32 | 3 | 22.2% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 71 | 82 | 71 | 269 | 19.4% |
| nutrition_table | 110 | 226 | 17 | 211 | 49.8% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 250 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 16 | 17 | 12 | 16 | 37.8% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 16 | 17 | 25 | 3 | 37.8% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.8%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| layout | 0 | 0 | 45 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| logo | 15 | 0 | 30 | 33.3% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-16 09:27 UTC — mode `pipeline (vlm off)` — 98d0ae4

**45 labels, 2179 fields scored.** Overall accuracy: **31.2%** (679 correct / 487 wrong / 1013 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 1 | 29 | 15 | 2.2% |
| product_name | 0 | 31 | 14 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 71 | 82 | 280 | 16.4% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 110 | 151 | 221 | 22.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 250 | 75 | 283 | 41.1% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 16 | 13 | 16 | 35.6% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 16 | 26 | 3 | 35.6% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 3 | 6 | 33.3% |
| address | text-layer-flattened | 12 | 6 | 66.7% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 21 | 4.5% |
| brand_name | text-layer-reading-order | 0 | 2 | 0.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 6 | 10 | 37.5% |
| package_size | text-layer-flattened | 8 | 15 | 34.8% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 19 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **44.7%** (fuzzy/normalized — the 80% target) / 33.4% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 1 | 1 | 29 | 15 | 2.2% |
| product_name | 0 | 5 | 26 | 14 | 11.1% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 71 | 82 | 71 | 269 | 19.4% |
| nutrition_table | 110 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 250 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 16 | 17 | 12 | 16 | 37.8% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 16 | 17 | 25 | 3 | 37.8% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.8%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-16 15:29 UTC — mode `pipeline (vlm off)` — 98d0ae4

**45 labels, 2116 fields scored.** Overall accuracy: **34.4%** (727 correct / 416 wrong / 973 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 1 | 29 | 15 | 2.2% |
| product_name | 0 | 31 | 14 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 90 | 40 | 261 | 23.0% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 110 | 151 | 221 | 22.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 16 | 13 | 16 | 35.6% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 24 | 18 | 3 | 53.3% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 3 | 6 | 33.3% |
| address | text-layer-flattened | 12 | 6 | 66.7% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 21 | 4.5% |
| brand_name | text-layer-reading-order | 0 | 2 | 0.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 11 | 5 | 68.8% |
| package_size | text-layer-flattened | 11 | 12 | 47.8% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 19 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **46.7%** (fuzzy/normalized — the 80% target) / 36.6% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 1 | 1 | 29 | 15 | 2.2% |
| product_name | 0 | 5 | 26 | 14 | 11.1% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 90 | 95 | 35 | 256 | 24.6% |
| nutrition_table | 110 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 16 | 17 | 12 | 16 | 37.8% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 24 | 25 | 17 | 3 | 55.6% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.8%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-16 15:44 UTC — mode `pipeline (vlm on)` — 98d0ae4

**45 labels, 2116 fields scored.** Overall accuracy: **34.4%** (727 correct / 416 wrong / 973 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 1 | 29 | 15 | 2.2% |
| product_name | 0 | 31 | 14 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 90 | 40 | 261 | 23.0% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 110 | 151 | 221 | 22.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 16 | 13 | 16 | 35.6% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 24 | 18 | 3 | 53.3% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 3 | 6 | 33.3% |
| address | text-layer-flattened | 12 | 6 | 66.7% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 21 | 4.5% |
| brand_name | text-layer-reading-order | 0 | 2 | 0.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 11 | 5 | 68.8% |
| package_size | text-layer-flattened | 11 | 12 | 47.8% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 19 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **46.7%** (fuzzy/normalized — the 80% target) / 36.6% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 1 | 1 | 29 | 15 | 2.2% |
| product_name | 0 | 5 | 26 | 14 | 11.1% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 90 | 95 | 35 | 256 | 24.6% |
| nutrition_table | 110 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 16 | 17 | 12 | 16 | 37.8% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 24 | 25 | 17 | 3 | 55.6% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.8%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-16 16:09 UTC — mode `pipeline (vlm on)` — 449e492

**45 labels, 2116 fields scored.** Overall accuracy: **34.4%** (727 correct / 416 wrong / 973 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 1 | 29 | 15 | 2.2% |
| product_name | 0 | 31 | 14 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 90 | 40 | 261 | 23.0% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 110 | 151 | 221 | 22.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 16 | 13 | 16 | 35.6% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 24 | 18 | 3 | 53.3% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 3 | 6 | 33.3% |
| address | text-layer-flattened | 12 | 6 | 66.7% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 21 | 4.5% |
| brand_name | text-layer-reading-order | 0 | 2 | 0.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 11 | 5 | 68.8% |
| package_size | text-layer-flattened | 11 | 12 | 47.8% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 19 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **46.7%** (fuzzy/normalized — the 80% target) / 36.6% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 1 | 1 | 29 | 15 | 2.2% |
| product_name | 0 | 5 | 26 | 14 | 11.1% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 90 | 95 | 35 | 256 | 24.6% |
| nutrition_table | 110 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 16 | 17 | 12 | 16 | 37.8% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 24 | 25 | 17 | 3 | 55.6% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.8%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-16 16:28 UTC — mode `pipeline (vlm on)` — 449e492

**45 labels, 2116 fields scored.** Overall accuracy: **34.4%** (727 correct / 416 wrong / 973 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 1 | 29 | 15 | 2.2% |
| product_name | 0 | 31 | 14 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 90 | 40 | 261 | 23.0% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 110 | 151 | 221 | 22.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 16 | 13 | 16 | 35.6% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 24 | 18 | 3 | 53.3% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 3 | 6 | 33.3% |
| address | text-layer-flattened | 12 | 6 | 66.7% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 21 | 4.5% |
| brand_name | text-layer-reading-order | 0 | 2 | 0.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 11 | 5 | 68.8% |
| package_size | text-layer-flattened | 11 | 12 | 47.8% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 19 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **46.7%** (fuzzy/normalized — the 80% target) / 36.6% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 1 | 1 | 29 | 15 | 2.2% |
| product_name | 0 | 5 | 26 | 14 | 11.1% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 90 | 95 | 35 | 256 | 24.6% |
| nutrition_table | 110 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 16 | 17 | 12 | 16 | 37.8% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 24 | 25 | 17 | 3 | 55.6% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.8%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| layout | 0 | 0 | 45 | 0.0% |
| logo | 15 | 0 | 30 | 33.3% |
| colour_theme | 34 | 29 | 53 | 29.3% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-16 16:52 UTC — mode `pipeline (vlm on)` — 449e492

**45 labels, 2116 fields scored.** Overall accuracy: **35.2%** (744 correct / 411 wrong / 961 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 16 | 19 | 10 | 35.6% |
| product_name | 2 | 36 | 7 | 4.4% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 90 | 40 | 261 | 23.0% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 110 | 151 | 221 | 22.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 16 | 13 | 16 | 35.6% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 24 | 18 | 3 | 53.3% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 3 | 6 | 33.3% |
| address | text-layer-flattened | 12 | 6 | 66.7% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 11 | 8.3% |
| brand_name | text-layer-reading-order | 0 | 2 | 0.0% |
| brand_name | vlm-role-resolution | 15 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 11 | 5 | 68.8% |
| package_size | text-layer-flattened | 11 | 12 | 47.8% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 13 | 0.0% |
| product_name | vlm-role-resolution | 2 | 11 | 15.4% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **47.9%** (fuzzy/normalized — the 80% target) / 37.5% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 16 | 16 | 19 | 10 | 35.6% |
| product_name | 2 | 12 | 26 | 7 | 26.7% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 90 | 95 | 35 | 256 | 24.6% |
| nutrition_table | 110 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 16 | 17 | 12 | 16 | 37.8% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 24 | 25 | 17 | 3 | 55.6% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.8%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| logo | 15 | 0 | 30 | 33.3% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| layout | 0 | 0 | 45 | 0.0% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-16 17:57 UTC — mode `pipeline (vlm on)` — 742bc4f

**45 labels, 2116 fields scored.** Overall accuracy: **35.3%** (747 correct / 408 wrong / 961 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 16 | 19 | 10 | 35.6% |
| product_name | 2 | 36 | 7 | 4.4% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 90 | 40 | 261 | 23.0% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 110 | 151 | 221 | 22.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 24 | 18 | 3 | 53.3% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 11 | 8.3% |
| brand_name | text-layer-reading-order | 0 | 2 | 0.0% |
| brand_name | vlm-role-resolution | 15 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 11 | 5 | 68.8% |
| package_size | text-layer-flattened | 11 | 12 | 47.8% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 13 | 0.0% |
| product_name | vlm-role-resolution | 2 | 11 | 15.4% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **48.1%** (fuzzy/normalized — the 80% target) / 37.7% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 16 | 16 | 19 | 10 | 35.6% |
| product_name | 2 | 12 | 26 | 7 | 26.7% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 90 | 95 | 35 | 256 | 24.6% |
| nutrition_table | 110 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 24 | 25 | 17 | 3 | 55.6% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.8%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| logo | 15 | 0 | 30 | 33.3% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| layout | 0 | 0 | 45 | 0.0% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-16 19:09 UTC — mode `pipeline (vlm off)` — 50506c9

**45 labels, 2116 fields scored.** Overall accuracy: **34.8%** (736 correct / 413 wrong / 967 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 1 | 29 | 15 | 2.2% |
| product_name | 0 | 31 | 14 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 96 | 40 | 255 | 24.6% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 110 | 151 | 221 | 22.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 24 | 18 | 3 | 53.3% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 21 | 4.5% |
| brand_name | text-layer-reading-order | 0 | 2 | 0.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 11 | 5 | 68.8% |
| package_size | text-layer-flattened | 11 | 12 | 47.8% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 19 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **47.3%** (fuzzy/normalized — the 80% target) / 37.1% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 1 | 1 | 29 | 15 | 2.2% |
| product_name | 0 | 5 | 26 | 14 | 11.1% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 96 | 101 | 35 | 250 | 26.2% |
| nutrition_table | 110 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 24 | 25 | 17 | 3 | 55.6% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.8%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| colour_theme | 34 | 29 | 53 | 29.3% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-17 04:24 UTC — mode `pipeline (vlm on)` — 9a29c03

**45 labels, 2116 fields scored.** Overall accuracy: **35.5%** (751 correct / 410 wrong / 955 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 14 | 21 | 10 | 31.1% |
| product_name | 2 | 36 | 7 | 4.4% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 96 | 40 | 255 | 24.6% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 110 | 151 | 221 | 22.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 24 | 18 | 3 | 53.3% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 11 | 8.3% |
| brand_name | text-layer-reading-order | 0 | 4 | 0.0% |
| brand_name | vlm-role-resolution | 13 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 11 | 5 | 68.8% |
| package_size | text-layer-flattened | 11 | 12 | 47.8% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 13 | 0.0% |
| product_name | vlm-role-resolution | 2 | 11 | 15.4% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **48.4%** (fuzzy/normalized — the 80% target) / 37.9% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 14 | 14 | 21 | 10 | 31.1% |
| product_name | 2 | 12 | 26 | 7 | 26.7% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 96 | 101 | 35 | 250 | 26.2% |
| nutrition_table | 110 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 24 | 25 | 17 | 3 | 55.6% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.8%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| layout | 0 | 0 | 45 | 0.0% |
| logo | 15 | 0 | 30 | 33.3% |
| colour_theme | 34 | 29 | 53 | 29.3% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-17 04:45 UTC — mode `pipeline (vlm on)` — 9a29c03

**45 labels, 2116 fields scored.** Overall accuracy: **35.5%** (751 correct / 409 wrong / 956 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 14 | 21 | 10 | 31.1% |
| product_name | 2 | 35 | 8 | 4.4% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 96 | 40 | 255 | 24.6% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 110 | 151 | 221 | 22.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 24 | 18 | 3 | 53.3% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 11 | 8.3% |
| brand_name | text-layer-reading-order | 0 | 4 | 0.0% |
| brand_name | vlm-role-resolution | 13 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 11 | 5 | 68.8% |
| package_size | text-layer-flattened | 11 | 12 | 47.8% |
| product_name | tesseract-full-page | 0 | 8 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 11 | 0.0% |
| product_name | vlm-role-resolution | 2 | 11 | 15.4% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **48.4%** (fuzzy/normalized — the 80% target) / 37.9% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 14 | 14 | 21 | 10 | 31.1% |
| product_name | 2 | 12 | 25 | 8 | 26.7% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 96 | 101 | 35 | 250 | 26.2% |
| nutrition_table | 110 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 24 | 25 | 17 | 3 | 55.6% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.8%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-17 05:14 UTC — mode `pipeline (vlm on)` — cb2caeb

**45 labels, 2119 fields scored.** Overall accuracy: **35.9%** (760 correct / 412 wrong / 947 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 14 | 21 | 10 | 31.1% |
| product_name | 2 | 35 | 8 | 4.4% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 105 | 43 | 246 | 26.6% |
| logo | 15 | 0 | 30 | 33.3% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 110 | 151 | 221 | 22.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 24 | 18 | 3 | 53.3% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 11 | 8.3% |
| brand_name | text-layer-reading-order | 0 | 4 | 0.0% |
| brand_name | vlm-role-resolution | 13 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 11 | 5 | 68.8% |
| package_size | text-layer-flattened | 11 | 12 | 47.8% |
| product_name | tesseract-full-page | 0 | 8 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 11 | 0.0% |
| product_name | vlm-role-resolution | 2 | 11 | 15.4% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **48.8%** (fuzzy/normalized — the 80% target) / 38.3% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 14 | 14 | 21 | 10 | 31.1% |
| product_name | 2 | 12 | 25 | 8 | 26.7% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 105 | 110 | 38 | 241 | 28.3% |
| nutrition_table | 110 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 24 | 25 | 17 | 3 | 55.6% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 23.8%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| colour_theme | 34 | 29 | 53 | 29.3% |
| layout | 0 | 0 | 45 | 0.0% |
| logo | 15 | 0 | 30 | 33.3% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 15 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-17 18:30 UTC — mode `pipeline (vlm on)` — ec7487c

**45 labels, 2120 fields scored.** Overall accuracy: **34.7%** (735 correct / 434 wrong / 951 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 16 | 19 | 10 | 35.6% |
| product_name | 2 | 35 | 8 | 4.4% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 105 | 43 | 247 | 26.6% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 94 | 167 | 221 | 19.5% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 16 | 26 | 3 | 35.6% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 11 | 8.3% |
| brand_name | text-layer-reading-order | 0 | 2 | 0.0% |
| brand_name | vlm-role-resolution | 15 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 4 | 19 | 17.4% |
| product_name | tesseract-full-page | 0 | 6 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 11 | 0.0% |
| product_name | vlm-role-resolution | 2 | 13 | 13.3% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **48.6%** (fuzzy/normalized — the 80% target) / 37.1% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 16 | 16 | 19 | 10 | 35.6% |
| product_name | 2 | 12 | 25 | 8 | 26.7% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 105 | 110 | 38 | 242 | 28.2% |
| nutrition_table | 94 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 16 | 20 | 22 | 3 | 44.4% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.3%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-18 04:23 UTC — mode `pipeline (vlm on)` — ec7487c

**45 labels, 2120 fields scored.** Overall accuracy: **36.5%** (773 correct / 396 wrong / 951 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 16 | 19 | 10 | 35.6% |
| product_name | 2 | 35 | 8 | 4.4% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 105 | 43 | 247 | 26.6% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 129 | 132 | 221 | 26.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 19 | 23 | 3 | 42.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 11 | 8.3% |
| brand_name | text-layer-reading-order | 0 | 2 | 0.0% |
| brand_name | vlm-role-resolution | 15 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 7 | 16 | 30.4% |
| product_name | tesseract-full-page | 0 | 6 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 11 | 0.0% |
| product_name | vlm-role-resolution | 2 | 13 | 13.3% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **48.6%** (fuzzy/normalized — the 80% target) / 39.1% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 16 | 16 | 19 | 10 | 35.6% |
| product_name | 2 | 13 | 24 | 8 | 28.9% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 105 | 110 | 38 | 242 | 28.2% |
| nutrition_table | 129 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 19 | 20 | 22 | 3 | 44.4% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.3%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| colour_theme | 34 | 29 | 53 | 29.3% |
| layout | 0 | 0 | 45 | 0.0% |
| logo | 12 | 0 | 33 | 26.7% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-18 04:23 UTC — mode `pipeline (vlm on)` — ec7487c

**45 labels, 2120 fields scored.** Overall accuracy: **36.5%** (773 correct / 396 wrong / 951 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 16 | 20 | 9 | 35.6% |
| product_name | 2 | 34 | 9 | 4.4% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 105 | 43 | 247 | 26.6% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 129 | 132 | 221 | 26.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 19 | 23 | 3 | 42.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 12 | 7.7% |
| brand_name | text-layer-reading-order | 0 | 2 | 0.0% |
| brand_name | vlm-role-resolution | 15 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 7 | 16 | 30.4% |
| product_name | tesseract-full-page | 0 | 6 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 11 | 0.0% |
| product_name | vlm-role-resolution | 2 | 12 | 14.3% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **48.6%** (fuzzy/normalized — the 80% target) / 39.1% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 16 | 16 | 20 | 9 | 35.6% |
| product_name | 2 | 12 | 24 | 9 | 26.7% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 105 | 110 | 38 | 242 | 28.2% |
| nutrition_table | 129 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 19 | 20 | 22 | 3 | 44.4% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.3%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| colour_theme | 34 | 29 | 53 | 29.3% |
| layout | 0 | 0 | 45 | 0.0% |
| logo | 12 | 0 | 33 | 26.7% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-18 16:30 UTC — mode `pipeline (vlm off)` — d19d68a

**45 labels, 2110 fields scored.** Overall accuracy: **35.8%** (756 correct / 397 wrong / 957 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 2 | 32 | 11 | 4.4% |
| product_name | 1 | 30 | 14 | 2.2% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 103 | 33 | 249 | 26.8% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 129 | 132 | 221 | 26.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 11 | 14 | 44.4% |
| address | 19 | 12 | 14 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 19 | 23 | 3 | 42.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| address | vlm-fallback | 0 | 2 | 0.0% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 21 | 4.5% |
| brand_name | text-layer-reading-order | 0 | 3 | 0.0% |
| brand_name | vlm-fallback | 1 | 2 | 33.3% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| marketing_company | vlm-fallback | 0 | 1 | 0.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 7 | 16 | 30.4% |
| product_name | tesseract-full-page | 0 | 8 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 17 | 0.0% |
| product_name | vlm-fallback | 1 | 0 | 100.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **47.7%** (fuzzy/normalized — the 80% target) / 38.4% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 2 | 2 | 32 | 11 | 4.4% |
| product_name | 1 | 6 | 25 | 14 | 13.3% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 103 | 108 | 28 | 244 | 28.4% |
| nutrition_table | 129 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 27 | 4 | 14 | 60.0% |
| address | 19 | 21 | 10 | 14 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 19 | 20 | 22 | 3 | 44.4% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.3%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| colour_theme | 34 | 29 | 53 | 29.3% |
| layout | 0 | 0 | 45 | 0.0% |
| logo | 12 | 0 | 33 | 26.7% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-18 17:19 UTC — mode `pipeline (vlm on)` — d19d68a

**45 labels, 2092 fields scored.** Overall accuracy: **36.7%** (768 correct / 368 wrong / 956 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 13 | 21 | 11 | 28.9% |
| product_name | 2 | 33 | 10 | 4.4% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 103 | 15 | 249 | 28.1% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 129 | 132 | 221 | 26.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 19 | 23 | 3 | 42.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 13 | 7.1% |
| brand_name | text-layer-reading-order | 0 | 2 | 0.0% |
| brand_name | vlm-role-resolution | 12 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 7 | 16 | 30.4% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 12 | 0.0% |
| product_name | vlm-role-resolution | 2 | 9 | 18.2% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **49.0%** (fuzzy/normalized — the 80% target) / 39.5% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 13 | 13 | 21 | 11 | 28.9% |
| product_name | 2 | 11 | 24 | 10 | 24.4% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 103 | 108 | 10 | 244 | 29.8% |
| nutrition_table | 129 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 19 | 20 | 22 | 3 | 44.4% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.3%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| layout | 0 | 0 | 45 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| logo | 12 | 0 | 33 | 26.7% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-18 19:02 UTC — mode `pipeline (vlm on)` — 8ebd2be

**10 labels, 485 fields scored.** Overall accuracy: **40.0%** (194 correct / 66 wrong / 225 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 2 | 4 | 4 | 20.0% |
| product_name | 1 | 8 | 1 | 10.0% |
| colour_theme | 10 | 6 | 8 | 41.7% |
| flavour | 4 | 3 | 3 | 40.0% |
| claims | 36 | 1 | 54 | 39.6% |
| logo | 5 | 0 | 5 | 50.0% |
| layout | 0 | 0 | 10 | 0.0% |
| nutrition_table | 27 | 19 | 75 | 22.3% |
| fssai_number | 6 | 1 | 3 | 60.0% |
| ingredients | 65 | 18 | 46 | 50.4% |
| marketing_company | 5 | 2 | 3 | 50.0% |
| address | 5 | 1 | 4 | 50.0% |
| customer_care_number | 3 | 2 | 5 | 30.0% |
| customer_care_email | 8 | 0 | 2 | 80.0% |
| package_size | 7 | 1 | 2 | 70.0% |
| manufacturing_company | 10 | 0 | 0 | 100.0% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-region-ocr | 1 | 1 | 50.0% |
| address | text-layer-flattened | 4 | 0 | 100.0% |
| brand_name | tesseract-full-page | 0 | 1 | 0.0% |
| brand_name | text-layer-flattened | 0 | 1 | 0.0% |
| brand_name | text-layer-reading-order | 0 | 2 | 0.0% |
| brand_name | vlm-role-resolution | 2 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 3 | 0 | 100.0% |
| customer_care_email | text-layer-flattened | 4 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 0 | 2 | 0.0% |
| customer_care_number | text-layer-flattened | 2 | 0 | 100.0% |
| flavour | tesseract-full-page | 1 | 1 | 50.0% |
| flavour | text-layer-flattened | 3 | 2 | 60.0% |
| fssai_number | tesseract-full-page | 1 | 1 | 50.0% |
| fssai_number | text-layer-flattened | 5 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 1 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 1 | 50.0% |
| marketing_company | text-layer-flattened | 4 | 0 | 100.0% |
| package_size | tesseract-full-page | 3 | 1 | 75.0% |
| package_size | text-layer-flattened | 4 | 0 | 100.0% |
| product_name | tesseract-full-page | 0 | 1 | 0.0% |
| product_name | tesseract-title-region | 0 | 1 | 0.0% |
| product_name | text-layer-flattened | 0 | 4 | 0.0% |
| product_name | vlm-role-resolution | 1 | 2 | 33.3% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **48.6%** (fuzzy/normalized — the 80% target) / 41.8% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 2 | 2 | 4 | 4 | 20.0% |
| product_name | 1 | 5 | 4 | 1 | 50.0% |
| flavour | 4 | 5 | 2 | 3 | 50.0% |
| claims | 36 | 36 | 1 | 54 | 39.6% |
| nutrition_table | 27 | 38 | 8 | 73 | 31.9% |
| fssai_number | 6 | 6 | 1 | 3 | 60.0% |
| ingredients | 65 | 76 | 7 | 35 | 64.4% |
| marketing_company | 5 | 5 | 2 | 3 | 50.0% |
| address | 5 | 5 | 1 | 4 | 50.0% |
| customer_care_number | 3 | 5 | 0 | 5 | 50.0% |
| customer_care_email | 8 | 8 | 0 | 2 | 80.0% |
| package_size | 7 | 7 | 1 | 2 | 70.0% |
| manufacturing_company | 10 | 10 | 0 | 0 | 100.0% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 34.1%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| layout | 0 | 0 | 10 | 0.0% |
| colour_theme | 10 | 6 | 8 | 41.7% |
| logo | 5 | 0 | 5 | 50.0% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| logo | 0 | 5 | 0.0% |
| customer_care_number | 0 | 1 | 0.0% |
| customer_care_email | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']

## 2026-09-19 17:10 UTC — mode `pipeline (vlm off)` — beef9d1

**45 labels, 2092 fields scored.** Overall accuracy: **38.1%** (798 correct / 331 wrong / 963 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 1 | 31 | 13 | 2.2% |
| product_name | 0 | 30 | 15 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 103 | 15 | 249 | 28.1% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 173 | 88 | 221 | 35.9% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 19 | 23 | 3 | 42.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 21 | 4.5% |
| brand_name | text-layer-reading-order | 0 | 4 | 0.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 7 | 16 | 30.4% |
| product_name | tesseract-full-page | 0 | 8 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 17 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **47.9%** (fuzzy/normalized — the 80% target) / 41.1% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 1 | 1 | 31 | 13 | 2.2% |
| product_name | 0 | 5 | 25 | 15 | 11.1% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 103 | 108 | 10 | 244 | 29.8% |
| nutrition_table | 173 | 226 | 35 | 203 | 48.7% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 19 | 20 | 22 | 3 | 44.4% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.3%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| colour_theme | 34 | 29 | 53 | 29.3% |
| layout | 0 | 0 | 45 | 0.0% |
| logo | 12 | 0 | 33 | 26.7% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-19 15:00 UTC — mode `pipeline (vlm off, masters off)` — 3765c0b

**45 labels, 2092 fields scored.** Overall accuracy: **36.0%** (754 correct / 375 wrong / 963 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 1 | 31 | 13 | 2.2% |
| product_name | 0 | 30 | 15 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 103 | 15 | 249 | 28.1% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 129 | 132 | 221 | 26.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 19 | 23 | 3 | 42.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 21 | 4.5% |
| brand_name | text-layer-reading-order | 0 | 4 | 0.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 7 | 16 | 30.4% |
| product_name | tesseract-full-page | 0 | 8 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 17 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **48.0%** (fuzzy/normalized — the 80% target) / 38.7% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 1 | 1 | 31 | 13 | 2.2% |
| product_name | 0 | 5 | 25 | 15 | 11.1% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 103 | 108 | 10 | 244 | 29.8% |
| nutrition_table | 129 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 19 | 20 | 22 | 3 | 44.4% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.3%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| layout | 0 | 0 | 45 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| logo | 12 | 0 | 33 | 26.7% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-19 15:15 UTC — mode `pipeline (vlm off, masters on)` — 3765c0b

**45 labels, 2134 fields scored.** Overall accuracy: **39.4%** (840 correct / 412 wrong / 882 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 2 | 25 | 18 | 4.4% |
| product_name | 0 | 30 | 15 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 20 | 22 | 3 | 44.4% |
| claims | 187 | 58 | 165 | 45.6% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 129 | 132 | 221 | 26.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 19 | 23 | 3 | 42.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | master-snap | 1 | 0 | 100.0% |
| brand_name | tesseract-full-page | 1 | 25 | 3.8% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 7 | 36.4% |
| flavour | text-layer-flattened | 11 | 15 | 42.3% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 7 | 16 | 30.4% |
| product_name | tesseract-full-page | 0 | 8 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 17 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **51.5%** (fuzzy/normalized — the 80% target) / 42.4% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 2 | 2 | 25 | 18 | 4.4% |
| product_name | 0 | 5 | 25 | 15 | 11.1% |
| flavour | 20 | 28 | 14 | 3 | 62.2% |
| claims | 187 | 192 | 53 | 160 | 47.4% |
| nutrition_table | 129 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 19 | 20 | 22 | 3 | 44.4% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.4%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| colour_theme | 34 | 28 | 53 | 29.6% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-19 16:51 UTC — mode `pipeline (vlm off)` — 8ebd2be

**45 labels, 2103 fields scored.** Overall accuracy: **36.7%** (771 correct / 391 wrong / 941 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 1 | 31 | 13 | 2.2% |
| product_name | 0 | 30 | 15 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 110 | 18 | 242 | 29.7% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 130 | 141 | 215 | 26.7% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 280 | 58 | 253 | 47.4% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 19 | 23 | 3 | 42.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 21 | 4.5% |
| brand_name | text-layer-reading-order | 0 | 4 | 0.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 7 | 16 | 30.4% |
| product_name | tesseract-full-page | 0 | 8 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 17 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **49.2%** (fuzzy/normalized — the 80% target) / 39.5% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 1 | 1 | 31 | 13 | 2.2% |
| product_name | 0 | 5 | 25 | 15 | 11.1% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 110 | 115 | 13 | 237 | 31.5% |
| nutrition_table | 130 | 234 | 37 | 197 | 50.0% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 280 | 317 | 21 | 216 | 57.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 19 | 20 | 22 | 3 | 44.4% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.3%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| layout | 0 | 0 | 45 | 0.0% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| logo | 12 | 0 | 33 | 26.7% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-19 17:35 UTC — mode `pipeline (vlm off, masters on)` — 3b4e5bc

**45 labels, 2148 fields scored.** Overall accuracy: **42.0%** (903 correct / 387 wrong / 858 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 2 | 25 | 18 | 4.4% |
| product_name | 0 | 30 | 15 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 20 | 22 | 3 | 44.4% |
| claims | 196 | 64 | 156 | 47.1% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 174 | 97 | 215 | 35.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 280 | 58 | 253 | 47.4% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 19 | 23 | 3 | 42.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | master-snap | 1 | 0 | 100.0% |
| brand_name | tesseract-full-page | 1 | 25 | 3.8% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 7 | 36.4% |
| flavour | text-layer-flattened | 11 | 15 | 42.3% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 7 | 16 | 30.4% |
| product_name | tesseract-full-page | 0 | 8 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 17 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **52.7%** (fuzzy/normalized — the 80% target) / 45.5% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 2 | 2 | 25 | 18 | 4.4% |
| product_name | 0 | 5 | 25 | 15 | 11.1% |
| flavour | 20 | 28 | 14 | 3 | 62.2% |
| claims | 196 | 202 | 58 | 150 | 49.3% |
| nutrition_table | 174 | 232 | 39 | 197 | 49.6% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 280 | 317 | 21 | 216 | 57.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 19 | 20 | 22 | 3 | 44.4% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.4%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| colour_theme | 34 | 28 | 53 | 29.6% |
| layout | 0 | 0 | 45 | 0.0% |
| logo | 12 | 0 | 33 | 26.7% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-19 18:03 UTC — mode `pipeline (vlm off, masters on)` — 6d7ab27

**45 labels, 2127 fields scored.** Overall accuracy: **42.5%** (903 correct / 366 wrong / 858 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 2 | 25 | 18 | 4.4% |
| product_name | 0 | 30 | 15 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 20 | 22 | 3 | 44.4% |
| claims | 196 | 43 | 156 | 49.6% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 174 | 97 | 215 | 35.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 280 | 58 | 253 | 47.4% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 19 | 23 | 3 | 42.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | master-snap | 1 | 0 | 100.0% |
| brand_name | tesseract-full-page | 1 | 25 | 3.8% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 7 | 36.4% |
| flavour | text-layer-flattened | 11 | 15 | 42.3% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 7 | 16 | 30.4% |
| product_name | tesseract-full-page | 0 | 8 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 17 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **53.3%** (fuzzy/normalized — the 80% target) / 46.1% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 2 | 2 | 25 | 18 | 4.4% |
| product_name | 0 | 5 | 25 | 15 | 11.1% |
| flavour | 20 | 28 | 14 | 3 | 62.2% |
| claims | 196 | 202 | 37 | 150 | 51.9% |
| nutrition_table | 174 | 232 | 39 | 197 | 49.6% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 280 | 317 | 21 | 216 | 57.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 19 | 20 | 22 | 3 | 44.4% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.4%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| colour_theme | 34 | 28 | 53 | 29.6% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-19 18:35 UTC — mode `pipeline (vlm on)` — d2300bb

**45 labels, 2092 fields scored.** Overall accuracy: **37.1%** (776 correct / 371 wrong / 945 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 21 | 22 | 2 | 46.7% |
| product_name | 2 | 35 | 8 | 4.4% |
| colour_theme | 34 | 29 | 53 | 29.3% |
| flavour | 19 | 21 | 5 | 42.2% |
| claims | 103 | 15 | 249 | 28.1% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 129 | 132 | 221 | 26.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 271 | 54 | 262 | 46.2% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 19 | 23 | 3 | 42.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | tesseract-full-page | 0 | 6 | 0.0% |
| brand_name | text-layer-flattened | 1 | 11 | 8.3% |
| brand_name | text-layer-reading-order | 0 | 2 | 0.0% |
| brand_name | vlm-role-resolution | 20 | 3 | 87.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 6 | 40.0% |
| flavour | text-layer-flattened | 10 | 15 | 40.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 7 | 16 | 30.4% |
| product_name | tesseract-full-page | 0 | 6 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 11 | 0.0% |
| product_name | vlm-role-resolution | 2 | 13 | 13.3% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **49.6%** (fuzzy/normalized — the 80% target) / 39.9% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 21 | 22 | 21 | 2 | 48.9% |
| product_name | 2 | 13 | 24 | 8 | 28.9% |
| flavour | 19 | 26 | 14 | 5 | 57.8% |
| claims | 103 | 108 | 10 | 244 | 29.8% |
| nutrition_table | 129 | 228 | 33 | 203 | 49.1% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 271 | 305 | 20 | 228 | 55.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 19 | 20 | 22 | 3 | 44.4% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.3%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| layout | 0 | 0 | 45 | 0.0% |
| logo | 12 | 0 | 33 | 26.7% |
| colour_theme | 34 | 29 | 53 | 29.3% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-19 19:05 UTC — mode `pipeline (vlm on, masters on)` — 28c2773

**45 labels, 2127 fields scored.** Overall accuracy: **43.5%** (925 correct / 367 wrong / 835 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 22 | 21 | 2 | 48.9% |
| product_name | 2 | 35 | 8 | 4.4% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 20 | 22 | 3 | 44.4% |
| claims | 196 | 43 | 156 | 49.6% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 174 | 97 | 215 | 35.8% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 280 | 58 | 253 | 47.4% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 19 | 23 | 3 | 42.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | master-snap | 1 | 0 | 100.0% |
| brand_name | tesseract-full-page | 1 | 18 | 5.3% |
| brand_name | vlm-role-resolution | 20 | 3 | 87.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 7 | 36.4% |
| flavour | text-layer-flattened | 11 | 15 | 42.3% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 7 | 16 | 30.4% |
| product_name | tesseract-full-page | 0 | 6 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 11 | 0.0% |
| product_name | vlm-role-resolution | 2 | 13 | 13.3% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **54.8%** (fuzzy/normalized — the 80% target) / 47.2% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 22 | 23 | 20 | 2 | 51.1% |
| product_name | 2 | 13 | 24 | 8 | 28.9% |
| flavour | 20 | 28 | 14 | 3 | 62.2% |
| claims | 196 | 202 | 37 | 150 | 51.9% |
| nutrition_table | 174 | 232 | 39 | 197 | 49.6% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 280 | 317 | 21 | 216 | 57.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 19 | 20 | 22 | 3 | 44.4% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.4%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| colour_theme | 34 | 28 | 53 | 29.6% |
| layout | 0 | 0 | 45 | 0.0% |
| logo | 12 | 0 | 33 | 26.7% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-20 04:36 UTC — mode `pipeline (vlm on, masters on)` — fcb4d56

**45 labels, 2129 fields scored.** Overall accuracy: **44.2%** (940 correct / 382 wrong / 807 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 22 | 21 | 2 | 48.9% |
| product_name | 2 | 35 | 8 | 4.4% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 20 | 22 | 3 | 44.4% |
| claims | 196 | 43 | 156 | 49.6% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 189 | 112 | 187 | 38.7% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 280 | 58 | 253 | 47.4% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 19 | 23 | 3 | 42.2% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | master-snap | 1 | 0 | 100.0% |
| brand_name | tesseract-full-page | 1 | 18 | 5.3% |
| brand_name | vlm-role-resolution | 20 | 3 | 87.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 7 | 36.4% |
| flavour | text-layer-flattened | 11 | 15 | 42.3% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 7 | 16 | 30.4% |
| product_name | tesseract-full-page | 0 | 6 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 11 | 0.0% |
| product_name | vlm-role-resolution | 2 | 13 | 13.3% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **56.4%** (fuzzy/normalized — the 80% target) / 48.0% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 22 | 23 | 20 | 2 | 51.1% |
| product_name | 2 | 13 | 24 | 8 | 28.9% |
| flavour | 20 | 28 | 14 | 3 | 62.2% |
| claims | 196 | 202 | 37 | 150 | 51.9% |
| nutrition_table | 189 | 262 | 39 | 167 | 56.0% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 280 | 317 | 21 | 216 | 57.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 19 | 20 | 22 | 3 | 44.4% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.4%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| colour_theme | 34 | 28 | 53 | 29.6% |
| layout | 0 | 0 | 45 | 0.0% |
| logo | 12 | 0 | 33 | 26.7% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-20 06:09 UTC — mode `pipeline (vlm on, masters on)` — 5b797ee

**45 labels, 2129 fields scored.** Overall accuracy: **44.2%** (942 correct / 380 wrong / 807 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 22 | 21 | 2 | 48.9% |
| product_name | 2 | 35 | 8 | 4.4% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 20 | 22 | 3 | 44.4% |
| claims | 196 | 43 | 156 | 49.6% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 189 | 112 | 187 | 38.7% |
| fssai_number | 30 | 7 | 8 | 66.7% |
| ingredients | 280 | 58 | 253 | 47.4% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 29 | 4 | 12 | 64.4% |
| package_size | 21 | 21 | 3 | 46.7% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | master-snap | 1 | 0 | 100.0% |
| brand_name | tesseract-full-page | 1 | 18 | 5.3% |
| brand_name | vlm-role-resolution | 20 | 3 | 87.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 7 | 36.4% |
| flavour | text-layer-flattened | 11 | 15 | 42.3% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 9 | 14 | 39.1% |
| product_name | tesseract-full-page | 0 | 6 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 11 | 0.0% |
| product_name | vlm-role-resolution | 2 | 13 | 13.3% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **56.5%** (fuzzy/normalized — the 80% target) / 48.1% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 22 | 23 | 20 | 2 | 51.1% |
| product_name | 2 | 13 | 24 | 8 | 28.9% |
| flavour | 20 | 28 | 14 | 3 | 62.2% |
| claims | 196 | 202 | 37 | 150 | 51.9% |
| nutrition_table | 189 | 262 | 39 | 167 | 56.0% |
| fssai_number | 30 | 33 | 4 | 8 | 73.3% |
| ingredients | 280 | 317 | 21 | 216 | 57.2% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 29 | 31 | 2 | 12 | 68.9% |
| package_size | 21 | 22 | 20 | 3 | 48.9% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.4%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| colour_theme | 34 | 28 | 53 | 29.6% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-19 20:06 UTC — mode `pipeline (vlm on, masters on)` — 2f68c15

**5 labels, 241 fields scored.** Overall accuracy: **51.5%** (124 correct / 58 wrong / 59 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 3 | 1 | 1 | 60.0% |
| product_name | 1 | 2 | 2 | 20.0% |
| colour_theme | 4 | 2 | 6 | 33.3% |
| flavour | 2 | 3 | 0 | 40.0% |
| claims | 24 | 14 | 9 | 51.1% |
| logo | 1 | 0 | 4 | 20.0% |
| layout | 0 | 0 | 5 | 0.0% |
| nutrition_table | 32 | 12 | 15 | 54.2% |
| fssai_number | 2 | 2 | 1 | 40.0% |
| ingredients | 37 | 11 | 15 | 58.7% |
| marketing_company | 2 | 3 | 0 | 40.0% |
| address | 2 | 3 | 0 | 40.0% |
| customer_care_number | 4 | 1 | 0 | 80.0% |
| customer_care_email | 4 | 0 | 1 | 80.0% |
| package_size | 1 | 4 | 0 | 20.0% |
| manufacturing_company | 5 | 0 | 0 | 100.0% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 0 | 2 | 0.0% |
| address | text-layer-flattened | 2 | 0 | 100.0% |
| brand_name | tesseract-full-page | 0 | 1 | 0.0% |
| brand_name | vlm-role-resolution | 3 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 2 | 0 | 100.0% |
| customer_care_email | text-layer-flattened | 2 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 2 | 1 | 66.7% |
| customer_care_number | text-layer-flattened | 2 | 0 | 100.0% |
| flavour | tesseract-full-page | 0 | 1 | 0.0% |
| flavour | text-layer-flattened | 2 | 2 | 50.0% |
| fssai_number | tesseract-full-page | 0 | 2 | 0.0% |
| fssai_number | text-layer-flattened | 2 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 1 | 0.0% |
| marketing_company | tesseract-region-ocr | 0 | 2 | 0.0% |
| marketing_company | text-layer-flattened | 2 | 0 | 100.0% |
| package_size | tesseract-full-page | 1 | 0 | 100.0% |
| package_size | text-layer-flattened | 0 | 4 | 0.0% |
| product_name | text-layer-flattened | 0 | 2 | 0.0% |
| product_name | vlm-role-resolution | 1 | 0 | 100.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **69.4%** (fuzzy/normalized — the 80% target) / 57.8% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 3 | 3 | 1 | 1 | 60.0% |
| product_name | 1 | 1 | 2 | 2 | 20.0% |
| flavour | 2 | 2 | 3 | 0 | 40.0% |
| claims | 24 | 26 | 12 | 7 | 57.8% |
| nutrition_table | 32 | 43 | 1 | 10 | 79.6% |
| fssai_number | 2 | 4 | 0 | 1 | 80.0% |
| ingredients | 37 | 43 | 5 | 9 | 75.4% |
| marketing_company | 2 | 3 | 2 | 0 | 60.0% |
| address | 2 | 3 | 2 | 0 | 60.0% |
| customer_care_number | 4 | 5 | 0 | 0 | 100.0% |
| customer_care_email | 4 | 4 | 0 | 1 | 80.0% |
| package_size | 1 | 1 | 4 | 0 | 20.0% |
| manufacturing_company | 5 | 5 | 0 | 0 | 100.0% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.7%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| colour_theme | 4 | 2 | 6 | 33.3% |
| logo | 1 | 0 | 4 | 20.0% |
| layout | 0 | 0 | 5 | 0.0% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| logo | 0 | 1 | 0.0% |

## 2026-09-19 20:09 UTC — mode `pipeline (vlm on, masters on)` — 2f68c15

**5 labels, 241 fields scored.** Overall accuracy: **52.3%** (126 correct / 57 wrong / 58 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 5 | 0 | 0 | 100.0% |
| product_name | 1 | 2 | 2 | 20.0% |
| colour_theme | 4 | 2 | 6 | 33.3% |
| flavour | 2 | 3 | 0 | 40.0% |
| claims | 24 | 14 | 9 | 51.1% |
| logo | 1 | 0 | 4 | 20.0% |
| layout | 0 | 0 | 5 | 0.0% |
| nutrition_table | 32 | 12 | 15 | 54.2% |
| fssai_number | 2 | 2 | 1 | 40.0% |
| ingredients | 37 | 11 | 15 | 58.7% |
| marketing_company | 2 | 3 | 0 | 40.0% |
| address | 2 | 3 | 0 | 40.0% |
| customer_care_number | 4 | 1 | 0 | 80.0% |
| customer_care_email | 4 | 0 | 1 | 80.0% |
| package_size | 1 | 4 | 0 | 20.0% |
| manufacturing_company | 5 | 0 | 0 | 100.0% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 0 | 2 | 0.0% |
| address | text-layer-flattened | 2 | 0 | 100.0% |
| brand_name | vlm-role-resolution | 5 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 2 | 0 | 100.0% |
| customer_care_email | text-layer-flattened | 2 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 2 | 1 | 66.7% |
| customer_care_number | text-layer-flattened | 2 | 0 | 100.0% |
| flavour | tesseract-full-page | 0 | 1 | 0.0% |
| flavour | text-layer-flattened | 2 | 2 | 50.0% |
| fssai_number | tesseract-full-page | 0 | 2 | 0.0% |
| fssai_number | text-layer-flattened | 2 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 1 | 0.0% |
| marketing_company | tesseract-region-ocr | 0 | 2 | 0.0% |
| marketing_company | text-layer-flattened | 2 | 0 | 100.0% |
| package_size | tesseract-full-page | 1 | 0 | 100.0% |
| package_size | text-layer-flattened | 0 | 4 | 0.0% |
| product_name | text-layer-flattened | 0 | 1 | 0.0% |
| product_name | vlm-role-resolution | 1 | 1 | 50.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **70.4%** (fuzzy/normalized — the 80% target) / 58.7% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 5 | 5 | 0 | 0 | 100.0% |
| product_name | 1 | 1 | 2 | 2 | 20.0% |
| flavour | 2 | 2 | 3 | 0 | 40.0% |
| claims | 24 | 26 | 12 | 7 | 57.8% |
| nutrition_table | 32 | 43 | 1 | 10 | 79.6% |
| fssai_number | 2 | 4 | 0 | 1 | 80.0% |
| ingredients | 37 | 43 | 5 | 9 | 75.4% |
| marketing_company | 2 | 3 | 2 | 0 | 60.0% |
| address | 2 | 3 | 2 | 0 | 60.0% |
| customer_care_number | 4 | 5 | 0 | 0 | 100.0% |
| customer_care_email | 4 | 4 | 0 | 1 | 80.0% |
| package_size | 1 | 1 | 4 | 0 | 20.0% |
| manufacturing_company | 5 | 5 | 0 | 0 | 100.0% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.7%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| colour_theme | 4 | 2 | 6 | 33.3% |
| layout | 0 | 0 | 5 | 0.0% |
| logo | 1 | 0 | 4 | 20.0% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| logo | 0 | 1 | 0.0% |

## 2026-09-19 20:12 UTC — mode `pipeline (vlm on, masters on)` — 2f68c15

**5 labels, 241 fields scored.** Overall accuracy: **51.5%** (124 correct / 58 wrong / 59 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 3 | 1 | 1 | 60.0% |
| product_name | 1 | 2 | 2 | 20.0% |
| colour_theme | 4 | 2 | 6 | 33.3% |
| flavour | 2 | 3 | 0 | 40.0% |
| claims | 24 | 14 | 9 | 51.1% |
| logo | 1 | 0 | 4 | 20.0% |
| layout | 0 | 0 | 5 | 0.0% |
| nutrition_table | 32 | 12 | 15 | 54.2% |
| fssai_number | 2 | 2 | 1 | 40.0% |
| ingredients | 37 | 11 | 15 | 58.7% |
| marketing_company | 2 | 3 | 0 | 40.0% |
| address | 2 | 3 | 0 | 40.0% |
| customer_care_number | 4 | 1 | 0 | 80.0% |
| customer_care_email | 4 | 0 | 1 | 80.0% |
| package_size | 1 | 4 | 0 | 20.0% |
| manufacturing_company | 5 | 0 | 0 | 100.0% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 0 | 2 | 0.0% |
| address | text-layer-flattened | 2 | 0 | 100.0% |
| brand_name | tesseract-full-page | 0 | 1 | 0.0% |
| brand_name | vlm-role-resolution | 3 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 2 | 0 | 100.0% |
| customer_care_email | text-layer-flattened | 2 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 2 | 1 | 66.7% |
| customer_care_number | text-layer-flattened | 2 | 0 | 100.0% |
| flavour | tesseract-full-page | 0 | 1 | 0.0% |
| flavour | text-layer-flattened | 2 | 2 | 50.0% |
| fssai_number | tesseract-full-page | 0 | 2 | 0.0% |
| fssai_number | text-layer-flattened | 2 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 1 | 0.0% |
| marketing_company | tesseract-region-ocr | 0 | 2 | 0.0% |
| marketing_company | text-layer-flattened | 2 | 0 | 100.0% |
| package_size | tesseract-full-page | 1 | 0 | 100.0% |
| package_size | text-layer-flattened | 0 | 4 | 0.0% |
| product_name | text-layer-flattened | 0 | 2 | 0.0% |
| product_name | vlm-role-resolution | 1 | 0 | 100.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **69.4%** (fuzzy/normalized — the 80% target) / 57.8% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 3 | 3 | 1 | 1 | 60.0% |
| product_name | 1 | 1 | 2 | 2 | 20.0% |
| flavour | 2 | 2 | 3 | 0 | 40.0% |
| claims | 24 | 26 | 12 | 7 | 57.8% |
| nutrition_table | 32 | 43 | 1 | 10 | 79.6% |
| fssai_number | 2 | 4 | 0 | 1 | 80.0% |
| ingredients | 37 | 43 | 5 | 9 | 75.4% |
| marketing_company | 2 | 3 | 2 | 0 | 60.0% |
| address | 2 | 3 | 2 | 0 | 60.0% |
| customer_care_number | 4 | 5 | 0 | 0 | 100.0% |
| customer_care_email | 4 | 4 | 0 | 1 | 80.0% |
| package_size | 1 | 1 | 4 | 0 | 20.0% |
| manufacturing_company | 5 | 5 | 0 | 0 | 100.0% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.7%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| layout | 0 | 0 | 5 | 0.0% |
| colour_theme | 4 | 2 | 6 | 33.3% |
| logo | 1 | 0 | 4 | 20.0% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| logo | 0 | 1 | 0.0% |

## Ceiling — 2026-09-20, `ac060e7` (accuracy2 Step 1)

**Not an accuracy row.** This is the output of `eval/ceiling.py` run against `eval/runs/pipeline-vlm-off.json` (45 real labels) and the strip-based, PP-OCR text dump `dump-readable-text.ts` produces (0/90/270 degree rotation passes, 2x upscale when the median line height is below 32px, every page) — a MORE capable PP-OCR reader than the one wired into production at the time this ceiling was measured (`scanPageWithPpOcr`: page 1 only, no rotation, no upscale rule). It answers one question: of every cell the pipeline got WRONG or MISSING, how many are actually readable by *some* machine reader (the PDF text layer, Tesseract, or this PP-OCR reader), and how many aren't readable at all no matter what reads the page.

Per-field gap/readability breakdown (`gap` = wrong+missing cells for that field; `text-layer`/`tesseract`/`ppocr` = how many of those gap cells that specific reader can find the expected value in; `any` = found by at least one reader; `none` = not found by any reader):

| field | gap | text-layer | tesseract | ppocr | any | none | any% |
|---|---|---|---|---|---|---|---|
| nutrition_table | 308 | 93 | 35 | 159 | 185 | 123 | 60.1% |
| ingredients | 262 | 73 | 153 | 181 | 227 | 35 | 86.6% |
| claims | 249 | 81 | 93 | 112 | 161 | 88 | 64.7% |
| brand_name | 43 | 10 | 12 | 31 | 36 | 7 | 83.7% |
| product_name | 39 | 14 | 9 | 8 | 20 | 19 | 51.3% |
| package_size | 25 | 5 | 5 | 7 | 8 | 17 | 32.0% |
| address | 24 | 0 | 0 | 0 | 0 | 24 | 0.0% |
| marketing_company | 18 | 2 | 10 | 10 | 14 | 4 | 77.8% |
| flavour | 17 | 2 | 2 | 4 | 4 | 13 | 23.5% |
| customer_care_number | 15 | 2 | 3 | 5 | 8 | 7 | 53.3% |
| customer_care_email | 14 | 0 | 1 | 9 | 9 | 5 | 64.3% |
| fssai_number | 12 | 3 | 4 | 9 | 11 | 1 | 91.7% |
| **TOTAL** | **1026** | **285** | **327** | **535** | **683** | **343** | **66.6%** |

Current fuzzy (new metric, text fields, at `ac060e7`): 881/1847 = 47.7%.
**CEILING if every present-in-any-reader cell were recovered: 1564/1847 = 84.7%.**

Exact for the 9 scalar fields (a cell already fuzzy-correct despite a strict "wrong" verdict is excluded from the gap so it isn't double-counted). `claims`/`ingredients`/`nutrition_table` use the strict gap unadjusted, since their fuzzy match is cross-item bipartite matching this script doesn't replicate — their true ceiling is very slightly LOWER than shown here, not higher.

**Whole-field-missing labels** (the entire field came back empty on that label, of labels with ≥3 gap cells for that field):

- `nutrition_table`: 6 whole-missing, 26 partial-missing
  - `Calcimax Pack 30 IRN168-2.pdf`
  - `Calcimax pack 60 IRN169-2.pdf`
  - `Final New-Calcimax 30 Pack 16.02.26  .pdf`
  - `Final New-Calcimax 6 Pack 16.02.26  .pdf`
  - `LXIR Shilajit gummy VF IRN18-1.pdf`
  - `Novocal Kid 19-10-2024 (3).jpg`
- `ingredients`: 1 whole-missing, 11 partial-missing
  - `LXIR Shilajit gummy VF IRN18-1.pdf`
- `claims`: 2 whole-missing, 23 partial-missing
  - `Derocal IRN177-1.pdf`
  - `LXIR Shilajit gummy VF IRN18-1.pdf`

## 2026-09-20 13:38 UTC — mode `pipeline (vlm off, masters on)` — 84b3695

**45 labels, 2136 fields scored.** Overall accuracy: **43.0%** (918 correct / 394 wrong / 824 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 2 | 25 | 18 | 4.4% |
| product_name | 0 | 30 | 15 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 19 | 24 | 2 | 42.2% |
| claims | 198 | 44 | 154 | 50.0% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 174 | 109 | 210 | 35.3% |
| fssai_number | 33 | 8 | 4 | 73.3% |
| ingredients | 282 | 59 | 251 | 47.6% |
| marketing_company | 20 | 16 | 9 | 44.4% |
| address | 19 | 13 | 13 | 42.2% |
| customer_care_number | 24 | 11 | 10 | 53.3% |
| customer_care_email | 35 | 4 | 6 | 77.8% |
| package_size | 22 | 22 | 1 | 48.9% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | ppocr-text | 0 | 3 | 0.0% |
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | master-snap | 1 | 0 | 100.0% |
| brand_name | tesseract-full-page | 1 | 25 | 3.8% |
| customer_care_email | ppocr-text | 6 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | ppocr-text | 0 | 3 | 0.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | ppocr-text | 0 | 2 | 0.0% |
| flavour | tesseract-full-page | 4 | 7 | 36.4% |
| flavour | text-layer-flattened | 11 | 15 | 42.3% |
| fssai_number | ppocr-text | 3 | 1 | 75.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | ppocr-text | 0 | 6 | 0.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | ppocr-text | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 9 | 14 | 39.1% |
| product_name | tesseract-full-page | 0 | 8 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 17 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **54.3%** (fuzzy/normalized — the 80% target) / 46.6% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 2 | 2 | 25 | 18 | 4.4% |
| product_name | 0 | 5 | 25 | 15 | 11.1% |
| flavour | 19 | 28 | 15 | 2 | 62.2% |
| claims | 198 | 204 | 38 | 148 | 52.3% |
| nutrition_table | 174 | 238 | 45 | 190 | 50.3% |
| fssai_number | 33 | 36 | 5 | 4 | 80.0% |
| ingredients | 282 | 317 | 24 | 216 | 56.9% |
| marketing_company | 20 | 28 | 8 | 9 | 62.2% |
| address | 19 | 21 | 11 | 13 | 46.7% |
| customer_care_number | 24 | 33 | 2 | 10 | 73.3% |
| customer_care_email | 35 | 37 | 2 | 6 | 82.2% |
| package_size | 22 | 23 | 21 | 1 | 51.1% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.4%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| logo | 12 | 0 | 33 | 26.7% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| layout | 0 | 0 | 45 | 0.0% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 3 | 7 | 42.9% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-20 19:03 UTC — mode `pipeline (vlm off, masters on)` — 9d73c8c

**45 labels, 2148 fields scored.** Overall accuracy: **42.8%** (920 correct / 392 wrong / 836 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 2 | 25 | 18 | 4.4% |
| product_name | 0 | 30 | 15 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 20 | 22 | 3 | 44.4% |
| claims | 199 | 44 | 153 | 50.3% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 174 | 109 | 210 | 35.3% |
| fssai_number | 34 | 8 | 3 | 75.6% |
| ingredients | 280 | 71 | 253 | 46.4% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 36 | 4 | 5 | 80.0% |
| package_size | 22 | 22 | 1 | 48.9% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | master-snap | 1 | 0 | 100.0% |
| brand_name | tesseract-full-page | 1 | 25 | 3.8% |
| customer_care_email | ppocr-text | 7 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 7 | 36.4% |
| flavour | text-layer-flattened | 11 | 15 | 42.3% |
| fssai_number | ppocr-text | 4 | 1 | 80.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | ppocr-text | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 9 | 14 | 39.1% |
| product_name | tesseract-full-page | 0 | 8 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 17 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **52.8%** (fuzzy/normalized — the 80% target) / 45.7% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 2 | 2 | 25 | 18 | 4.4% |
| product_name | 0 | 5 | 25 | 15 | 11.1% |
| flavour | 20 | 28 | 14 | 3 | 62.2% |
| claims | 199 | 205 | 38 | 147 | 52.6% |
| nutrition_table | 174 | 238 | 45 | 190 | 50.3% |
| fssai_number | 34 | 37 | 5 | 3 | 82.2% |
| ingredients | 280 | 312 | 66 | 221 | 52.1% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 36 | 38 | 2 | 5 | 84.4% |
| package_size | 22 | 23 | 21 | 1 | 51.1% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.4%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| layout | 0 | 0 | 45 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| logo | 12 | 0 | 33 | 26.7% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-20 19:45 UTC — mode `pipeline (vlm off, masters on)` — 564be0e

**45 labels, 2148 fields scored.** Overall accuracy: **42.8%** (920 correct / 392 wrong / 836 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 2 | 25 | 18 | 4.4% |
| product_name | 0 | 30 | 15 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 20 | 22 | 3 | 44.4% |
| claims | 199 | 44 | 153 | 50.3% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 174 | 109 | 210 | 35.3% |
| fssai_number | 34 | 8 | 3 | 75.6% |
| ingredients | 280 | 71 | 253 | 46.4% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 36 | 4 | 5 | 80.0% |
| package_size | 22 | 22 | 1 | 48.9% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | master-snap | 1 | 0 | 100.0% |
| brand_name | tesseract-full-page | 1 | 25 | 3.8% |
| customer_care_email | ppocr-text | 7 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 4 | 7 | 36.4% |
| flavour | text-layer-flattened | 11 | 15 | 42.3% |
| fssai_number | ppocr-text | 4 | 1 | 80.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | ppocr-text | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 9 | 14 | 39.1% |
| product_name | tesseract-full-page | 0 | 8 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 17 | 0.0% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **52.8%** (fuzzy/normalized — the 80% target) / 45.7% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 2 | 2 | 25 | 18 | 4.4% |
| product_name | 0 | 5 | 25 | 15 | 11.1% |
| flavour | 20 | 28 | 14 | 3 | 62.2% |
| claims | 199 | 205 | 38 | 147 | 52.6% |
| nutrition_table | 174 | 238 | 45 | 190 | 50.3% |
| fssai_number | 34 | 37 | 5 | 3 | 82.2% |
| ingredients | 280 | 312 | 66 | 221 | 52.1% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 36 | 38 | 2 | 5 | 84.4% |
| package_size | 22 | 23 | 21 | 1 | 51.1% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.4%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| layout | 0 | 0 | 45 | 0.0% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| logo | 12 | 0 | 33 | 26.7% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']

## 2026-09-21 09:08 UTC — mode `pipeline (vlm on, masters on)` — dde3652

**45 labels, 2172 fields scored.** Overall accuracy: **44.6%** (968 correct / 424 wrong / 780 missing)

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| brand_name | 20 | 21 | 4 | 44.4% |
| product_name | 2 | 35 | 8 | 4.4% |
| colour_theme | 34 | 28 | 53 | 29.6% |
| flavour | 23 | 19 | 3 | 51.1% |
| claims | 202 | 35 | 150 | 52.2% |
| logo | 12 | 0 | 33 | 26.7% |
| layout | 0 | 0 | 45 | 0.0% |
| nutrition_table | 188 | 120 | 186 | 38.1% |
| fssai_number | 34 | 8 | 3 | 75.6% |
| ingredients | 288 | 103 | 245 | 45.3% |
| marketing_company | 20 | 10 | 15 | 44.4% |
| address | 19 | 10 | 16 | 42.2% |
| customer_care_number | 24 | 8 | 13 | 53.3% |
| customer_care_email | 36 | 4 | 5 | 80.0% |
| package_size | 22 | 22 | 1 | 48.9% |
| manufacturing_company | 44 | 1 | 0 | 97.8% |

**Accuracy by source** (which pass produced each field's value — a source with more wrong than correct is actively hurting that field and is a candidate to gate off; MISSING cells have no source and aren't counted here):
| field | source | correct | wrong | accuracy |
|---|---|---|---|---|
| address | tesseract-full-page | 0 | 1 | 0.0% |
| address | tesseract-region-ocr | 4 | 5 | 44.4% |
| address | text-layer-flattened | 14 | 4 | 77.8% |
| brand_name | master-snap | 1 | 0 | 100.0% |
| brand_name | tesseract-full-page | 1 | 17 | 5.6% |
| brand_name | vlm-role-resolution | 18 | 4 | 81.8% |
| customer_care_email | ppocr-text | 7 | 0 | 100.0% |
| customer_care_email | tesseract-full-page | 7 | 4 | 63.6% |
| customer_care_email | text-layer-flattened | 20 | 0 | 100.0% |
| customer_care_number | tesseract-full-page | 6 | 6 | 50.0% |
| customer_care_number | text-layer-flattened | 16 | 2 | 88.9% |
| flavour | tesseract-full-page | 5 | 6 | 45.5% |
| flavour | text-layer-flattened | 13 | 13 | 50.0% |
| fssai_number | ppocr-text | 4 | 1 | 80.0% |
| fssai_number | tesseract-full-page | 5 | 5 | 50.0% |
| fssai_number | text-layer-flattened | 15 | 2 | 88.2% |
| fssai_number | text-layer-reading-order | 4 | 0 | 100.0% |
| marketing_company | tesseract-full-page | 0 | 2 | 0.0% |
| marketing_company | tesseract-region-ocr | 1 | 8 | 11.1% |
| marketing_company | text-layer-flattened | 18 | 0 | 100.0% |
| package_size | package-size-ocr | 1 | 1 | 50.0% |
| package_size | ppocr-text | 1 | 1 | 50.0% |
| package_size | tesseract-full-page | 10 | 6 | 62.5% |
| package_size | text-layer-flattened | 9 | 14 | 39.1% |
| product_name | tesseract-full-page | 0 | 7 | 0.0% |
| product_name | tesseract-title-region | 0 | 5 | 0.0% |
| product_name | text-layer-flattened | 0 | 10 | 0.0% |
| product_name | vlm-role-resolution | 2 | 13 | 13.3% |

**New metric — text fields only** (13 fields; logo/layout/colour_theme are scored separately below, per the brief comparing them as images, not text). Accuracy: **55.6%** (fuzzy/normalized — the 80% target) / 47.6% (strict, for comparison to the row above)

| field | correct (strict) | correct (fuzzy) | wrong | missing | accuracy (fuzzy) |
|---|---|---|---|---|---|
| brand_name | 20 | 21 | 20 | 4 | 46.7% |
| product_name | 2 | 10 | 27 | 8 | 22.2% |
| flavour | 23 | 34 | 8 | 3 | 75.6% |
| claims | 202 | 205 | 32 | 147 | 53.4% |
| nutrition_table | 188 | 263 | 45 | 165 | 55.6% |
| fssai_number | 34 | 37 | 5 | 3 | 82.2% |
| ingredients | 288 | 323 | 95 | 210 | 51.4% |
| marketing_company | 20 | 26 | 4 | 15 | 57.8% |
| address | 19 | 21 | 8 | 16 | 46.7% |
| customer_care_number | 24 | 30 | 2 | 13 | 66.7% |
| customer_care_email | 36 | 38 | 2 | 5 | 84.4% |
| package_size | 22 | 23 | 21 | 1 | 51.1% |
| manufacturing_company | 44 | 44 | 1 | 0 | 97.8% |

**Visual fields** (logo, layout, colour_theme — compared as images per the brief §9, not part of the 80% text target; strict matching only): 22.4%

| field | correct | wrong | missing | accuracy |
|---|---|---|---|---|
| layout | 0 | 0 | 45 | 0.0% |
| logo | 12 | 0 | 33 | 26.7% |
| colour_theme | 34 | 28 | 53 | 29.6% |

**Fabrication rate** (predicted a value for a field the label genuinely doesn't have one for — must never go up in exchange for accuracy):
| field | fabricated | opportunities | rate |
|---|---|---|---|
| manufacturing_company | 1 | 1 | 100.0% |
| flavour | 2 | 7 | 28.6% |
| claims | 0 | 1 | 0.0% |
| logo | 0 | 12 | 0.0% |
| nutrition_table | 0 | 1 | 0.0% |
| fssai_number | 0 | 6 | 0.0% |
| ingredients | 0 | 1 | 0.0% |
| marketing_company | 0 | 1 | 0.0% |
| address | 0 | 1 | 0.0% |
| customer_care_number | 0 | 2 | 0.0% |
| customer_care_email | 0 | 2 | 0.0% |
| package_size | 0 | 1 | 0.0% |

**Ground-truth conflicts found** (a field printed differently on two pages of the same label — resolved by keeping the first page's value; worth a human look):
- `AM7 GUMMIES - ORANGE  FLAVOUR (2).pdf` — layout: ['Carton (flattened, front and back content together)', 'Circular cap face']
- `Chawan VF IRN138-1 (1).pdf` — logo: ['Small orange leaf icon above the Chewvit wordmark', 'Small leaf icon above the Chewvit wordmark']
- `Chawan VF IRN138-1 (1).pdf` — layout: ['Carton', 'Carton (spot-UV/foil separation proof)']
- `Dr. Chewitals Vision IRN13-1.pdf` — layout: ['Wraparound bottle/pouch label', 'Circular cap face (top); blank base template']
- `Final New-Calcimax 30 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `Final New-Calcimax 6 Pack 16.02.26  .pdf` — layout: ['Carton (flattened die-line proof, front + side + back panels)', 'Carton (die-line/emboss proof)', 'Carton (spot-UV proof)']
- `HSN VF IRN75-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `Iron VF IRN74-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
- `LXIR Shilajit gummy VF IRN18-1.pdf` — layout: ['Bottle label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `LXIR Shilajit STICK VF IRN19-1.pdf` — layout: ['Sachet/stick box label (wraparound + cap circles)', 'Blank die-line/dimension template']
- `PMS VF IRN71-1.pdf` — layout: ['Bottle label (jar cap circles + wraparound body label)', 'UV varnish separation proof']
