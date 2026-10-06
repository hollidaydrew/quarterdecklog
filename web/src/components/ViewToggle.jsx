import { Link } from 'react-router-dom';

const VIEWS = [
  { key: 'list', to: '/list', label: 'List' },
  { key: 'calendar', to: '/calendar', label: 'Calendar' },
  { key: 'rollup', to: '/rollup', label: 'Rollup' },
];

export default function ViewToggle({ current }) {
  return (
    <div className="view-toggle" role="group" aria-label="Log view">
      {VIEWS.map(({ key, to, label }) => (
        <Link key={key} to={to} className={current === key ? 'active' : ''} aria-current={current === key ? 'page' : undefined}>
          {label}
        </Link>
      ))}
    </div>
  );
}
