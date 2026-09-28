// The shell only wires modules together. Each module owns its routes in
// src/modules/<code>/routes.tsx; adding a module = one import + one line here.
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AccessProvider } from './core/AccessContext';
import { Layout, Loading } from './ui';
import { ChooseModule } from './pages/ChooseModule';
import { NoAccess } from './pages/NoAccess';
import { NotFound } from './pages/NotFound';
import { fertilityRoutes } from './modules/fertility/routes';
import { adminRoutes } from './modules/admin/routes';

const router = createBrowserRouter([
  {
    path: '/',
    children: [
      { index: true, element: <Navigate to="/choose" replace /> },
      fertilityRoutes,
      adminRoutes,
      { element: <Layout />, children: [
        { path: 'choose', element: <ChooseModule /> },
        { path: 'no-access', element: <NoAccess /> },
        { path: '*', element: <NotFound /> },
      ] },
    ],
  },
], { basename: '/app' });

export function App() {
  return (
    <AccessProvider fallback={<Loading what="Signing you in" />}>
      <RouterProvider router={router} />
    </AccessProvider>
  );
}
