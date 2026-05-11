import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  type CSSVariablesResolver,
  createTheme,
  Divider,
  Menu,
  Modal,
  NavLink,
  Notification,
  Paper,
  Popover,
  Progress,
  SegmentedControl,
  Skeleton,
  Switch,
  TextInput,
  ThemeIcon,
  Tooltip,
  Input,
  Drawer,
  Tabs,
} from '@mantine/core'

const GEIST = '"Geist", "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
const MONO = '"Geist Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace'

export const appTheme = createTheme({
  primaryColor: 'indigo',
  primaryShade: { light: 6, dark: 5 },
  fontFamily: GEIST,
  fontFamilyMonospace: MONO,
  defaultRadius: 'md',
  cursorType: 'pointer',
  focusRing: 'auto',
  autoContrast: true,

  headings: {
    fontFamily: GEIST,
    fontWeight: '700',
    sizes: {
      h1: { fontSize: '2rem',    lineHeight: '1.2'  },
      h2: { fontSize: '1.5rem',  lineHeight: '1.25' },
      h3: { fontSize: '1.25rem', lineHeight: '1.3'  },
      h4: { fontSize: '1.0625rem', lineHeight: '1.4' },
      h5: { fontSize: '0.9375rem', lineHeight: '1.45' },
      h6: { fontSize: '0.8125rem', lineHeight: '1.5' },
    },
  },

  fontSizes: {
    xs: '0.75rem',
    sm: '0.8125rem',
    md: '0.875rem',
    lg: '1rem',
    xl: '1.125rem',
  },

  lineHeights: {
    xs: '1.4',
    sm: '1.5',
    md: '1.6',
    lg: '1.65',
    xl: '1.7',
  },

  spacing: {
    xs: '0.5rem',
    sm: '0.75rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },

  radius: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },

  shadows: {
    xs: '0 1px 2px rgba(15,23,42,0.05)',
    sm: '0 1px 4px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)',
    md: '0 4px 12px rgba(15,23,42,0.08), 0 1px 4px rgba(15,23,42,0.04)',
    lg: '0 8px 24px rgba(15,23,42,0.10), 0 2px 8px rgba(15,23,42,0.06)',
    xl: '0 16px 48px rgba(15,23,42,0.14), 0 4px 16px rgba(15,23,42,0.08)',
  },

  components: {
    Card: Card.extend({
      defaultProps: { radius: 'lg', withBorder: true, shadow: 'xs' },
      styles: {
        root: {
          backgroundColor: 'var(--app-surface)',
          borderColor: 'var(--app-border)',
          transition: 'border-color 150ms ease',
        },
      },
    }),

    Paper: Paper.extend({
      defaultProps: { radius: 'lg' },
      styles: {
        root: { backgroundColor: 'var(--app-surface)' },
      },
    }),

    Button: Button.extend({
      defaultProps: { radius: 'md' },
      styles: {
        root: {
          fontWeight: 600,
          letterSpacing: '-0.01em',
          transition: 'transform 120ms ease, box-shadow 120ms ease, background 150ms ease',
        },
      },
    }),

    ActionIcon: ActionIcon.extend({
      defaultProps: { radius: 'md' },
      styles: {
        root: { transition: 'transform 120ms ease, background 120ms ease' },
      },
    }),

    Badge: Badge.extend({
      defaultProps: { radius: 'sm' },
      styles: { root: { fontWeight: 600, letterSpacing: '0.02em', fontSize: '0.7rem' } },
    }),

    Tooltip: Tooltip.extend({
      defaultProps: {
        withArrow: true,
        openDelay: 200,
        transitionProps: { transition: 'pop', duration: 130 },
        arrowSize: 6,
        fz: 'xs',
      },
    }),

    Modal: Modal.extend({
      defaultProps: {
        radius: 'xl',
        centered: true,
        overlayProps: { backgroundOpacity: 0.5, blur: 6 },
        transitionProps: { transition: 'pop', duration: 180 },
      },
      styles: {
        header: { paddingBottom: '0.75rem', borderBottom: '1px solid var(--app-border)' },
        title: { fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.01em' },
        body: { paddingTop: '1rem' },
      },
    }),

    Drawer: Drawer.extend({
      defaultProps: {
        overlayProps: { backgroundOpacity: 0.45, blur: 4 },
        transitionProps: { duration: 220 },
      },
      styles: {
        header: { borderBottom: '1px solid var(--app-border)' },
        title: { fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.01em' },
      },
    }),

    Menu: Menu.extend({
      defaultProps: {
        radius: 'lg',
        shadow: 'lg',
        withArrow: false,
        transitionProps: { transition: 'pop', duration: 150 },
      },
      styles: {
        dropdown: {
          border: '1px solid var(--app-border)',
          backgroundColor: 'var(--app-surface)',
          padding: '4px',
        },
        item: { borderRadius: 'var(--mantine-radius-md)', fontSize: '0.8125rem', fontWeight: 500 },
        label: { fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 8px 2px' },
        divider: { borderColor: 'var(--app-border)' },
      },
    }),

    Popover: Popover.extend({
      defaultProps: { radius: 'lg', shadow: 'lg', withArrow: false },
      styles: {
        dropdown: { border: '1px solid var(--app-border)', backgroundColor: 'var(--app-surface)' },
      },
    }),

    Notification: Notification.extend({
      defaultProps: { radius: 'lg' },
      styles: {
        root: { border: '1px solid var(--app-border)', boxShadow: '0 8px 24px rgba(15,23,42,0.12)' },
      },
    }),

    TextInput: TextInput.extend({
      defaultProps: { radius: 'md' },
      styles: {
        input: {
          fontSize: '0.875rem',
          transition: 'border-color 150ms ease, box-shadow 150ms ease',
        },
      },
    }),

    Input: Input.extend({
      styles: {
        input: {
          transition: 'border-color 150ms ease, box-shadow 150ms ease',
        },
      },
    }),

    SegmentedControl: SegmentedControl.extend({
      defaultProps: { radius: 'md' },
    }),

    Progress: Progress.extend({
      defaultProps: { radius: 'xl' },
    }),

    Switch: Switch.extend({
      defaultProps: { size: 'md' },
    }),

    Skeleton: Skeleton.extend({
      defaultProps: { radius: 'md' },
    }),

    Divider: Divider.extend({
      defaultProps: { color: 'var(--app-border)' },
    }),

    NavLink: NavLink.extend({
      defaultProps: { variant: 'light' },
      styles: {
        root: {
          borderRadius: 'var(--mantine-radius-md)',
          fontWeight: 500,
          fontSize: '0.8125rem',
          transition: 'background 130ms ease, color 130ms ease',
        },
        label: { fontWeight: 500 },
      },
    }),

    ThemeIcon: ThemeIcon.extend({
      defaultProps: { radius: 'md' },
    }),

    Anchor: Anchor.extend({
      defaultProps: { underline: 'hover' },
    }),

    Tabs: Tabs.extend({
      styles: {
        tab: {
          fontWeight: 500,
          fontSize: '0.8125rem',
          transition: 'color 130ms ease',
        },
      },
    }),
  },

  other: {
    // Light mode
    canvasLight: '#f4f5f8',
    surfaceLight: '#ffffff',
    surfaceElevatedLight: '#ffffff',
    navbarLight: '#ffffff',
    borderLight: 'rgba(15, 23, 42, 0.08)',
    borderStrongLight: 'rgba(15, 23, 42, 0.14)',

    // Dark mode
    canvasDark: '#0d0e12',
    surfaceDark: '#16181e',
    surfaceElevatedDark: '#1e2028',
    navbarDark: '#111318',
    borderDark: 'rgba(255, 255, 255, 0.07)',
    borderStrongDark: 'rgba(255, 255, 255, 0.12)',

    // Brand
    brandFrom: '#4f7cff',
    brandTo: '#9b59f5',
    brandGradient: 'linear-gradient(135deg, #4f7cff 0%, #9b59f5 100%)',
  },
})

export const cssVariablesResolver: CSSVariablesResolver = (theme) => ({
  variables: {
    '--app-transition-fast':  '130ms cubic-bezier(0.4, 0, 0.2, 1)',
    '--app-transition-base':  '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    '--app-transition-slow':  '320ms cubic-bezier(0.4, 0, 0.2, 1)',
    '--app-brand-gradient':   'linear-gradient(135deg, #4f7cff 0%, #9b59f5 100%)',
    '--app-brand-from':       '#4f7cff',
    '--app-brand-to':         '#9b59f5',
    '--app-font':             '"Geist", "DM Sans", system-ui, sans-serif',
    '--app-font-mono':        '"Geist Mono", ui-monospace, monospace',
  },
  light: {
    '--app-canvas':           theme.other.canvasLight,
    '--app-surface':          theme.other.surfaceLight,
    '--app-surface-elevated': theme.other.surfaceElevatedLight,
    '--app-navbar-bg':        theme.other.navbarLight,
    '--app-border':           theme.other.borderLight,
    '--app-border-strong':    theme.other.borderStrongLight,
    '--app-shadow-sm':        '0 1px 3px rgba(15,23,42,0.06)',
    '--app-shadow-md':        '0 4px 12px rgba(15,23,42,0.08)',
    '--app-shadow-lg':        '0 8px 32px rgba(15,23,42,0.10)',
    '--mantine-color-body':   theme.other.canvasLight,
  },
  dark: {
    '--app-canvas':           theme.other.canvasDark,
    '--app-surface':          theme.other.surfaceDark,
    '--app-surface-elevated': theme.other.surfaceElevatedDark,
    '--app-navbar-bg':        theme.other.navbarDark,
    '--app-border':           theme.other.borderDark,
    '--app-border-strong':    theme.other.borderStrongDark,
    '--app-shadow-sm':        '0 1px 3px rgba(0,0,0,0.25)',
    '--app-shadow-md':        '0 4px 12px rgba(0,0,0,0.35)',
    '--app-shadow-lg':        '0 8px 32px rgba(0,0,0,0.45)',
    '--mantine-color-body':   theme.other.canvasDark,
  },
})
