import { useState } from 'react';
import type { ReactElement } from 'react';
import type { ThemeMode } from '../lib/session';
import { cx } from '../lib/classes';
import type { AppState } from '../types';
import { Button, TextField } from '../components/ui';

const loginCapabilities = [
  {
    tone: 'blue',
    title: 'Canvas planning',
    caption: 'Arrange workflow steps visually before running a check.',
  },
  {
    tone: 'violet',
    title: 'Protected snapshots',
    caption: 'Published flows stay stable while edits create draft changes.',
  },
  {
    tone: 'green',
    title: 'Operational review',
    caption: 'Review usage, credentials, runs, and audit events from one workspace.',
  },
] as const;

const previewNodes = [
  { tone: 'blue', title: 'Capture', caption: 'Inbound payload' },
  { tone: 'violet', title: 'Evaluate', caption: 'Routing logic' },
  { tone: 'green', title: 'Deliver', caption: 'Connector action' },
  { tone: 'amber', title: 'Review', caption: 'Outcome record' },
] as const;

type AuthMode = 'sign-in' | 'register';

type LoginViewProps = {
  readonly state: AppState;
  readonly theme: ThemeMode;
  readonly onTheme: () => void;
  readonly onLogin: (email: string, password: string) => Promise<void>;
  readonly onRegister: (name: string, email: string, password: string) => Promise<void>;
  readonly onDemo: () => Promise<void>;
};

export function LoginView({
  state,
  theme,
  onTheme,
  onLogin,
  onRegister,
  onDemo,
}: LoginViewProps): ReactElement {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [name, setName] = useState('Runlane Operator');
  const [email, setEmail] = useState('demo@runlane.local');
  const [password, setPassword] = useState('RunlaneDemoPassword123!');
  const isRegister = mode === 'register';

  async function submit(): Promise<void> {
    if (isRegister) {
      await onRegister(name, email, password);
      return;
    }

    await onLogin(email, password);
  }

  return (
    <main className="login-shell final operational">
      <section className="login-showcase operational">
        <button
          className="login-theme-toggle"
          type="button"
          aria-label="Switch color theme"
          onClick={onTheme}
        >
          <span>{theme === 'dark' ? '☀' : '☾'}</span>
          <strong>{theme === 'dark' ? 'Light' : 'Dark'}</strong>
        </button>

        <div className="login-brand-row refined">
          <div className="brand-mark" aria-hidden="true">
            <img src="/brand/mark.svg" alt="" width="30" height="30" decoding="async" />
          </div>
          <div>
            <span className="eyebrow">Runlane console</span>
            <strong>Workflow operations</strong>
          </div>
        </div>

        <div className="login-title-block refined">
          <h1>
            <span className="gradient-word">Build the flow.</span> Run the check. Inspect the
            outcome.
          </h1>
          <p>
            Operate workflows through a guided interface with readable cards, controlled actions,
            and a visual canvas built for workspace teams.
          </p>
        </div>

        <div className="login-capability-grid">
          {loginCapabilities.map((capability) => (
            <CapabilityCard key={capability.title} {...capability} />
          ))}
        </div>

        <div className="login-flow-board">
          <div className="flow-board-heading">
            <span>Workspace route</span>
            <strong>Capture → Evaluate → Deliver → Review</strong>
          </div>

          <div className="flow-board-track">
            {previewNodes.map((node) => (
              <PreviewNode key={node.title} {...node} />
            ))}
          </div>
        </div>
      </section>

      <section className="auth-card operational">
        <div className="auth-card-head">
          <span className="eyebrow">Access workspace</span>
          <h2>{isRegister ? 'Create your workspace' : 'Open the console'}</h2>
          <p>
            {isRegister
              ? 'Start with a workspace owner profile and continue into the console.'
              : 'Use a workspace account or prepare an isolated demo workspace.'}
          </p>
        </div>

        <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={mode === 'sign-in' ? 'active' : ''}
            onClick={() => setMode('sign-in')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={isRegister ? 'active' : ''}
            onClick={() => setMode('register')}
          >
            Create workspace
          </button>
        </div>

        <form
          className="auth-form refined"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {isRegister ? (
            <TextField
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          ) : null}
          <TextField
            label="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <div className="form-actions final refined">
            <Button tone="primary" type="submit" disabled={state.isBusy}>
              {isRegister ? 'Create workspace' : 'Open console'}
            </Button>
            <Button type="button" disabled={state.isBusy} onClick={() => void onDemo()}>
              Prepare demo
            </Button>
          </div>
        </form>

        <div className="auth-assurance-list">
          <div>
            <i>✓</i>
            <span>Workspace-scoped access</span>
          </div>
          <div>
            <i>✓</i>
            <span>Protected publishing flow</span>
          </div>
          <div>
            <i>✓</i>
            <span>UI-managed operations</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function CapabilityCard({
  tone,
  title,
  caption,
}: {
  readonly tone: 'blue' | 'green' | 'violet';
  readonly title: string;
  readonly caption: string;
}): ReactElement {
  return (
    <div className={cx('capability-card', tone)}>
      <i />
      <strong>{title}</strong>
      <span>{caption}</span>
    </div>
  );
}

function PreviewNode({
  tone,
  title,
  caption,
}: {
  readonly tone: 'blue' | 'green' | 'violet' | 'amber';
  readonly title: string;
  readonly caption: string;
}): ReactElement {
  return (
    <div className={cx('showcase-node', tone)}>
      <i />
      <span>
        <strong>{title}</strong>
        <small>{caption}</small>
      </span>
    </div>
  );
}
