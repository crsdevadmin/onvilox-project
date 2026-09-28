import { Link } from 'react-router-dom';
import { Card, PageHeader } from '../ui';

export function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <Card><Link to="/choose">Back to start</Link></Card>
    </>
  );
}
