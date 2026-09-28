import type { RouteObject } from 'react-router-dom';
import { RequireAdmin } from '../../core/guards';
import { Layout } from '../../ui';
import { RuleEditPage } from '../fertility/rules/pages/RuleEditPage';
import { RulesPage } from '../fertility/rules/pages/RulesPage';
import { AccessPage } from './pages/AccessPage';
import { IngredientEditPage } from '../fertility/ingredients/IngredientEditPage';
import { IngredientsPage } from '../fertility/ingredients/IngredientsPage';

export const adminRoutes: RouteObject = {
  path: 'admin',
  element: <RequireAdmin><Layout nav={[{ to: '/admin/access', label: 'Module Access' }, { to: '/admin/fertility-rules', label: 'Fertility Rules' }, { to: '/admin/fertility-ingredients', label: 'Ingredients' }]} /></RequireAdmin>,
  children: [
    { path: 'access', element: <AccessPage /> },
    { path: 'fertility-rules', element: <RulesPage /> },
    { path: 'fertility-rules/:ruleId', element: <RuleEditPage /> },
    { path: 'fertility-ingredients', element: <IngredientsPage /> },
    { path: 'fertility-ingredients/:ingredientId', element: <IngredientEditPage /> },
  ],
};
