import assert from 'node:assert/strict';

// Docker interface changes can interrupt Chromium's read-only document request.
// Only these GET navigations may retry; application assertions run once afterward.
export async function navigateImagePage(page, path, attempts) {
  assert(['/', '/identity'].includes(path), 'Only reviewed image smoke GET pages may retry');
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await page.goto(path, {timeout: 10000});
      attempts.push({path, attempt, result: 'LOADED'});
      return response;
    } catch (error) {
      if (!/^page\.goto: net::ERR_NETWORK_CHANGED(?: at |\n|$)/.test(error.message ?? '')) throw error;
      attempts.push({path, attempt, result: 'ERR_NETWORK_CHANGED'});
      if (attempt === 3) throw error;
    }
  }
}
