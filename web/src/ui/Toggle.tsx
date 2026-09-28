export function Toggle({ checked, onChange, disabled, label }: {
  checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string;
}) {
  return (
    <button type="button" role="switch" className="gq-toggle" aria-checked={checked} aria-label={label}
      title={label} disabled={disabled} onClick={() => onChange(!checked)} />
  );
}
