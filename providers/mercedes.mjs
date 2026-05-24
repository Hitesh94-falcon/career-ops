// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Mercedes-Benz provider — uses Playwright to intercept backend API responses
// Detects from careers_url containing 'jobs.mercedes-benz.com'
// Captures JSON job data from network responses, no DOM parsing needed

/**
 * @param {string | undefined} url
 * @returns {string | null}
 */
function detectMercedesUrl(url) {
  if (!url) return null;
  if (url.includes('jobs.mercedes-benz.com') || url.includes('mercedes-benz.com')) {
    return url;
  }
  return null;
}

/**
 * @param {string} url
 * @returns {Promise<Array<{title: string, url: string, location: string}>>}
 */
async function scrapeWithNetworkInterception(url) {
  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (career-ops)',
    });
    const page = await context.newPage();

    /** @type {Array<{title: string, url: string, location: string}>} */
    const capturedJobs = [];

    // Intercept network responses to capture API job data
    page.on('response', async (response) => {
      const responseUrl = response.url();
      // Mercedes API endpoints often contain 'search' or 'data' parameters
      if ((responseUrl.includes('search') || responseUrl.includes('/data')) && response.status() === 200) {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (!contentType.includes('application/json')) return;

          const jsonBody = await response.json();

          // Parse Mercedes job structure: SearchResult.SearchResultItems[].MatchedObjectDescriptor
          const items = jsonBody?.SearchResult?.SearchResultItems || [];
          if (!Array.isArray(items)) return;

          for (const item of items) {
            const job = item.MatchedObjectDescriptor || {};
            const locations = job.PositionLocation || [];
            const locationText = locations.length > 0 ? locations[0].DisplayName : '';
            const title = job.PositionTitle || '';
            const applyUrl = job.PositionURI || '';

            if (title && applyUrl) {
              capturedJobs.push({
                title,
                url: applyUrl,
                location: locationText,
              });
            }
          }
        } catch (err) {
          // Silently skip non-JSON responses
        }
      }
    });

    // Navigate and wait for network activity
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {
      // If networkidle times out, proceed
      return page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    });

    // Wait a bit for any lingering API calls
    await page.waitForTimeout(4000);

    // Fallback: if no jobs captured, try scrolling to trigger more API calls
    if (capturedJobs.length === 0) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(3000);
    }

    await context.close();
    return capturedJobs;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`mercedes: Playwright error: ${message}`);
  } finally {
    if (browser) await browser.close();
  }
}

/** @type {Provider} */
export default {
  id: 'mercedes',

  detect(entry) {
    const mercedesUrl = detectMercedesUrl(entry.careers_url);
    return mercedesUrl ? { url: mercedesUrl } : null;
  },

  async fetch(entry, ctx) {
    const mercedesUrl = detectMercedesUrl(entry.careers_url);
    if (!mercedesUrl) throw new Error(`mercedes: cannot detect Mercedes URL for ${entry.name}`);

    /** @type {Array<{title: string, url: string, location: string}>} */
    let jobs = [];
    try {
      jobs = await scrapeWithNetworkInterception(mercedesUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️  mercedes provider warning for ${entry.name}: ${message}`);
      jobs = [];
    }

    return jobs.map(j => ({
      title: j.title || '',
      url: j.url || '',
      company: entry.name,
      location: j.location || '',
    }));
  },
};
