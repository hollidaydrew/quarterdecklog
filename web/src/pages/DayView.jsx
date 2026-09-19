import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import DayEntries from '../components/DayEntries.jsx';

// The calendar's "click a day" page. Entries themselves live in DayEntries so
// the list view can share them.
export default function DayView({ user, onViewUsed }) {
  const { date } = useParams();

  useEffect(() => {
    if (user.preferred_view !== 'calendar') onViewUsed('calendar');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <DayEntries date={date} user={user} backLink={{ to: '/calendar', label: 'Calendar' }} />;
}
