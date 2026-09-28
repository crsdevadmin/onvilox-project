import { Badge } from '../../../ui';

/** Assessment completeness (rule F6-04): complete, N missing, or not started. */
export function CompletenessBadge({ missing }: { missing: string[] | null | undefined }) {
  if (!missing) return <Badge tone="neutral">Not started</Badge>;
  if (!missing.length) return <Badge tone="ok">Complete</Badge>;
  return <Badge tone="warn" title={'Missing: ' + missing.join(', ')}>{missing.length} missing</Badge>;
}
