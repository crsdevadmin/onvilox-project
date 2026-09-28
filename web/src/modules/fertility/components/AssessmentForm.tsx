// A partner's assessment, rendered from the server's data dictionary.
// Each save creates a new version; the server reports what is still missing.
import { useEffect, useState } from 'react';
import { Banner, SchemaForm, type FormValues, type SectionDef } from '../../../ui';
import { fertilityApi } from '../api';
import { bmi } from '../helpers';
import type { Partner } from '../types';

export function AssessmentForm({ caseId, partner, sections, canEdit, onSaved }: {
  caseId: string; partner: Partner; sections: SectionDef[]; canEdit: boolean; onSaved: () => void;
}) {
  const [values, setValues] = useState<FormValues>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  useEffect(() => { setValues((partner.assessment?.data as FormValues) || {}); setDirty(false); }, [partner]);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await fertilityApi.saveAssessment(caseId, partner.id, values);
      setMsg({ tone: 'ok', text: `Saved as version ${r.version}. ` + (r.missing.length ? `${r.missing.length} required field(s) still missing.` : 'All required fields complete.') });
      setDirty(false);
      onSaved();
    } catch (e) { setMsg({ tone: 'bad', text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); }
  }

  const b = bmi(values.height_cm, values.weight_kg);
  const bodyExtra = b ? <p className="gq-small gq-muted" style={{ marginBottom: 8 }}>BMI {b} kg/m² (calculated)</p> : null;

  return (
    <>
      {msg && <Banner tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Banner>}
      <SchemaForm sections={sections} values={values} disabled={!canEdit || busy} extra={{ Body: bodyExtra }}
        onChange={(k, v) => { setValues(s => ({ ...s, [k]: v })); setDirty(true); }} />
      {canEdit && (
        <div className="gq-row gq-sticky-actions">
          <button className="btn-primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save assessment'}</button>
          {dirty && <span className="gq-small gq-muted">Unsaved changes</span>}
          {partner.assessment && (
            <span className="gq-small gq-muted">Version {partner.assessment.version} · {new Date(partner.assessment.created_at).toLocaleString()}
              {partner.assessment.created_by_name ? ' · ' + partner.assessment.created_by_name : ''}</span>)}
        </div>
      )}
    </>
  );
}
