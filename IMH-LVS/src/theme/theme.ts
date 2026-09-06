import { createTheme, type Theme } from '@mui/material/styles';

export type ColorMode = 'light' | 'dark';

// Centralized grey hierarchy — the only neutral text/border/surface colors
// used across the app. Darker = higher emphasis.
//
// These are the LIGHT-mode values. Components should not import them
// directly — reference the CSS custom properties in src/index.css instead
// (var(--c-text-1), var(--c-border), …), which resolve to the correct value
// for whichever mode is active. They are kept exported for backwards
// compatibility and because the MUI palette below needs real hex values.
export const GREY_1_HEADING = '#2E3135'; // main headings, primary/high-emphasis text
export const GREY_2_SUBHEADING = '#6B7177'; // sub-headings, labels, medium-emphasis text
export const GREY_3_BODY = '#9EA4AB'; // body/supporting text, metadata, secondary icons
export const GREY_4_BORDER = '#D8DDE3'; // borders, dividers, disabled elements
export const GREY_5_SURFACE = '#EEF1F4'; // subtle backgrounds, hover states, empty states

// MUI runs augmentColor() over palette entries — it calls lighten()/darken()
// on them to derive .light/.dark variants. Those helpers parse the string as
// a real colour, so a `var(--c-orange)` here would throw. The palette
// therefore carries literal hex per mode.
//
// IMPORTANT: these values mirror the tokens in src/index.css. If you change
// a colour, change it in BOTH places — index.css drives everything rendered
// via `sx`/`color` props, this drives MUI's own component internals.
const PALETTE = {
  light: {
    orange: '#E26737',
    green: '#00A651',
    warn: '#F2B400',
    error: '#D32F2F',
    info: '#1976D2',
    bg: '#FCFBF7',
    paper: '#FFFFFF',
    text1: GREY_1_HEADING,
    text2: GREY_2_SUBHEADING,
    text3: GREY_3_BODY,
    border: GREY_4_BORDER,
    surface: GREY_5_SURFACE
  },
  dark: {
    orange: '#F07C4E',
    green: '#2FBF6B',
    warn: '#F0B33D',
    error: '#F0625E',
    info: '#5AA9F0',
    bg: '#13171B',
    paper: '#1A2026',
    text1: '#EDF0F3',
    text2: '#B3BAC2',
    text3: '#8A929B',
    border: '#2F363E',
    surface: '#222930'
  }
} as const;

export function createAppTheme(mode: ColorMode): Theme {
  const c = PALETTE[mode];
  const isDark = mode === 'dark';

  return createTheme({
    palette: {
      mode,
      primary: {
        main: c.orange,
        contrastText: '#ffffff'
      },
      secondary: {
        main: c.green,
        contrastText: '#ffffff'
      },
      success: {
        main: c.green
      },
      warning: {
        main: c.warn
      },
      error: {
        main: c.error
      },
      info: {
        main: c.info
      },
      background: {
        default: c.bg,
        paper: c.paper
      },
      text: {
        primary: c.text1,
        secondary: c.text2,
        disabled: c.border
      },
      divider: c.border,
      grey: {
        100: c.surface,
        200: c.surface,
        300: c.border,
        400: c.border,
        500: c.text3,
        600: c.text3,
        700: c.text2,
        800: c.text1,
        900: c.text1
      },
      action: {
        hover: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(46, 49, 53, 0.04)',
        selected: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(46, 49, 53, 0.08)',
        focus: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(46, 49, 53, 0.12)',
        disabled: c.border,
        disabledBackground: c.surface
      }
    },
    shape: {
      borderRadius: 3
    },
    typography: {
      fontFamily: 'Poppins, Inter, Arial, sans-serif',
      h1: { fontWeight: 700, fontSize: '2rem' },
      h2: { fontWeight: 700, fontSize: '1.75rem' },
      h3: { fontWeight: 600, fontSize: '1.4rem' },
      h4: { fontWeight: 600, fontSize: '1.2rem' },
      h5: { fontWeight: 700, fontSize: '1.1rem' },
      body1: { fontSize: '1rem', lineHeight: 1.6 },
      body2: { fontSize: '0.95rem' },
      button: { textTransform: 'none', fontWeight: 700 }
    },
    components: {
      // Paint the app background from the theme too, so a mode switch can
      // never leave a light strip behind an unpainted region.
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: 'var(--c-bg)',
            color: 'var(--c-text-1)'
          }
        }
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 3,
            backgroundImage: 'none', // MUI's dark-mode elevation overlay fights our tokens
            boxShadow: 'var(--c-shadow-paper)'
          }
        }
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            padding: '12px 24px'
          }
        }
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 3,
            backgroundImage: 'none',
            boxShadow: 'var(--c-shadow-card)'
          }
        }
      },
      // Default text-hierarchy coloring for any Typography that doesn't set
      // its own color — headings/values stay at text.primary, sub-headings/
      // labels drop one step, and body/caption/metadata text drops two.
      // A component-local sx color always wins over this.
      MuiTypography: {
        styleOverrides: {
          subtitle1: { color: 'var(--c-text-2)' },
          subtitle2: { color: 'var(--c-text-2)' },
          body1: { color: 'var(--c-text-3)' },
          body2: { color: 'var(--c-text-3)' },
          caption: { color: 'var(--c-text-3)' },
          overline: { color: 'var(--c-text-3)' }
        }
      },
      MuiDivider: {
        styleOverrides: {
          root: { borderColor: 'var(--c-border)' }
        }
      },
      MuiOutlinedInput: {
        styleOverrides: {
          notchedOutline: { borderColor: 'var(--c-border)' }
        }
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderBottom: '1px solid var(--c-border)' },
          head: { color: 'var(--c-text-1)', fontWeight: 700 },
          body: { color: 'var(--c-text-3)' }
        }
      }
    }
  });
}

// Backwards-compatible default export for any caller that still expects a
// ready-made theme object rather than the factory.
export const theme = createAppTheme('light');
