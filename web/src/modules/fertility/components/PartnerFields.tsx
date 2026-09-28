import type { PartnerInput } from '../types';

export const emptyPartner = (): PartnerInput => ({ name: '', age: '', phone: '', mrn: '' });

/** Name / age / phone / hospital number — used by New case and Add partner. */
export function PartnerFields({ value, onChange, prefix }: {
  value: PartnerInput; onChange: (v: PartnerInput) => void; prefix: string;
}) {
  const set = (k: keyof PartnerInput) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="gq-form-grid">
      <div className="form-group"><label htmlFor={prefix + 'n'}>Name<span className="gq-req">*</span></label>
        <input id={prefix + 'n'} value={value.name} onChange={set('name')} /></div>
      <div className="form-group"><label htmlFor={prefix + 'a'}>Age <span className="gq-field-unit">(years)</span></label>
        <input id={prefix + 'a'} type="number" min={15} max={70} value={value.age} onChange={set('age')} /></div>
      <div className="form-group"><label htmlFor={prefix + 'p'}>Phone</label>
        <input id={prefix + 'p'} inputMode="tel" value={value.phone} onChange={set('phone')} /></div>
      <div className="form-group"><label htmlFor={prefix + 'm'}>Hospital no. (MRN)</label>
        <input id={prefix + 'm'} value={value.mrn} onChange={set('mrn')} /></div>
    </div>
  );
}
