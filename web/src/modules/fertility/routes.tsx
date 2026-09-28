// Everything the Fertility module adds to the shell. App.tsx only mounts this.
import type { RouteObject } from 'react-router-dom';
import { RequireModule } from '../../core/guards';
import { Layout } from '../../ui';
import { CaseDetail } from './pages/CaseDetail';
import { FertilityIndex } from './pages/FertilityIndex';
import { FertilityStoreHome } from './pages/FertilityStoreHome';
import { NewCase } from './pages/NewCase';

const CLINICAL = ['DOCTOR', 'ASSISTANT', 'DIETITIAN'];
const STORE = ['STORE', 'STORE_APPROVER'];

export const fertilityRoutes: RouteObject = {
  path: 'fertility',
  element: <RequireModule code="fertility"><Layout module="fertility" /></RequireModule>,
  children: [
    { index: true, element: <FertilityIndex /> },
    { path: 'new', element: <RequireModule code="fertility" roles={['DOCTOR', 'ASSISTANT']}><NewCase /></RequireModule> },
    { path: 'store', element: <RequireModule code="fertility" roles={STORE}><FertilityStoreHome /></RequireModule> },
    { path: ':caseId', element: <RequireModule code="fertility" roles={CLINICAL}><CaseDetail /></RequireModule> },
  ],
};
