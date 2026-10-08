import { api } from '../api.js';

// Shown when a person has reached the limit of 5 trusted devices (two-step
// sign-in). Closing it keeps it closed until they drop below 5 and reach 5 again.
export default function DeviceNotice({ onOpenProfile, onChanged }) {
  const close = async () => {
    try {
      await api.post('/api/me/mfa/warning/dismiss');
    } catch {
      // it simply shows again next time
    }
    await onChanged();
  };
  return (
    <div className="notice-banner" role="status">
      <p>
        Maximum 5 active logged in devices. Visit your profile to free up a device slot
        {' '}
        <button type="button" className="secondary" style={{ padding: '2px 10px', marginLeft: 6 }} onClick={onOpenProfile}>My profile</button>
      </p>
      <button type="button" className="secondary" style={{ padding: '2px 10px' }} onClick={close}>Close</button>
    </div>
  );
}
