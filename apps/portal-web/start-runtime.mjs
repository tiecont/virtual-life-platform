let valid = false;
try {
  for (const name of ['API_INTERNAL_URL', 'PUBLIC_SOCKET_ORIGIN']) {
    const value = process.env[name], origin = new URL(value);
    if (!value || origin.origin !== value || !['http:', 'https:'].includes(origin.protocol) || name === 'PUBLIC_SOCKET_ORIGIN' && origin.protocol !== 'https:') throw Error();
  }
  valid = true;
} catch { console.error('Portal runtime configuration unavailable'); process.exitCode = 1; }
if (valid) await import('./server.js');
