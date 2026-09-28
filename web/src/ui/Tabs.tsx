export function Tabs<K extends string>({ tabs, value, onChange }: {
  tabs: { key: K; label: string }[]; value: K; onChange: (k: K) => void;
}) {
  return (
    <div className="gq-tabs" role="tablist">
      {tabs.map(t => (
        <button key={t.key} role="tab" className="gq-tab" aria-selected={t.key === value}
          onClick={() => onChange(t.key)}>{t.label}</button>
      ))}
    </div>
  );
}
