// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// BMW provider — uses Playwright to scrape working student positions from BMW careers portal
// Detects from careers_url containing 'bmwgroup.jobs'
// Targets working student listings and extracts with keyword filtering

/**
 * @param {string | undefined} url
 * @returns {string | null}
 */
function detectBmwUrl(url) {
  if (!url) return null;
  if (url.includes('bmwgroup.jobs')) {
    return url;
  }
  return null;
}

/**
 * @param {string} url
 * @returns {Promise<Array<{title: string, url: string}>>}
 */
async function scrapeWithDomExtraction(url) {
  let browser;
  try {
    const { chromium } = await import('playwright');
    // Launch with some anti-detection measures
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-web-resources',
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

    // Wait for JavaScript framework to populate job cards
    await page.waitForTimeout(5000);

    // Extract jobs using DOM inspection with keyword filtering
    const jobs = await page.evaluate(() => {
      /** @type {Array<{title: string, url: string}>} */
      const results = [];

      // Target job listing elements more precisely
      const cards = document.querySelectorAll('[class*="job"], [class*="vacancy"], [class*="position"], [class*="listing"], li[class*="item"]');

      if (cards.length === 0) {
        // Fallback: target all h3, li with links
        const fallbackCards = document.querySelectorAll('h3, li');
        fallbackCards.forEach((card) => {
          const title = card instanceof HTMLElement ? (card.innerText ? card.innerText.trim() : '') : '';
          const keywords = ['robotik', 'robotics', 'machine learning', 'ai', 'ki', 'werkstudent', 'internship', 'praktikum', 'student', 'entwicklung', 'engineer'];
          const matchesKeyword = keywords.some(kw => title.toLowerCase().includes(kw));

          // More strict length check to avoid generic headers
          if (title && matchesKeyword && title.length > 15 && title.length < 120 && !title.includes('Check out') && !title.includes('Events') && !title.includes('OFFER')) {
            let linkEl = null;
            if (card instanceof HTMLAnchorElement) {
              linkEl = card;
            } else {
              linkEl = card.querySelector('a');
              if (!linkEl) linkEl = card.closest('a');
            }

            const linkHref = linkEl instanceof HTMLAnchorElement ? linkEl.href : '';
            let cleanId = '';
            const potentialIdStr = (card instanceof HTMLElement ? card.getAttribute('data-job-id') : '') || card.id || linkHref || '';
            const match = potentialIdStr.match(/\d{6,8}/);

            if (match) {
              cleanId = match[0];
            }

            const directUrl = cleanId
              ? `https://www.bmwgroup.jobs/de/en/jobs/description.${cleanId}.html`
              : linkHref || 'https://www.bmwgroup.jobs/de/en/students/workingstudent.html';

            if (title && directUrl) {
              results.push({
                title: title,
                url: directUrl,
              });
            }
          }
        });
      } else {
        // Process targeted job cards
        cards.forEach((card) => {
          const title = card instanceof HTMLElement ? (card.innerText ? card.innerText.trim() : '') : '';
          const keywords = ['robotik', 'robotics', 'machine learning', 'ai', 'ki', 'werkstudent', 'internship', 'praktikum', 'student', 'entwicklung', 'engineer'];
          const matchesKeyword = keywords.some(kw => title.toLowerCase().includes(kw));

          if (title && matchesKeyword && title.length > 15 && title.length < 120) {
            let linkEl = null;
            if (card instanceof HTMLAnchorElement) {
              linkEl = card;
            } else {
              linkEl = card.querySelector('a');
              if (!linkEl) linkEl = card.closest('a');
            }

            const linkHref = linkEl instanceof HTMLAnchorElement ? linkEl.href : '';
            let cleanId = '';
            const potentialIdStr = (card instanceof HTMLElement ? card.getAttribute('data-job-id') : '') || card.id || linkHref || '';
            const match = potentialIdStr.match(/\d{6,8}/);

            if (match) {
              cleanId = match[0];
            }

            const directUrl = cleanId
              ? `https://www.bmwgroup.jobs/de/en/jobs/description.${cleanId}.html`
              : linkHref || 'https://www.bmwgroup.jobs/de/en/students/workingstudent.html';

            if (title && directUrl) {
              results.push({
                title: title,
                url: directUrl,
              });
            }
          }
        });
      }

      // Deduplicate by title
      return Array.from(new Map(results.map(item => [item.title, item])).values());
    });

    await context.close();
    return jobs;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`bmw: Playwright error: ${message}`);
  } finally {
    if (browser) await browser.close();
  }
}

/** @type {Provider} */
export default {
  id: 'bmw',

  detect(entry) {
    const bmwUrl = detectBmwUrl(entry.careers_url);
    return bmwUrl ? { url: bmwUrl } : null;
  },

  async fetch(entry, ctx) {
    const bmwUrl = detectBmwUrl(entry.careers_url);
    if (!bmwUrl) throw new Error(`bmw: cannot detect BMW URL for ${entry.name}`);

    /** @type {Array<{title: string, url: string}>} */
    let jobs = [];
    try {
      jobs = await scrapeWithDomExtraction(bmwUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️  bmw provider warning for ${entry.name}: ${message}`);
      jobs = [];
    }

    return jobs.map(j => ({
      title: j.title || '',
      url: j.url || '',
      company: entry.name,
      location: 'Germany', // BMW positions are Germany-based
    }));
  },
};
