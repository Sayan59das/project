// Colour Theme extraction — one of the six label parameters OCR cannot reach.
//
// Runs entirely on this machine with no model and no network: `sharp` (already
// a dependency, used by imagePreprocessing.service.ts) downsamples the label,
// every pixel is classified into a named colour, and the theme is the one or
// two chromatic colours that actually cover the label.
//
// WHY NOT A VISION MODEL
// ---------------------------------------------------------------------
// Asking a model to describe a label's colours returns prose, and the
// comparison engine then string-compares two pieces of prose. "Green & Orange"
// and "Orange and green tones" describe the same label and compare as a
// CONFLICT. Counting pixels gives the same answer every time, needs no GPU, and
// hands a QA reviewer coverage percentages and hex swatches they can check
// against the artwork — which prose cannot do.
//
// WHAT IT DELIBERATELY DOES NOT CLAIM
// ---------------------------------------------------------------------
// The seed data contains 'Green & Orange gradient'. Coverage counting cannot
// tell a gradient from two flat blocks of the same two colours, so this never
// writes the word "gradient" — inventing it would be a guess dressed as a
// reading. It reports the colours it can defend and leaves the rest absent.

import sharp from 'sharp';

/** One named colour and how much of the label it covers. */
export type PaletteEntry = {
  name: string;
  /** Representative colour of everything classified under `name`, as '#rrggbb'. */
  hex: string;
  /** Share of sampled pixels, 0-1. */
  coverage: number;
};

export type ColourThemeResult = {
  /**
   * The theme as the comparison engine stores it, e.g. 'Green & Orange'.
   *
   * '' when the label has no defensible chromatic identity (a plain
   * black-on-white insert). Absent, never a placeholder — the database stores
   * NULL and the comparison reports MISSING rather than matching one unknown
   * against another.
   */
  theme: string;
  /** Every colour found, most coverage first. The reviewer's audit trail. */
  palette: PaletteEntry[];
};

// Pixels are classified, not clustered. k-means would return cluster centroids
// that need naming anyway, and its output moves between runs on the same image
// — unacceptable when the value is stored as a compliance record. Hue bands
// with explicit achromatic cutoffs are reproducible and a reviewer can be told
// exactly why a pixel counted as Orange.
const HUE_BANDS: readonly { name: string; from: number; to: number }[] = [
  { name: 'Red', from: 345, to: 360 },
  { name: 'Red', from: 0, to: 15 },
  { name: 'Orange', from: 15, to: 45 },
  { name: 'Yellow', from: 45, to: 70 },
  { name: 'Green', from: 70, to: 165 },
  { name: 'Teal', from: 165, to: 195 },
  { name: 'Blue', from: 195, to: 255 },
  { name: 'Purple', from: 255, to: 290 },
  { name: 'Pink', from: 290, to: 345 }
];

// Sampling grid. 128x128 is ~16k pixels — enough that a 2% accent band is
// dozens of pixels rather than noise, and small enough to classify in
// milliseconds. Larger grids change the percentages by fractions.
const SAMPLE_EDGE = 128;

// A colour has to cover this much of the label before it is part of the theme.
// Below it lies text, thin rules, barcode fringing and JPEG artefacts around
// high-contrast edges — real pixels, but not what anyone means by the label's
// colour.
const MIN_THEME_COVERAGE = 0.04;

// At most two colours are named. Reviewers describe labels as "Green & Orange",
// not as a five-way split, and a third colour is almost always packaging
// photography or a product shot rather than the label's scheme.
const MAX_THEME_COLOURS = 2;

type Hsl = { h: number; s: number; l: number };

function toHsl(r: number, g: number, b: number): Hsl {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));

  let h: number;
  if (max === red) h = ((green - blue) / delta) % 6;
  else if (max === green) h = (blue - red) / delta + 2;
  else h = (red - green) / delta + 4;

  h *= 60;
  if (h < 0) h += 360;

  return { h, s, l };
}

/**
 * The name for one pixel.
 *
 * Achromatic cases are decided before hue is consulted, because hue is
 * meaningless at low saturation — a near-white pixel has a hue, and trusting it
 * is how a white label acquires a colour scheme it does not have.
 */
function classify({ h, s, l }: Hsl): string {
  if (l >= 0.9 && s < 0.2) return 'White';
  if (l <= 0.12) return 'Black';
  if (s < 0.12) return 'Grey';

  // Cream/beige: the off-white of uncoated stock and ayurvedic packaging. A
  // warm hue this pale is not "Yellow" to anyone looking at the label.
  if (l >= 0.8 && s < 0.35 && h >= 20 && h < 70) return 'Cream';

  // Brown before the hue bands: a dark, warm, moderately saturated pixel is
  // brown, and calling Chyawanprash packaging "Orange" would be wrong.
  if (l < 0.42 && h >= 10 && h < 50) return 'Brown';

  const band = HUE_BANDS.find((candidate) => h >= candidate.from && h < candidate.to);
  return band ? band.name : 'Grey';
}

const ACHROMATIC = new Set(['White', 'Black', 'Grey', 'Cream']);

function toHex(r: number, g: number, b: number): string {
  const part = (value: number) => Math.round(value).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/**
 * Reads the colour theme off a label image.
 *
 * Accepts anything sharp decodes (PNG, JPEG, WebP, TIFF). For a PDF label,
 * rasterise a page first (pdf.service.rasterizePdfPages) and pass the page
 * image — this deliberately knows nothing about document formats.
 *
 * Throws for an undecodable buffer rather than returning an empty theme: a
 * corrupt file is a different problem from a label with no colour scheme, and
 * the caller has to be able to tell them apart.
 */
export async function extractColourTheme(imageBuffer: Buffer): Promise<ColourThemeResult> {
  const { data, info } = await sharp(imageBuffer, { failOn: 'none' })
    // flatten() composites transparency onto white, the colour a label is
    // printed on. Without it, transparent PNG regions arrive as black and a
    // label picks up a scheme from its own background.
    .flatten({ background: '#ffffff' })
    .resize(SAMPLE_EDGE, SAMPLE_EDGE, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const totals = new Map<string, { count: number; r: number; g: number; b: number }>();
  let sampled = 0;

  for (let offset = 0; offset + channels <= data.length; offset += channels) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];

    const name = classify(toHsl(r, g, b));
    const entry = totals.get(name) ?? { count: 0, r: 0, g: 0, b: 0 };
    entry.count += 1;
    entry.r += r;
    entry.g += g;
    entry.b += b;
    totals.set(name, entry);
    sampled += 1;
  }

  if (sampled === 0) {
    return { theme: '', palette: [] };
  }

  const palette: PaletteEntry[] = [...totals.entries()]
    .map(([name, entry]) => ({
      name,
      // The mean of everything under this name — a swatch a reviewer can hold
      // against the artwork, not one arbitrarily chosen pixel.
      hex: toHex(entry.r / entry.count, entry.g / entry.count, entry.b / entry.count),
      coverage: entry.count / sampled
    }))
    .sort((first, second) => second.coverage - first.coverage);

  const theme = palette
    .filter((entry) => !ACHROMATIC.has(entry.name) && entry.coverage >= MIN_THEME_COVERAGE)
    .slice(0, MAX_THEME_COLOURS)
    .map((entry) => entry.name)
    .join(' & ');

  return { theme, palette };
}
