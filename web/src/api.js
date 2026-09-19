// When the server says the session is gone (401) or a temporary password must
// be replaced (403 PASSWORD_CHANGE_REQUIRED), the app registers a handler here
// that re-checks who is signed in, which swaps the screen to login (or to the
// change-password screen) instead of leaving a broken page behind.
let sessionProblemHandler = null;

export function onSessionProblem(handler) {
  sessionProblemHandler = handler;
  return () => {
    if (sessionProblemHandler === handler) sessionProblemHandler = null;
  };
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // no JSON body (e.g. 204)
  }

  if (!res.ok) {
    // A wrong password on the login form is also a 401, so it is excluded.
    const sessionEnded = res.status === 401 && url !== '/api/auth/login';
    const mustChangePassword = res.status === 403 && data && data.code === 'PASSWORD_CHANGE_REQUIRED';
    if ((sessionEnded || mustChangePassword) && sessionProblemHandler) sessionProblemHandler();
    throw new Error((data && data.error) || `Request failed with status ${res.status}`);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
};
