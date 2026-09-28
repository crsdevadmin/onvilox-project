import { useAccess } from '../core/AccessContext';
import { moduleHref } from '../core/modules';
import { Card, PageHeader } from '../ui';

export function NoAccess() {
  const { access } = useAccess();
  return (
    <>
      <PageHeader title="No access" />
      <Card>
        <p>You don’t have access to this area. Ask your GQUENCE administrator to grant it.</p>
        {access.modules.length > 0 && (
          <p style={{ marginTop: 12 }}>
            Go to: {access.modules.map(m => <a key={m.code} href={moduleHref(m)} style={{ marginRight: 12 }}>{m.name}</a>)}
          </p>
        )}
      </Card>
    </>
  );
}
