import { Outlet } from 'react-router-dom';
import type { ModuleCode } from '../core/types';
import { TopBar, type NavItem } from './TopBar';

/** Page frame for a module: shared top bar + the current screen. */
export function Layout({ module, nav }: { module?: ModuleCode; nav?: NavItem[] }) {
  return (
    <>
      <TopBar module={module} nav={nav} />
      <main className="container page gq-shell-main"><Outlet /></main>
    </>
  );
}
