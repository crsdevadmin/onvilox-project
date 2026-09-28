import { Badge, type Tone } from '../../../ui';
import type { Finding } from '../types';

const KIND: Record<string, { label: string; tone: Tone }> = {
  RED_FLAG: { label: 'Red flag', tone: 'bad' }, SAFETY_MODE: { label: 'Safety mode', tone: 'bad' },
  REFERRAL: { label: 'Referral', tone: 'warn' }, PHENOTYPE: { label: 'Nutrition risk', tone: 'warn' },
  RECOMMENDATION: { label: 'Recommendation', tone: 'info' }, INGREDIENT: { label: 'Ingredient safety', tone: 'info' },
  MONITORING: { label: 'Monitoring', tone: 'neutral' }, INFO: { label: 'Note', tone: 'neutral' },
};
const BEHAVIOUR: Record<string, string> = {
  AUTO: 'Applies automatically', FLAG: 'Clinician to accept', REVIEW: 'Clinician review required', BLOCK: 'Hard rule',
};

export function FindingCard({ f }: { f: Finding }) {
  const k = KIND[f.kind] || KIND.INFO;
  return (
    <div className="gq-finding" data-kind={f.kind}>
      <div className="gq-row" style={{ gap: 6 }}>
        <Badge tone={k.tone}>{k.label}</Badge>
        <strong className="gq-small">{f.ruleId}</strong>
        <span className="gq-small gq-muted">{BEHAVIOUR[f.behaviour] || f.behaviour}</span>
        <span className="gq-spacer" />
        {f.evidence && f.evidence !== '—' && <Badge tone="neutral" title="Evidence level">Evidence {f.evidence}</Badge>}
        {f.status !== 'APPROVED' && <Badge tone="warn" title="Not yet approved by the clinical reviewers">Draft rule</Badge>}
      </div>
      <p style={{ margin: '6px 0 2px' }}>{f.message}</p>
      <p className="gq-small gq-muted">Because: {f.trigger}{f.sources && f.sources !== '—' ? ` · Source ${f.sources}` : ''}</p>
      {f.notes && <p className="gq-small gq-muted">{f.notes}</p>}
    </div>
  );
}
