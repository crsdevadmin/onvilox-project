import { Navigate } from 'react-router-dom';
import { useAccess } from '../../../core/AccessContext';
import { isStoreRole } from '../../../core/types';
import { FertilityHome } from './FertilityHome';

/** /app/fertility — clinicians get their home; store staff go to the store screen. */
export function FertilityIndex() {
  const { roleIn } = useAccess();
  const role = roleIn('fertility');
  if (isStoreRole(role ?? undefined)) return <Navigate to="store" replace />;
  if (role === 'COORDINATOR') return <Navigate to="/no-access" replace />;
  return <FertilityHome />;
}
