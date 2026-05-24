// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Porsche provider — uses Playwright to scrape working student and internship positions
// Detects from careers_url containing 'jobs.porsche.com'
// Handles two separate URLs: one for Werkstudent (working student), one for Praktikum (internship)

/**
 * @param {string | undefined} url
 * @returns {string | null}
 */
function detectPorscheUrl(url) {
  if (!url) return null;
  if (url.includes('jobs.porsche.com')) {
    return url;
  }
  return null;
}

/**
 * Determine job type from URL parameters
 * @param {string} url
 * @returns {string}
 */
function getJobTypeLabel(url) {
  const isWerkstudent = url.includes('entry_level%5B%5D=4') || url.includes('entry_level=4');
  return isWerkstudent ? 'Working Student' : 'Internship';
}

/**
 * @param {string} url
 * @returns {Promise<Array<{title: string, url: string}>>}
 */
async function scrapeWithDomExtraction(url) {
  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
      ],
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // Navigate to the page
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {
      return page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    });

    // Wait for Porsche's dynamic job results to populate
    await page.waitForTimeout(5000);

    const jobTypeLabel = getJobTypeLabel(url);

    // Extract jobs from DOM
    const jobs = await page.evaluate(() => {
      /** @type {Array<{title: string, url: string}>} */
      const results = [];

      // Target all anchor tags pointing to job details
      const jobLinks = document.querySelectorAll('a[href*="ac=jobad"]');

      jobLinks.forEach((link) => {
        const title = link instanceof HTMLElement ? (link.innerText ? link.innerText.trim() : '') : '';
        const relativeHref = link instanceof HTMLAnchorElement ? (link.getAttribute('href') || '') : '';

        if (title && relativeHref) {
          // Construct absolute URL
          let directUrl = relativeHref;
          if (relativeHref.startsWith('/')) {
            directUrl = `https://jobs.porsche.com${relativeHref}`;
          } else if (!relativeHref.startsWith('http')) {
            directUrl = `https://jobs.porsche.com/index.php${relativeHref.startsWith('?') ? '' : '/'}${relativeHref}`;
          }

          results.push({
            title: title,
            url: directUrl,
          });
        }
      });

      // Deduplicate by title
      return Array.from(new Map(results.map(item => [item.title, item])).values());
    });

    await context.close();
    return jobs;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`porsche: Playwright error: ${message}`);
  } finally {
    if (browser) await browser.close();
  }
}

/** @type {Provider} */
export default {
  id: 'porsche',

  detect(entry) {
    const porscheUrl = detectPorscheUrl(entry.careers_url);
    return porscheUrl ? { url: porscheUrl } : null;
  },

  async fetch(entry, ctx) {
    const porscheUrl = detectPorscheUrl(entry.careers_url);
    if (!porscheUrl) throw new Error(`porsche: cannot detect Porsche URL for ${entry.name}`);

    /** @type {Array<{title: string, url: string}>} */
    let jobs = [];
    try {
      jobs = await scrapeWithDomExtraction(porscheUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️  porsche provider warning for ${entry.name}: ${message}`);
      jobs = [];
    }

    return jobs.map(j => ({
      title: j.title || '',
      url: j.url || '',
      company: entry.name,
      location: 'Germany',
    }));
  },
};
