import assert from 'node:assert/strict';

// Diagnostics retain route categories and error codes, never URLs, bodies,
// headers, credentials or arbitrary browser error messages.
export function observeImageBrowser(context, origin, observations) {
  const route = request => {
    const url = new URL(request.url());
    if (url.origin !== origin) return 'OTHER_ORIGIN';
    if (['/', '/identity', '/admin', '/v1/me', '/v1/session/guest', '/api/admin/session', '/api/admin/login'].includes(url.pathname)) return url.pathname;
    return url.pathname.startsWith('/_next/static/') ? 'FRAMEWORK_ASSET' : 'OTHER_ROUTE';
  };
  const record = value => {if (observations.length < 48) observations.push(value);};
  context.on('page', page => {
    page.on('requestfailed', request => {
      const code = request.failure()?.errorText;
      record({event: 'REQUEST_FAILED', route: route(request), code: /^net::ERR_[A-Z_]+$/.test(code ?? '') ? code : 'OTHER_FAILURE'});
    });
    page.on('response', response => {
      const request = response.request(), category = route(request);
      if (response.status() >= 400 || ['document', 'fetch', 'xhr'].includes(request.resourceType())) record({event: 'RESPONSE', route: category, status: response.status()});
    });
    page.on('pageerror', error => record({event: 'PAGE_ERROR', name: ['Error', 'TypeError', 'ReferenceError', 'SyntaxError'].includes(error.name) ? error.name : 'OTHER_ERROR'}));
    page.on('console', message => {if (message.type() === 'error') record({event: 'CONSOLE_ERROR'});});
  });
}

// Docker interface changes can interrupt Chromium's read-only document request.
// Only these GET navigations may retry; application assertions run once afterward.
export async function navigateImagePage(page, path, attempts) {
  assert(['/', '/identity'].includes(path), 'Only reviewed image smoke GET pages may retry');
  for (let attempt = 1; attempt <= 3; attempt++) {
    const observedPage = page;
    const failures = [];
    const failed = request => {
      if (request.isNavigationRequest() && request.frame() === observedPage.mainFrame() && failures.length < 4) {
        const code = request.failure()?.errorText;
        failures.push(/^net::ERR_[A-Z_]+$/.test(code ?? '') ? code : 'OTHER_NAVIGATION_FAILURE');
      }
    };
    page.on('requestfailed', failed);
    try {
      const response = await page.goto(path, {timeout: 10000});
      const internalErrorDocument = page.url().startsWith('chrome-error:');
      const observation = {path, attempt, result: internalErrorDocument || response === null ? 'NO_APPLICATION_DOCUMENT' : 'LOADED',
        status: response?.status() ?? null, internalErrorDocument, failures};
      attempts.push(observation);
      assert(!observation.internalErrorDocument && response !== null, 'Image navigation did not return an application document');
      return {page, response};
    } catch (error) {
      if (!/^page\.goto: net::ERR_NETWORK_CHANGED(?: at |\n|$)/.test(error.message ?? '')) throw error;
      attempts.push({path, attempt, result: 'ERR_NETWORK_CHANGED'});
      // Chromium may still commit its internal error document after goto rejects.
      // Retire that page before retrying; the context retains cookies and TLS policy.
      const context = page.context();
      await page.close();
      if (attempt === 3) throw error;
      page = await context.newPage();
    } finally {observedPage.off('requestfailed', failed);}
  }
}
