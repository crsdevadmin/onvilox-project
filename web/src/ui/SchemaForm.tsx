// Renders a form from a field schema (the server's data dictionary), so a new
// or changed field is a data change — no hand-written form markup per screen.
import type { ReactNode } from 'react';

export interface FieldOption { value: string; label: string }
export interface FieldDef {
  key: string; label: string;
  type: 'number' | 'select' | 'yesno' | 'text' | 'textarea' | 'date';
  unit?: string; min?: number; max?: number; options?: FieldOption[]; required?: boolean; help?: string;
}
export interface SectionDef { title: string; fields: FieldDef[] }
export type FormValues = Record<string, string | number | boolean | null | undefined>;

function Input({ f, value, onChange, disabled }: {
  f: FieldDef; value: FormValues[string]; onChange: (v: FormValues[string]) => void; disabled?: boolean;
}) {
  const id = 'f_' + f.key;
  switch (f.type) {
    case 'yesno':
      return (
        <div className="gq-yesno" role="group" aria-labelledby={id + '_l'}>
          {[true, false].map(b => (
            <button key={String(b)} type="button" aria-pressed={value === b} disabled={disabled}
              onClick={() => onChange(value === b ? null : b)}>{b ? 'Yes' : 'No'}</button>
          ))}
        </div>);
    case 'select':
      return (
        <select id={id} value={(value as string) ?? ''} disabled={disabled} onChange={e => onChange(e.target.value || null)}>
          <option value="">Select…</option>
          {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>);
    case 'textarea':
      return <textarea id={id} rows={2} value={(value as string) ?? ''} disabled={disabled}
        onChange={e => onChange(e.target.value)} />;
    case 'number':
      return <input id={id} type="number" inputMode="decimal" min={f.min} max={f.max} step="any"
        value={value === null || value === undefined ? '' : String(value)} disabled={disabled}
        onChange={e => onChange(e.target.value === '' ? null : e.target.value)} />;
    default:
      return <input id={id} type={f.type === 'date' ? 'date' : 'text'} value={(value as string) ?? ''} disabled={disabled}
        onChange={e => onChange(e.target.value)} />;
  }
}

export function SchemaForm({ sections, values, onChange, disabled, extra }: {
  sections: SectionDef[]; values: FormValues; onChange: (key: string, v: FormValues[string]) => void;
  disabled?: boolean; extra?: Record<string, ReactNode>;
}) {
  return (
    <>
      {sections.map(s => (
        <section key={s.title}>
          <h3 className="gq-section-title">{s.title}</h3>
          {extra?.[s.title]}
          <div className="gq-form-grid">
            {s.fields.map(f => (
              <div className="form-group" key={f.key}>
                <label id={'f_' + f.key + '_l'} htmlFor={'f_' + f.key}>
                  {f.label}{f.unit && <span className="gq-field-unit">({f.unit})</span>}
                  {f.required && <span className="gq-req" title="Required">*</span>}
                </label>
                <Input f={f} value={values[f.key]} disabled={disabled} onChange={v => onChange(f.key, v)} />
                {f.help && <div className="gq-field-help">{f.help}</div>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
