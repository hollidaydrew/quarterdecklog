// The user fields the browser is allowed to see.
export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    is_admin: !!user.is_admin,
    must_change_password: !!user.must_change_password,
    preferred_view: user.preferred_view === 'calendar' ? 'calendar' : 'list',
  };
}
