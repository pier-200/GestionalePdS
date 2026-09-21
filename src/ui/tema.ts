import { createTheme, type MantineColorsTuple } from '@mantine/core';

/**
 * Tema dell'applicazione, allineato a quello del Generatore Esami: blu primario
 * #2563EB, superfici bianche su fondo grigio-azzurro, grigi "slate" per il tema
 * scuro. La rampa del blu è la stessa usata dai grafici (validata per contrasto
 * e daltonismo).
 */
const blu: MantineColorsTuple = [
  '#eff6ff',
  '#dbeafe',
  '#bfdbfe',
  '#93c5fd',
  '#60a5fa',
  '#3b82f6',
  '#2563eb',
  '#1d4ed8',
  '#1e40af',
  '#1e3a8a',
];

const scuro: MantineColorsTuple = [
  '#e2e8f0',
  '#cbd5e1',
  '#94a3b8',
  '#64748b',
  '#475569',
  '#334155',
  '#1e293b',
  '#0f172a',
  '#0b1220',
  '#060b14',
];

export const tema = createTheme({
  primaryColor: 'pds',
  primaryShade: { light: 6, dark: 5 },
  colors: { pds: blu, dark: scuro },
  white: '#ffffff',
  black: '#0f172a',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  headings: { fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  defaultRadius: 'md',
  radius: { xs: '4px', sm: '6px', md: '8px', lg: '12px', xl: '16px' },
  cursorType: 'pointer',
  components: {
    Tooltip: { defaultProps: { withArrow: true, multiline: true, maw: 320 } },
    Modal: { defaultProps: { centered: true, radius: 'lg', overlayProps: { backgroundOpacity: 0.45, blur: 2 }, closeButtonProps: { 'aria-label': 'Chiudi' } } },
    Notification: { defaultProps: { closeButtonProps: { 'aria-label': 'Chiudi la notifica' } } },
    Select: { defaultProps: { clearButtonProps: { 'aria-label': 'Cancella la selezione' } } },
    MultiSelect: { defaultProps: { clearButtonProps: { 'aria-label': 'Cancella la selezione' } } },
    TagsInput: { defaultProps: { clearButtonProps: { 'aria-label': 'Cancella tutti i valori' } } },
    FileInput: { defaultProps: { clearButtonProps: { 'aria-label': 'Rimuovi il file' } } },
    DateInput: { defaultProps: { clearButtonProps: { 'aria-label': 'Cancella la data' } } },
    Card: { defaultProps: { withBorder: true, radius: 'lg', padding: 'lg' } },
    Paper: { defaultProps: { radius: 'lg' } },
    Button: { defaultProps: { radius: 'sm' } },
    Badge: { defaultProps: { radius: 'sm', tt: 'none' }, styles: { root: { fontWeight: 600, letterSpacing: 0 } } },
    PasswordInput: { defaultProps: { visibilityToggleButtonProps: { 'aria-label': 'Mostra o nascondi la password' } } },
  },
});

/** Colori dei grafici (rampa ordinale validata con scripts/validate_palette.js). */
export const COLORI_GRAFICO = {
  chiaro: { finanziato: '#94a3b8', inviato: '#93c5fd', stipulato: '#2563eb', pagato: '#1e3a8a' },
  scuro: { finanziato: '#475569', inviato: '#1e40af', stipulato: '#3b82f6', pagato: '#93c5fd' },
};
