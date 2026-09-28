import type { RouteObject } from 'react-router-dom';
import { RequireAdmin } from '../../core/guards';
import { Layout } from '../../ui';
import { AccessPage } from './pages/AccessPage';

export const adminRoutes: RouteObject = {
  path: 'admin',
  element: <RequireAdmin><Layout nav={[{ to: '/admin/access', label: 'Module Access' }]} /></RequireAdmin>,
  children: [{ path: 'access', element: <AccessPage /> }],
};
