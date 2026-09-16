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
