import { Link } from 'react-router-dom';

export default function ViewToggle({ current }) {
  return (
    <div className="view-toggle" role="group" aria-label="Log view">
      <Link to="/list" className={current === 'list' ? 'active' : ''} aria-current={current === 'list' ? 'page' : undefined}>
        List
      </Link>
      <Link to="/calendar" className={current === 'calendar' ? 'active' : ''} aria-current={current === 'calendar' ? 'page' : undefined}>
        Calendar
      </Link>
    </div>
  );
}
