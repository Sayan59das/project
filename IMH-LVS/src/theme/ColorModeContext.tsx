import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { createAppTheme, type ColorMode } from './theme';

const STORAGE_KEY = 'imh_lvs_color_mode';

function readStoredMode(): ColorMode | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    // Private-mode / blocked storage — fall back to the system preference.
    return null;
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

function resolveInitialMode(): ColorMode {
  return readStoredMode() ?? (systemPrefersDark() ? 'dark' : 'light');
}

// index.css keys every colour token off :root[data-theme='dark'], so the
// attribute is what actually swaps the palette.
function applyModeAttribute(mode: ColorMode) {
  document.documentElement.setAttribute('data-theme', mode);
}

// Applied at module load — i.e. during main.tsx's imports, before React
// renders anything. Without this the first paint would use light tokens and
// visibly flash white before the provider's effect corrected it.
applyModeAttribute(resolveInitialMode());

type ColorModeContextValue = {
  mode: ColorMode;
  toggleColorMode: () => void;
  setColorMode: (mode: ColorMode) => void;
};

const ColorModeContext = createContext<ColorModeContextValue | undefined>(undefined);

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ColorMode>(resolveInitialMode);

  // Keep the DOM attribute in step with state on every change.
  useEffect(() => {
    applyModeAttribute(mode);
  }, [mode]);

  // Follow the OS setting, but only until the user picks a mode themselves —
  // an explicit choice is stored and must not be overridden by the system.
  useEffect(() => {
    if (readStoredMode() !== null) return;
    if (typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      if (readStoredMode() !== null) return;
      setMode(event.matches ? 'dark' : 'light');
    };

    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const setColorMode = useCallback((next: ColorMode) => {
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the mode still applies for this session, it just won't
      // survive a reload.
    }
  }, []);

  const toggleColorMode = useCallback(() => {
    setColorMode(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setColorMode]);

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  const value = useMemo<ColorModeContextValue>(
    () => ({ mode, toggleColorMode, setColorMode }),
    [mode, toggleColorMode, setColorMode]
  );

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export function useColorMode(): ColorModeContextValue {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error('useColorMode must be used within a ColorModeProvider');
  return ctx;
}
