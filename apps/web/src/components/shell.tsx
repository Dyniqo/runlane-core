import type { ReactElement, ReactNode } from 'react';
import type { ThemeMode } from '../lib/session';
import type { AppState, AppTab } from '../types';
import { Button, Signal } from './ui';

export const tabs: readonly {
  readonly id: AppTab;
  readonly label: string;
  readonly helper: string;
  readonly icon: string;
}[] = [
  { id: 'home', label: 'Overview', helper: 'Workspace summary', icon: '⌂' },
  { id: 'workflows', label: 'Builder', helper: 'Visual canvas', icon: '◇' },
  { id: 'executions', label: 'Runs', helper: 'Trace timeline', icon: '↻' },
  { id: 'integrations', label: 'Integrations', helper: 'Keys and secrets', icon: '⚯' },
  { id: 'usage', label: 'Usage', helper: 'Current meters', icon: '▥' },
  { id: 'plans', label: 'Plans', helper: 'Limits and features', icon: '◈' },
  { id: 'audit', label: 'Audit', helper: 'Workspace events', icon: '◎' },
];

type ShellProps = {
  readonly state: AppState;
  readonly theme: ThemeMode;
  readonly onNavigate: (tab: AppTab) => void;
  readonly onTheme: () => void;
  readonly onSignOut: () => void;
  readonly children: ReactNode;
};

export function Shell({
  state,
  theme,
  onNavigate,
  onTheme,
  onSignOut,
  children,
}: ShellProps): ReactElement {
  return (
    <div className="app-shell" data-theme={theme}>
      <div className="page-box">
        <div className="chrome-layer">
          <TopNavigation state={state} theme={theme} onTheme={onTheme} onSignOut={onSignOut} />
          <ModuleTabs active={state.activeTab} onChange={onNavigate} />
        </div>

        <main className="content-stage">{children}</main>
      </div>

      {state.isBusy ? <div className="busy-line" /> : null}
    </div>
  );
}

type TopNavigationProps = {
  readonly state: AppState;
  readonly theme: ThemeMode;
  readonly onTheme: () => void;
  readonly onSignOut: () => void;
};

function TopNavigation({ state, theme, onTheme, onSignOut }: TopNavigationProps): ReactElement {
  const workspace = state.session?.workspace;
  const healthReady = state.health.api === 'online' && state.health.ready === 'online';

  return (
    <header className="top-navigation polished final">
      <div className="brand-cluster">
        <div className="brand-mark" aria-hidden="true">
          <img src="/brand/mark.svg" alt="" width="30" height="30" decoding="async" />
        </div>
        <div>
          <strong>Runlane</strong>
          <span>{workspace?.name ?? 'Workspace console'}</span>
        </div>
      </div>

      <div className="nav-center">
        <div className={healthReady ? 'service-pill online' : 'service-pill'}>
          <i />
          {healthReady ? 'Workspace ready' : 'Connecting workspace'}
        </div>
        <div className="health-strip">
          <Signal label="API" value={state.health.api} />
          <Signal label="Ready" value={state.health.ready} />
          <Signal label="Queue" value={state.health.queue} />
        </div>
      </div>

      <div className="top-actions">
        <button className="theme-toggle" type="button" aria-label="Switch color theme" onClick={onTheme}>
          <span>{theme === 'dark' ? '☀' : '☾'}</span>
          <strong>{theme === 'dark' ? 'Light' : 'Dark'}</strong>
        </button>
        <Button size="sm" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </header>
  );
}

type ModuleTabsProps = {
  readonly active: AppTab;
  readonly onChange: (tab: AppTab) => void;
};

function ModuleTabs({ active, onChange }: ModuleTabsProps): ReactElement {
  return (
    <nav className="module-tabs final" aria-label="Runlane modules">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={active === tab.id ? 'active' : ''}
          onClick={() => onChange(tab.id)}
        >
          <i>{tab.icon}</i>
          <strong>{tab.label}</strong>
          <span>{tab.helper}</span>
        </button>
      ))}
    </nav>
  );
}
