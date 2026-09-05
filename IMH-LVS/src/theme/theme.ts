import { createTheme } from '@mui/material/styles';

// Centralized grey hierarchy — the only neutral text/border/surface colors
// used across the app. Darker = higher emphasis. Import these directly in
// components instead of hardcoding a new hex value; every neutral grey
// found in the codebase maps onto one of these five.
export const GREY_1_HEADING = '#2E3135'; // main headings, primary/high-emphasis text
export const GREY_2_SUBHEADING = '#6B7177'; // sub-headings, labels, medium-emphasis text
export const GREY_3_BODY = '#9EA4AB'; // body/supporting text, metadata, secondary icons
export const GREY_4_BORDER = '#D8DDE3'; // borders, dividers, disabled elements
export const GREY_5_SURFACE = '#EEF1F4'; // subtle backgrounds, hover states, empty states

export const theme = createTheme({
  palette: {
    primary: {
      main: '#E26737',
      contrastText: '#ffffff'
    },
    secondary: {
      main: '#00A651',
      contrastText: '#ffffff'
    },
    success: {
      main: '#00A651'
    },
    warning: {
      main: '#F2B400'
    },
    error: {
      main: '#D32F2F'
    },
    background: {
      default: '#FCFBF7',
      paper: '#FFFFFF'
    },
    text: {
      primary: GREY_1_HEADING,
      secondary: GREY_2_SUBHEADING,
      disabled: GREY_4_BORDER
    },
    divider: GREY_4_BORDER,
    grey: {
      100: GREY_5_SURFACE,
      200: GREY_5_SURFACE,
      300: GREY_4_BORDER,
      400: GREY_4_BORDER,
      500: GREY_3_BODY,
      600: GREY_3_BODY,
      700: GREY_2_SUBHEADING,
      800: GREY_1_HEADING,
      900: GREY_1_HEADING
    },
    action: {
      hover: 'rgba(46, 49, 53, 0.04)',
      selected: 'rgba(46, 49, 53, 0.08)',
      focus: 'rgba(46, 49, 53, 0.12)',
      disabled: GREY_4_BORDER,
      disabledBackground: GREY_5_SURFACE
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
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 3,
          boxShadow: '0 18px 45px rgba(0, 0, 0, 0.06)'
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
          boxShadow: '0 18px 45px rgba(0, 0, 0, 0.05)'
        }
      }
    },
    // Default text-hierarchy coloring for any Typography that doesn't set
    // its own color — headings/values stay at text.primary (Grey 1),
    // sub-headings/labels drop to Grey 2, and body/caption/metadata text
    // drops to Grey 3. A component-local sx color always wins over this.
    MuiTypography: {
      styleOverrides: {
        subtitle1: { color: GREY_2_SUBHEADING },
        subtitle2: { color: GREY_2_SUBHEADING },
        body1: { color: GREY_3_BODY },
        body2: { color: GREY_3_BODY },
        caption: { color: GREY_3_BODY },
        overline: { color: GREY_3_BODY }
      }
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: GREY_4_BORDER }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: { borderColor: GREY_4_BORDER }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${GREY_4_BORDER}` },
        head: { color: GREY_1_HEADING, fontWeight: 700 },
        body: { color: GREY_3_BODY }
      }
    }
  }
});
