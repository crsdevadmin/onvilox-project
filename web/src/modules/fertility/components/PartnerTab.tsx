// One partner: completeness, assessment form and labs — or "add partner".
import { useState } from 'react';
import { Banner, Card } from '../../../ui';
import { fertilityApi } from '../api';
import { sexLabel } from '../helpers';
import type { CaseDetail, FxSchema, Sex } from '../types';
import { AssessmentForm } from './AssessmentForm';
import { CompletenessBadge } from './CompletenessBadge';
import { LabsPanel } from './LabsPanel';
import { emptyPartner, PartnerFields } from './PartnerFields';

export function PartnerTab({ c, sex, schema, canEdit, canAdd, onSaved }: {
  c: CaseDetail; sex: Sex; schema: FxSchema; canEdit: boolean; canAdd: boolean; onSaved: () => void;
}) {
  const p = c.partners.find(x => x.sex === sex);
  const [np, setNp] = useState(emptyPartner());
  const [err, setErr] = useState<string | null>(null);

  if (!p) {
    return (
      <Card title={`Add ${sexLabel(sex).toLowerCase()}`}>
        {!canAdd ? <p className="gq-muted">No {sexLabel(sex).toLowerCase()} on this case.</p> : (
          <>
            {err && <Banner tone="bad" onClose={() => setErr(null)}>{err}</Banner>}
            <PartnerFields value={np} onChange={setNp} prefix="np" />
            <button className="btn-primary" onClick={async () => {
              try { await fertilityApi.addPartner(c.id, sex, np); onSaved(); }
              catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
            }}>Add partner</button>
          </>)}
      </Card>
    );
  }

  const missing = p.assessment ? p.assessment.missing : null;
  return (
    <>
      <Card title={<>{p.name}{p.age ? <span className="gq-muted"> · {p.age} y</span> : null}</>}
        actions={<CompletenessBadge missing={missing} />}>
        {missing && missing.length > 0 && (
          <p className="gq-small gq-muted" style={{ marginBottom: 8 }}>
            A formula cannot be prepared until these are filled: {missing.join(', ')}.
          </p>)}
        <AssessmentForm caseId={c.id} partner={p} sections={sex === 'F' ? schema.female : schema.male}
          canEdit={canEdit} onSaved={onSaved} />
      </Card>
      <div style={{ height: 16 }} />
      <Card title="Lab results">
        <LabsPanel caseId={c.id} partner={p} labs={schema.labs} canEdit={canEdit} onSaved={onSaved} />
      </Card>
    </>
  );
}
