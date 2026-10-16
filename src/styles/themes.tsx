import type { CSSVariablesResolver } from '@mantine/core';
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Combobox,
  createTheme,
  Divider,
  Drawer,
  Input,
  Menu,
  Modal,
  NavLink,
  Paper,
  Popover,
  Table,
  Tabs,
} from '@mantine/core';

import classes from '@/styles/Controls.module.css';

/** Shared visual tokens also apply to portaled menus, dialogs, and drawers. */
export const cssVariablesResolver: CSSVariablesResolver = (theme) => ({
  variables: {
    '--ot-accent': '#EAAE2B',
    '--ot-heading': '#F4E7B3',
    '--ot-text': '#FFE87A',
    '--ot-body': '#E5E7EB',
    '--ot-muted': '#B6B9C2',
    '--ot-border': 'rgba(255,204,102,0.35)',
    '--ot-line': 'rgba(255,255,255,0.12)',
    '--ot-surface': '#0D1117',
    '--ot-surface-2': '#171F29',
    '--ot-inset': '#05070A',
    '--ot-panel': 'linear-gradient(180deg, #171F29, #0D1117)',
    '--ot-brand': theme.colors.brand?.[6] ?? theme.colors.blue[6],
    '--ot-brand-text': theme.colors.brand?.[1] ?? theme.colors.blue[1],
    '--ot-shadow':
      'inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 20px -12px rgba(0,0,0,0.7)',
  },
  light: {},
  dark: {
    '--mantine-color-body': '#0B1016',
    '--mantine-color-text': '#E5E7EB',
    '--mantine-color-dimmed': '#B6B9C2',
    '--mantine-color-placeholder': '#B6B9C2',
    '--mantine-color-default': '#171F29',
    '--mantine-color-default-hover': '#212B38',
    '--mantine-color-default-color': '#E5E7EB',
    '--mantine-color-default-border': 'rgba(255,255,255,0.12)',
  },
});

const panelStyles = {
  background: 'var(--ot-panel)',
  color: 'var(--ot-body)',
  border: '1px solid var(--ot-line)',
  boxShadow: 'var(--ot-shadow)',
};

const rpgComponentOverrides = {
  Paper: Paper.extend({
    defaultProps: { radius: 'sm' },
    styles: { root: panelStyles },
  }),
  Input: Input.extend({
    classNames: { input: classes.input },
    styles: {
      input: {
        background: 'var(--ot-inset)',
        color: 'var(--ot-body)',
        borderColor: 'var(--ot-line)',
        fontFamily: 'var(--mantine-font-family)',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
      },
    },
  }),
  InputWrapper: Input.Wrapper.extend({
    defaultProps: {
      inputWrapperOrder: ['label', 'input', 'description', 'error'],
    },
  }),
  Button: Button.extend({
    defaultProps: { variant: 'filled' },
    classNames: { root: classes.button },
    styles: (_, props) => {
      const variant = props.variant ?? 'filled';
      if (variant === 'filled') {
        return {
          root: {
            background:
              'linear-gradient(180deg, color-mix(in srgb, var(--ot-brand) 45%, var(--ot-surface-2)), var(--ot-inset))',
            color: 'var(--ot-heading)',
            border: '1px solid var(--ot-accent)',
            boxShadow:
              'inset 0 1px 0 var(--ot-heading), inset 0 -3px 5px rgba(0,0,0,0.65), 0 2px 4px rgba(0,0,0,0.6)',
          },
          inner: { display: 'flex', alignItems: 'center', gap: 8 },
        };
      }
      if (variant === 'outline') {
        return {
          root: {
            background: 'var(--ot-panel)',
            color: 'var(--ot-heading)',
            border: '1px solid var(--ot-border)',
            fontFamily: 'MedievalSharp, serif',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
          },
        };
      }
      // default / white / subtle / transparent keep Mantine's tint, only get
      // the fantasy frame from classes.button
      return {};
    },
  }),
  ActionIcon: ActionIcon.extend({ classNames: { root: classes.actionIcon } }),
  Anchor: Anchor.extend({
    defaultProps: { c: 'var(--ot-accent)', underline: 'hover' },
  }),
  Divider: Divider.extend({
    styles: { root: { borderColor: 'var(--ot-line)' } },
  }),
  Badge: Badge.extend({ defaultProps: { radius: 'sm' } }),
  Modal: Modal.extend({
    classNames: { title: classes.dialogTitle, header: classes.dialogHeader },
    styles: {
      content: panelStyles,
      header: {
        background: 'var(--ot-surface-2)',
        borderBottom: '1px solid var(--ot-line)',
      },
    },
  }),
  Drawer: Drawer.extend({
    classNames: { title: classes.dialogTitle, header: classes.dialogHeader },
    styles: {
      content: panelStyles,
      header: {
        background: 'var(--ot-surface-2)',
        borderBottom: '1px solid var(--ot-line)',
      },
    },
  }),
  Menu: Menu.extend({
    styles: { dropdown: panelStyles, label: { color: 'var(--ot-muted)' } },
  }),
  Combobox: Combobox.extend({ styles: { dropdown: panelStyles } }),
  Popover: Popover.extend({ styles: { dropdown: panelStyles } }),
  NavLink: NavLink.extend({
    classNames: { root: classes.navLink, label: classes.navLabel },
  }),
  Tabs: Tabs.extend({
    classNames: { list: classes.tabList, tab: classes.tab },
  }),
  Table: Table.extend({
    classNames: { table: classes.table, th: classes.tableHeader },
    defaultProps: { verticalSpacing: 'sm', horizontalSpacing: 'md' },
    styles: {
      table: {
        '--table-border-color': 'var(--ot-line)',
        '--table-striped-color': 'var(--ot-surface-2)',
        '--table-highlight-on-hover-color': 'var(--ot-surface-2)',
      },
    },
  }),
};

