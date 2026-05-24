// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Bosch provider — uses SmartRecruiters API to fetch student and working student positions
// Detects from careers_url containing 'smartrecruiters.com' or 'bosch'
// No Playwright needed — direct HTTP API calls

/**
 * @param {string | undefined} url
 * @returns {string | null}
 */
function detectBoschUrl(url) {
  if (!url) return null;
  if (url.includes('smartrecruiters.com') || url.includes('bosch') || url.includes('jobs.bosch')) {
    return url;
  }
  return null;
}

/**
 * @param {string} url
 * @param {object} ctx - Context with fetchJson
 * @returns {Promise<Array<{title: string, url: string, location: string}>>}
 */
async function fetchFromSmartRecruiters(url, ctx) {
  try {
    // Ensure URL has proper query parameters for student positions in Germany
    let apiUrl = url;
    if (!apiUrl.includes('limit=')) {
      apiUrl = apiUrl.includes('?') ? `${apiUrl}&limit=100` : `${apiUrl}?limit=100`;
    }
    if (!apiUrl.includes('entryLevel=')) {
      apiUrl = `${apiUrl}&entryLevel=student`;
    }
    if (!apiUrl.includes('country=')) {
      apiUrl = `${apiUrl}&country=de`;
    }

    const json = await ctx.fetchJson(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeoutMs: 15000,
    });

    /** @type {Array<{title: string, url: string, location: string}>} */
    const jobs = [];

    // SmartRecruiters structure: { content: [...], paging: {...} }
    const items = Array.isArray(json?.content) ? json.content : [];

    for (const item of items) {
      const title = item.name || '';
      const id = item.id || '';
      const location = item.location ? `${item.location.city || ''}, ${item.location.country || 'Germany'}`.trim() : 'Germany';
      const applyUrl = id ? `https://jobs.smartrecruiters.com/BoschGroup1/${id}` : '';

      if (title && applyUrl) {
        jobs.push({
          title,
          url: applyUrl,
          location,
        });
      }
    }

    return jobs;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`bosch: SmartRecruiters API error: ${message}`);
  }
}

/** @type {Provider} */
export default {
  id: 'bosch',

  detect(entry) {
    const boschUrl = detectBoschUrl(entry.careers_url);
    return boschUrl ? { url: boschUrl } : null;
  },

  async fetch(entry, ctx) {
    const boschUrl = detectBoschUrl(entry.careers_url);
    if (!boschUrl) throw new Error(`bosch: cannot detect Bosch URL for ${entry.name}`);

    /** @type {Array<{title: string, url: string, location: string}>} */
    let jobs = [];
    try {
      jobs = await fetchFromSmartRecruiters(boschUrl, ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️  bosch provider warning for ${entry.name}: ${message}`);
      jobs = [];
    }

    return jobs.map(j => ({
      title: j.title || '',
      url: j.url || '',
      company: entry.name,
      location: j.location || 'Germany',
    }));
  },
};
