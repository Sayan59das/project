# Extraction accuracy — RESULTS

The only source of truth for extraction accuracy numbers on this project. Every row here was written by `eval/score.py`; if a number isn't here, it isn't verified — don't quote it.

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