export const themes = {
  ELF: createTheme({
    fontFamily: 'Inter, system-ui, sans-serif',
    headings: { fontFamily: 'Chomsky, MedievalSharp, serif' },
    colors: {
      brand: [
        '#e0ffe5',
        '#b3ffcc',
        '#80ffb3',
        '#4dff99',
        '#1aff80',
        '#00e673',
        '#00b35a',
        '#008040',
        '#004d26',
        '#001a0d',
      ],
      secondary: [
        '#fff4e0',
        '#ffe8b3',
        '#ffdc80',
        '#ffd04d',
        '#ffc31a',
        '#e6b200',
        '#b38a00',
        '#806300',
        '#4d3c00',
        '#1a1500',
      ],
    },
    primaryColor: 'brand',
    primaryShade: { light: 6, dark: 8 },
    components: rpgComponentOverrides,
  }),
  HUMAN: createTheme({
    fontFamily: 'Inter, system-ui, sans-serif',
    headings: { fontFamily: 'Chomsky, MedievalSharp, serif' },
    colors: {
      brand: [
        '#e0f4ff',
        '#b3e0ff',
        '#80ccff',
        '#4db8ff',
        '#1aa3ff',
        '#0088e6',
        '#006bb3',
        '#004d80',
        '#002f4d',
        '#00121a',
      ],
      secondary: [
        '#f0f0f0',
        '#d9d9d9',
        '#c2c2c2',
        '#ababab',
        '#949494',
        '#7d7d7d',
        '#666666',
        '#4f4f4f',
        '#383838',
        '#212121',
      ],
    },
    primaryColor: 'brand',
    primaryShade: { light: 6, dark: 8 },
    components: rpgComponentOverrides,
  }),
  UNDEAD: createTheme({
    fontFamily: 'Inter, system-ui, sans-serif',
    headings: { fontFamily: 'Chomsky, MedievalSharp, serif' },
    colors: {
      brand: [
        '#d9d9d9',
        '#bfbfbf',
        '#a6a6a6',
        '#8c8c8c',
        '#737373',
        '#595959',
        '#404040',
        '#262626',
        '#0d0d0d',
        '#000000',
      ],
      secondary: [
        '#e0e0e0',
        '#b3b3b3',
        '#808080',
        '#4d4d4d',
        '#ababab',
        '#949494',
        '#7d7d7d',
        '#666666',
        '#4f4f4f',
        '#383838',
        '#212121',
      ],
    },
    primaryColor: 'brand',
    primaryShade: { light: 6, dark: 8 },
    components: rpgComponentOverrides,
  }),
  GOBLIN: createTheme({
    fontFamily: 'Inter, system-ui, sans-serif',
    headings: { fontFamily: 'Chomsky, MedievalSharp, serif' },
    colors: {
      brand: [
        '#ffe0e0',
        '#ffb3b3',
        '#ff8080',
        '#ff4d4d',
        '#ff1a1a',
        '#e60000',
        '#b30000',
        '#800000',
        '#4d0000',
        '#1a0000',
      ],
      secondary: [
        '#e6ccb3',
        '#cc9966',
        '#b36d00',
        '#995200',
        '#804000',
        '#663300',
        '#4d2600',
        '#331a00',
        '#1a0d00',
        '#000000',
      ],
    },
    primaryColor: 'brand',
    primaryShade: { light: 6, dark: 8 },
    components: rpgComponentOverrides,
  }),
};
