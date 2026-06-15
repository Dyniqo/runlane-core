import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactElement,
  ReactNode,
} from 'react';
import type { Toast, ToastTone } from '../types';
import { cx } from '../lib/classes';

export function Button({
  tone = 'default',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly tone?: 'default' | 'primary' | 'danger' | 'subtle';
  readonly size?: 'sm' | 'md';
}): ReactElement {
  return <button className={cx('button', tone, size, className)} {...props} />;
}

export function TextField({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  readonly label: string;
  readonly hint?: string;
}): ReactElement {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
      {hint ? <em>{hint}</em> : null}
    </label>
  );
}

export function SelectField({
  label,
  hint,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <label className="field">
      <span>{label}</span>
      <select {...props}>{children}</select>
      {hint ? <em>{hint}</em> : null}
    </label>
  );
}

export function TextAreaField({
  label,
  hint,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  readonly label: string;
  readonly hint?: string;
}): ReactElement {
  return (
    <label className="field textarea-field">
      <span>{label}</span>
      <textarea {...props} />
      {hint ? <em>{hint}</em> : null}
    </label>
  );
}

export function Card({
  children,
  className = '',
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return <section className={cx('card', className)}>{children}</section>;
}

export function PanelHeader({
  eyebrow,
  title,
  caption,
  actions,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly caption?: string;
  readonly actions?: ReactNode;
}): ReactElement {
  return (
    <header className="panel-header">
      <div className="panel-header__row">
        <div className="panel-header__content">
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h2 className="panel-header__title">{title}</h2>
        </div>

        {actions ? <div className="panel-header__actions">{actions}</div> : null}
      </div>

      {caption ? <p className="panel-header__caption">{caption}</p> : null}
    </header>
  );
}

export function StatusBadge({ value }: { readonly value: string }): ReactElement {
  const normalized = value.toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-');
  return <span className={cx('status-badge', normalized)}>{value.replace(/_/g, ' ')}</span>;
}

export function Signal({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <span className={cx('signal', value === 'online' ? 'online' : 'offline')}>
      <i />
      {label}
    </span>
  );
}

export function MetricTile({
  label,
  value,
  detail,
  tone = 'blue',
}: {
  readonly label: string;
  readonly value: string | number;
  readonly detail: string;
  readonly tone?: 'blue' | 'green' | 'violet' | 'amber';
}): ReactElement {
  return (
    <div className={cx('metric-tile', tone)}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

export function InfoPill({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className="info-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function EmptyState({
  title,
  caption,
}: {
  readonly title: string;
  readonly caption?: string;
}): ReactElement {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {caption ? <span>{caption}</span> : null}
    </div>
  );
}

export function ProgressBar({ value }: { readonly value: number }): ReactElement {
  const normalized = normalizeProgress(value);
  return (
    <div className="progress-bar" aria-label={`${normalized}%`}>
      <i style={{ width: `${normalized}%` }} />
    </div>
  );
}

export function CompactPager({
  page,
  pageCount,
  total,
  label,
  onPage,
}: {
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
  readonly label: string;
  readonly onPage: (page: number) => void;
}): ReactElement | null {
  if (pageCount <= 1) return null;
  const first = page * 8 + 1;
  const last = Math.min(total, (page + 1) * 8);
  return (
    <nav className="compact-pager" aria-label={`${label} pagination`}>
      <span>{`${first}-${last} of ${total}`}</span>
      <div>
        <button type="button" disabled={page === 0} onClick={() => onPage(Math.max(0, page - 1))}>
          Prev
        </button>
        <strong>{`${page + 1}/${pageCount}`}</strong>
        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(Math.min(pageCount - 1, page + 1))}
        >
          Next
        </button>
      </div>
    </nav>
  );
}

export function CircleProgress({
  value,
  label,
  detail,
  tone = 'blue',
  size = 'md',
}: {
  readonly value: number;
  readonly label: string;
  readonly detail?: string;
  readonly tone?: 'blue' | 'green' | 'violet' | 'amber';
  readonly size?: 'sm' | 'md' | 'lg';
}): ReactElement {
  const normalized = normalizeProgress(value);
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;
  return (
    <div
      className={cx('circle-progress', tone, size)}
      style={{ '--circle-progress': normalized } as CSSProperties}
      aria-label={`${label}: ${normalized}%`}
    >
      <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
        <circle className="circle-track" cx="60" cy="60" r={radius} />
        <circle
          className="circle-value"
          cx="60"
          cy="60"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div>
        <strong>{normalized}%</strong>
        {size === 'sm' ? null : <span>{label}</span>}
        {size === 'sm' || !detail ? null : <small>{detail}</small>}
      </div>
    </div>
  );
}

export function ToastViewport({
  toast,
  timeoutMs,
  onClose,
}: {
  readonly toast: Toast | null;
  readonly timeoutMs: number;
  readonly onClose: () => void;
}): ReactElement | null {
  if (!toast) return null;
  return (
    <aside className="toast-viewport" aria-live="polite">
      <div
        className={cx('toast-card', toast.tone)}
        style={{ '--toast-duration': `${timeoutMs}ms` } as CSSProperties}
      >
        <ToastIcon tone={toast.tone} />
        <div>
          <strong>{toast.title}</strong>
          <span>{toast.message}</span>
        </div>
        <button aria-label="Dismiss notification" onClick={onClose}>
          ×
        </button>
        <i className="toast-timer" />
      </div>
    </aside>
  );
}

function ToastIcon({ tone }: { readonly tone: ToastTone }): ReactElement {
  return (
    <i className={cx('toast-icon', tone)}>
      {tone === 'success' ? '✓' : tone === 'danger' ? '!' : tone === 'warning' ? '•' : 'i'}
    </i>
  );
}

function normalizeProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
