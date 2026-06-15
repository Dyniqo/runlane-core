import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { AppState } from '../types';
import { formatDate, summarizeRecord, titleCase } from '../lib/format';
import { Card, CompactPager, EmptyState, InfoPill, PanelHeader } from '../components/ui';

export function AuditView({ state }: { readonly state: AppState }): ReactElement {
  const latest = state.auditLogs[0] ?? null;
  const systemEvents = state.auditLogs.filter((log) => !log.entityId).length;
  const [page, setPage] = useState(0);
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(state.auditLogs.length / pageSize));
  const normalizedPage = Math.min(page, pageCount - 1);
  const visibleLogs = useMemo(
    () => state.auditLogs.slice(normalizedPage * pageSize, normalizedPage * pageSize + pageSize),
    [normalizedPage, state.auditLogs],
  );
  return (
    <div className="audit-page expanded">
      <Card className="audit-card audit-overview-card">
        <PanelHeader
          eyebrow="Audit"
          title="Workspace activity"
          caption="Paginated operator and system activity from the workspace API."
        />
        <div className="run-counter-grid three-items">
          <InfoPill label="Loaded events" value={state.auditLogs.length.toString()} />
          <InfoPill label="System events" value={systemEvents.toString()} />
          <InfoPill label="Latest" value={latest ? formatDate(latest.createdAt) : '—'} />
        </div>
      </Card>
      <Card className="audit-card audit-stream-card">
        <PanelHeader
          title="Activity stream"
          caption="Each row preserves the backend action and entity scope."
        />
        <div className="audit-list bounded-scroll audit-scroll">
          {visibleLogs.map((log) => (
            <AuditRow key={log.id} log={log} />
          ))}
          {state.auditLogs.length === 0 ? (
            <EmptyState
              title="No audit records loaded"
              caption="Activity appears after workspace actions are accepted."
            />
          ) : null}
        </div>
        <CompactPager
          page={normalizedPage}
          pageCount={pageCount}
          total={state.auditLogs.length}
          label="Audit"
          onPage={setPage}
        />
      </Card>
    </div>
  );
}

function AuditRow({ log }: { readonly log: AppState['auditLogs'][number] }): ReactElement {
  const metadata = summarizeRecord(log.metadata ?? {}).slice(0, 3);
  return (
    <div className="audit-row expanded">
      <div>
        <strong>{titleCase(log.action)}</strong>
        <span>
          {titleCase(log.entityType || 'Workspace event')}{' '}
          {log.entityId ? `· ${log.entityId.slice(0, 12)}` : ''}
        </span>
        {metadata.length > 0 ? (
          <small>{metadata.map(([key, value]) => `${key}: ${value}`).join(' · ')}</small>
        ) : null}
      </div>
      <time>{formatDate(log.createdAt)}</time>
    </div>
  );
}
