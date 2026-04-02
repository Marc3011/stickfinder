// Scraper module — fetches latest stick data from official brand websites
// Uses Puppeteer for JS-rendered sites and Shopify JSON API for Bauer
// Runs daily via cron to keep the database current

const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'sticks.json');
const SCRAPE_LOG = path.join(__dirname, 'data', 'scrape-log.json');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ============================================================
// BAUER — Shopify products.json API (no browser needed)
// ============================================================
async function scrapeBauer() {
  console.log('[Scraper] Scraping Bauer via Shopify products.json...');
  const sticks = [];
  let page = 1;
  const maxPages = 5;

  while (page <= maxPages) {
    try {
      const url = `https://www.bauer.com/collections/hockey-sticks/products.json?page=${page}&limit=50`;
      const { data } = await axios.get(url, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 15000,
      });

      if (!data.products || data.products.length === 0) break;

      for (const product of data.products) {
        const title = product.title || '';
        // Only include actual hockey sticks (not accessories, tape, etc.)
        if (!title.toLowerCase().includes('stick') && !title.toLowerCase().includes('proto') && !title.toLowerCase().includes('nexus') && !title.toLowerCase().includes('vapor') && !title.toLowerCase().includes('supreme') && !title.toLowerCase().includes('ag5nt') && !title.toLowerCase().includes('pulse') && !title.toLowerCase().includes('flylite') && !title.toLowerCase().includes('flypro')) {
          continue;
        }

        // Extract model from title (remove "BAUER" prefix and size suffix)
        const model = title
          .replace(/^BAUER\s+/i, '')
          .replace(/\s+(STOCK|GRIP|SENIOR|INTERMEDIATE|JUNIOR|INT|SR|JR)\s*.*$/i, '')
          .trim();

        // Extract sizes from variants
        const sizes = new Set();
        const flexes = new Set();
        const curves = new Set();
        for (const variant of product.variants || []) {
          const options = [variant.option1, variant.option2, variant.option3].filter(Boolean);
          for (const opt of options) {
            const lower = opt.toLowerCase();
            if (lower.includes('junior') || lower === 'jr') sizes.add('junior');
            if (lower.includes('intermediate') || lower === 'int') sizes.add('intermediate');
            if (lower.includes('senior') || lower === 'sr') sizes.add('senior');
            // Flex values
            if (/^\d+$/.test(opt) && parseInt(opt) >= 20 && parseInt(opt) <= 120) flexes.add(opt);
            // Blade patterns (P28, P92, P88, etc.)
            if (/^P\d+/i.test(opt)) curves.add(opt.toUpperCase());
          }
        }

        sticks.push({
          brand: 'Bauer',
          rawName: model,
          rawTitle: title,
          handle: product.handle,
          sizes: [...sizes],
          bladePatterns: [...curves],
          flexes: [...flexes],
          productType: product.product_type || '',
          tags: product.tags || [],
          url: `https://www.bauer.com/products/${product.handle}`,
          image: product.images?.[0]?.src || null,
        });
      }

      page++;
    } catch (err) {
      console.log(`[Scraper] Bauer page ${page} error: ${err.message}`);
      break;
    }
  }

  // Deduplicate by model name
  const seen = new Set();
  const unique = sticks.filter(s => {
    const key = s.rawName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[Scraper] Bauer: found ${unique.length} unique stick models`);
  return unique;
}

// ============================================================
// PUPPETEER HELPER — shared browser instance
// ============================================================
let browser = null;

async function getBrowser() {
  if (!browser) {
    const launchOpts = {
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    };
    // Use system Chromium in Docker (set via PUPPETEER_EXECUTABLE_PATH)
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    browser = await puppeteer.launch(launchOpts);
  }
  return browser;
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

async function scrapeWithPuppeteer(url, extractFn, brand) {
  console.log(`[Scraper] Scraping ${brand} via Puppeteer: ${url}`);
  const b = await getBrowser();
  const page = await b.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.setViewport({ width: 1440, height: 900 });

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    // Wait extra for JS rendering
    await new Promise(r => setTimeout(r, 3000));

    const sticks = await page.evaluate(extractFn);
    console.log(`[Scraper] ${brand}: found ${sticks.length} items from ${url}`);
    return sticks;
  } catch (err) {
    console.log(`[Scraper] ${brand} error on ${url}: ${err.message}`);
    return [];
  } finally {
    await page.close();
  }
}

// ============================================================
// CCM — Salesforce Commerce Cloud (SFCC/SFRA)
// ============================================================
async function scrapeCCM() {
  // CCM uses Salesforce Commerce Cloud — products are JS-rendered
  // EU store uses /en-se/ locale prefix; US store is on us.ccmhockey.com
  const urls = [
    'https://www.ccmhockey.com/en-se/sticks',
    'https://us.ccmhockey.com/Sticks/Shop-All-Sticks',
  ];

  const allSticks = [];
  for (const url of urls) {
    const b = await getBrowser();
    const page = await b.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1440, height: 900 });

    try {
      console.log(`[Scraper] Scraping CCM: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for product tiles to render (JS-rendered)
      await page.waitForSelector('.product-tile, .product-card, [data-pid], .product-item', { timeout: 10000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 3000));

      // Try multiple extraction strategies
      const sticks = await page.evaluate(() => {
        const items = [];

        // Strategy 1: Product tiles (SFCC standard)
        document.querySelectorAll('.product-tile, .product-card, [data-pid]').forEach(tile => {
          const nameEl = tile.querySelector('.pdp-link a, .product-name a, .product-tile-name, h3 a, h2 a, .link');
          const linkEl = tile.querySelector('a[href]');
          const imgEl = tile.querySelector('img');
          const name = nameEl ? nameEl.textContent.trim() : '';
          const href = linkEl ? linkEl.getAttribute('href') : '';
          const img = imgEl ? imgEl.getAttribute('src') || imgEl.getAttribute('data-src') : '';
          if (name) items.push({ brand: 'CCM', rawName: name, url: href, image: img });
        });

        // Strategy 2: JSON-LD structured data (ItemList)
        if (items.length === 0) {
          document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
            try {
              const data = JSON.parse(script.textContent);
              if (data['@type'] === 'ItemList' && data.itemListElement) {
                data.itemListElement.forEach(item => {
                  const name = item.name || item.item?.name || '';
                  const href = item.url || item.item?.url || '';
                  if (name) items.push({ brand: 'CCM', rawName: name, url: href, image: '' });
                });
              }
            } catch (e) {}
          });
        }

        // Strategy 3: Extract from dw.ac._capture analytics calls
        if (items.length === 0) {
          const scripts = document.querySelectorAll('script');
          scripts.forEach(s => {
            const text = s.textContent || '';
            const matches = text.matchAll(/dw\.ac\._capture\(\{[^}]*id\s*:\s*['"]([^'"]+)['"]/g);
            for (const m of matches) {
              items.push({ brand: 'CCM', rawName: m[1], url: '', image: '' });
            }
          });
        }

        return items;
      });

      console.log(`[Scraper] CCM: found ${sticks.length} items from ${url}`);
      allSticks.push(...sticks);
    } catch (err) {
      console.log(`[Scraper] CCM error on ${url}: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  // Deduplicate
  const seen = new Set();
  return allSticks.filter(s => {
    const key = s.rawName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================
// WARRIOR — Salesforce Commerce Cloud (SFCC)
// ============================================================
async function scrapeWarrior() {
  const urls = [
    'https://www.warrior.com/hockey_sticks',
    'https://www.warrior.com/hockey_sticks?start=24&sz=24',
  ];

  const allSticks = [];
  for (const url of urls) {
    const sticks = await scrapeWithPuppeteer(url, () => {
      const items = [];
      const tiles = document.querySelectorAll('.product-tile, .product-card, [data-pid]');
      tiles.forEach(tile => {
        const nameEl = tile.querySelector('.pdp-link a, .product-name a, .product-tile-name, h3 a, h2 a');
        const linkEl = tile.querySelector('a[href*="hockey"]') || tile.querySelector('a');
        const imgEl = tile.querySelector('img');

        const name = nameEl ? nameEl.textContent.trim() : '';
        const href = linkEl ? linkEl.getAttribute('href') : '';
        const img = imgEl ? imgEl.getAttribute('src') || imgEl.getAttribute('data-src') : '';

        if (name && (name.toLowerCase().includes('stick') || name.toLowerCase().includes('lx') || name.toLowerCase().includes('novium') || name.toLowerCase().includes('covert') || name.toLowerCase().includes('qr') || name.toLowerCase().includes('rise') || name.toLowerCase().includes('alpha'))) {
          items.push({ brand: 'Warrior', rawName: name, url: href, image: img });
        }
      });
      return items;
    }, 'Warrior');

    allSticks.push(...sticks);
  }

  const seen = new Set();
  return allSticks.filter(s => {
    const key = s.rawName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================
// TRUE — Magento 2 / Adobe Commerce
// ============================================================
async function scrapeTrue() {
  // true-hockey.com redirects to custom skates — the stick store is true-sports.com
  const urls = [
    'https://www.true-sports.com/hockey/hockey-shop-all/hockey-sticks-shafts-blades.html',
    'https://www.true-sports.com/hockey/hockey-shop-all.html',
  ];

  const allSticks = [];
  for (const url of urls) {
    const b = await getBrowser();
    const page = await b.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1440, height: 900 });

    try {
      console.log(`[Scraper] Scraping True: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 3000));

      const sticks = await page.evaluate(() => {
        const items = [];

        // Strategy 1: Magento product items
        document.querySelectorAll('.product-item, .product-item-info, li.item').forEach(el => {
          const nameEl = el.querySelector('.product-item-name .product-item-link, .product-item-link, .product-name a, a > strong, h3 a, h2 a');
          const linkEl = el.querySelector('a[href*="true-sports.com"]') || el.querySelector('a[href]');
          const imgEl = el.querySelector('img.product-image-photo, img');

          const name = nameEl ? nameEl.textContent.trim() : '';
          const href = linkEl ? linkEl.getAttribute('href') : '';
          const img = imgEl ? imgEl.getAttribute('src') || imgEl.getAttribute('data-src') : '';

          if (name && name.length > 3 && (
            name.toLowerCase().includes('hzrdus') ||
            name.toLowerCase().includes('catalyst') ||
            name.toLowerCase().includes('project x') ||
            name.toLowerCase().includes('stick') ||
            name.toLowerCase().includes('player')
          )) {
            items.push({ brand: 'True', rawName: name, url: href, image: img });
          }
        });

        // Strategy 2: GTM dataLayer ecommerce data
        if (items.length === 0 && window.dataLayer) {
          for (const entry of window.dataLayer) {
            if (entry.ecommerce && entry.ecommerce.items) {
              for (const item of entry.ecommerce.items) {
                if (item.item_name && (
                  item.item_name.toLowerCase().includes('stick') ||
                  item.item_name.toLowerCase().includes('hzrdus') ||
                  item.item_name.toLowerCase().includes('project x') ||
                  item.item_name.toLowerCase().includes('catalyst')
                )) {
                  items.push({
                    brand: 'True',
                    rawName: item.item_name,
                    url: '',
                    image: '',
                    price: item.price || null,
                  });
                }
              }
            }
          }
        }

        // Strategy 3: Fallback — look for product links with key brand names
        if (items.length === 0) {
          document.querySelectorAll('a').forEach(a => {
            const text = a.textContent.trim();
            const href = a.getAttribute('href') || '';
            if (text && text.length > 5 && (
              text.toLowerCase().includes('hzrdus') ||
              text.toLowerCase().includes('catalyst') ||
              text.toLowerCase().includes('project x')
            )) {
              items.push({ brand: 'True', rawName: text, url: href, image: '' });
            }
          });
        }

        return items;
      });

      console.log(`[Scraper] True: found ${sticks.length} items from ${url}`);
      allSticks.push(...sticks);
    } catch (err) {
      console.log(`[Scraper] True error on ${url}: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  const seen = new Set();
  return allSticks.filter(s => {
    const key = s.rawName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================
// MERGE — Combine scraped data with existing database
// ============================================================

// Items that are NOT hockey sticks — filter these out
const NON_STICK_KEYWORDS = ['bag', 'glove', 'helmet', 'skate', 'pant', 'shin', 'elbow', 'shoulder', 'jersey', 'sock', 'tape', 'wax', 'blade only', 'shaft only', 'mini', 'minis', 'secret'];

function isHockeyStick(rawName) {
  const lower = rawName.toLowerCase();
  if (NON_STICK_KEYWORDS.some(kw => lower.includes(kw))) return false;
  // Must contain stick-related keywords or known line names
  return lower.includes('stick') || lower.includes('player stick') ||
    lower.includes('vapor') || lower.includes('nexus') || lower.includes('supreme') ||
    lower.includes('proto') || lower.includes('pulse') || lower.includes('ag5nt') ||
    lower.includes('fly') || lower.includes('twitch') ||
    lower.includes('jetspeed') || lower.includes('ribcor') || lower.includes('trigger') ||
    lower.includes('vizion') || lower.includes('tacks') || lower.includes('xf') ||
    lower.includes('ft8') || lower.includes('ft7') ||
    lower.includes('lx') || lower.includes('novium') || lower.includes('covert') ||
    lower.includes('qr') || lower.includes('rise') || lower.includes('alpha') ||
    lower.includes('hzrdus') || lower.includes('catalyst') || lower.includes('project x');
}

function normalizeModelName(brand, rawName) {
  let name = rawName
    .replace(/^(BAUER|CCM|WARRIOR|TRUE)\s+/i, '')
    // Remove size suffixes and parenthesized sizes
    .replace(/\s*\((SR|JR|INT|YTH|UFLEX|SR\/INT)\)\s*$/i, '')
    .replace(/\s+(STOCK|GRIP|SENIOR|INTERMEDIATE|JUNIOR|YOUTH|TYKE|INT|SR|JR|YTH)\s*.*$/i, '')
    .replace(/\s+Hockey Stick$/i, '')
    .replace(/\s+Player Stick$/i, '')
    .replace(/\s+Stick$/i, '')
    // Remove color variants
    .replace(/\s+(GOLD|SILVER|BLACK|WHITE|CHROME|CHARCOAL|RED|BLUE|GREEN|LIMITED EDITION|White Edition)\s*$/i, '')
    // Remove "Barbie" prefix (CCM collaboration)
    .replace(/^Barbie\s+/i, '')
    .trim();
  return name;
}

function mergeScrapedData(existingSticks, scrapedItems) {
  const now = new Date().toISOString();

  // Update lastScraped on all existing sticks
  const updated = existingSticks.map(stick => ({
    ...stick,
    lastScraped: now,
  }));

  // Find scraped items that don't match any existing model
  const existingKeys = new Set(
    existingSticks.map(s => `${s.brand}:${s.model}`.toLowerCase())
  );

  const newModels = [];
  const seenNewKeys = new Set();
  for (const item of scrapedItems) {
    // Filter out non-stick items
    if (!isHockeyStick(item.rawName)) continue;

    const model = normalizeModelName(item.brand, item.rawName);
    const key = `${item.brand}:${model}`.toLowerCase();

    // Skip if already exists, already seen as new, or too short
    if (existingKeys.has(key) || seenNewKeys.has(key) || model.length < 3) continue;
    seenNewKeys.add(key);

    if (true) {
      newModels.push({
        brand: item.brand,
        model,
        rawName: item.rawName,
        url: item.url || null,
        image: item.image || null,
        sizes: item.sizes || [],
        bladePatterns: item.bladePatterns || [],
      });
    }
  }

  // Log new models found
  if (newModels.length > 0) {
    console.log(`[Scraper] ${newModels.length} NEW models found that aren't in the database:`);
    newModels.forEach(m => {
      console.log(`  + ${m.brand} ${m.model} (raw: "${m.rawName}")`);
    });

    // Create skeleton entries for new models so they can be manually reviewed
    for (const nm of newModels) {
      const skeleton = createSkeletonStick(nm);
      updated.push(skeleton);
      console.log(`  [AUTO-ADDED] ${nm.brand} ${nm.model} — needs manual review for kickpoint/positions/translations`);
    }
  }

  return { sticks: updated, newModels };
}

function createSkeletonStick(item) {
  const id = `${item.brand.toLowerCase()}-${item.model.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  // Infer kickpoint from known line names
  let kickpoint = 'mid';
  let kickpointLabel = 'Mid Kick';
  const lower = item.model.toLowerCase();

  if (lower.includes('vapor') || lower.includes('jetspeed') || lower.includes('ft8') || lower.includes('ft7') || lower.includes('covert') || lower.includes('qr')) {
    kickpoint = 'low'; kickpointLabel = 'Low Kick';
  } else if (lower.includes('ribcor') || lower.includes('trigger') || lower.includes('hzrdus')) {
    kickpoint = 'mid-low'; kickpointLabel = 'Mid-Low Kick';
  } else if (lower.includes('supreme') || lower.includes('alpha') || lower.includes('lx') || lower.includes('novium') || lower.includes('nexus') || lower.includes('catalyst') || lower.includes('xf')) {
    kickpoint = 'mid'; kickpointLabel = 'Mid Kick';
  } else if (lower.includes('proto') || lower.includes('tracer')) {
    kickpoint = 'variable'; kickpointLabel = 'Variable Kick';
  }

  // Infer blade patterns by brand
  const bladeMap = {
    Bauer: ['P28', 'P92', 'P88'],
    CCM: ['T28', 'T92', 'T88'],
    Warrior: ['W28', 'W03', 'W16'],
    True: ['TC2', 'TC4', 'TC6'],
  };

  // Infer positions from kickpoint
  const posMap = {
    low: ['sniper', 'power-forward', 'defender', 'grinder'],
    'mid-low': ['sniper', 'power-forward', 'defender', 'grinder'],
    mid: ['defender', 'power-forward', 'sniper', 'grinder'],
    'mid-high': ['defender', 'grinder', 'power-forward', 'sniper'],
    high: ['defender', 'grinder', 'power-forward', 'sniper'],
    variable: ['sniper', 'power-forward', 'defender', 'grinder'],
  };

  // Infer skill level from model name / tier
  let skillLevel = ['recreational', 'competitive'];
  if (lower.includes('pro') || lower.includes('flylite') || lower.includes('ghost') || lower.includes('smoke') || lower.includes('project x') || lower.includes('hyperlite') || lower.includes('proto')) {
    skillLevel = ['competitive', 'elite'];
  } else if (lower.match(/\d{2,3}$/) && parseInt(lower.match(/\d+$/)?.[0]) <= 60) {
    skillLevel = ['beginner', 'recreational'];
  }

  return {
    id,
    brand: item.brand,
    model: item.model,
    line: item.model.split(' ')[0] || item.model,
    tier: skillLevel.includes('elite') ? 'pro' : 'mid',
    tagline: {
      en: `${item.brand} ${item.model}`,
      de: `${item.brand} ${item.model}`,
      fr: `${item.brand} ${item.model}`,
    },
    kickpoint,
    kickpointLabel,
    sizes: item.sizes.length > 0 ? item.sizes : ['junior', 'intermediate', 'senior'],
    positions: posMap[kickpoint] || ['sniper', 'defender', 'power-forward', 'grinder'],
    skillLevel,
    bladePatterns: item.bladePatterns.length > 0 ? item.bladePatterns : bladeMap[item.brand] || ['P28', 'P92'],
    recBlade: {
      sniper: (bladeMap[item.brand] || ['P28'])[0],
      defender: (bladeMap[item.brand] || ['P92'])[1] || (bladeMap[item.brand] || ['P92'])[0],
      'power-forward': (bladeMap[item.brand] || ['P92'])[1] || (bladeMap[item.brand] || ['P92'])[0],
      grinder: (bladeMap[item.brand] || ['P88'])[2] || (bladeMap[item.brand] || ['P88'])[0],
    },
    pros: {
      en: ['Scraped from official website — details pending review'],
      de: ['Von offizieller Website gescannt — Details werden überprüft'],
      fr: ['Récupéré du site officiel — détails en cours de vérification'],
    },
    cons: {
      en: ['Details pending manual review'],
      de: ['Details werden manuell überprüft'],
      fr: ['Détails en cours de vérification manuelle'],
    },
    why: {
      sniper: { en: `The ${item.brand} ${item.model} for snipers.`, de: `Der ${item.brand} ${item.model} für Sniper.`, fr: `Le ${item.brand} ${item.model} pour les snipers.` },
      defender: { en: `The ${item.brand} ${item.model} for defenders.`, de: `Der ${item.brand} ${item.model} für Verteidiger.`, fr: `Le ${item.brand} ${item.model} pour les défenseurs.` },
      'power-forward': { en: `The ${item.brand} ${item.model} for power forwards.`, de: `Der ${item.brand} ${item.model} für Power Forwards.`, fr: `Le ${item.brand} ${item.model} pour les avants de puissance.` },
      grinder: { en: `The ${item.brand} ${item.model} for grinders.`, de: `Der ${item.brand} ${item.model} für Grinder.`, fr: `Le ${item.brand} ${item.model} pour les broyeurs.` },
    },
    officialUrl: item.url || `https://www.${item.brand.toLowerCase()}.com`,
    lastScraped: new Date().toISOString(),
    autoAdded: true,
  };
}

// ============================================================
// MAIN SCRAPE FUNCTION
// ============================================================

async function scrapeAllBrands() {
  console.log('[Scraper] ========================================');
  console.log('[Scraper] Starting daily scrape of all brand websites');
  console.log(`[Scraper] ${new Date().toISOString()}`);
  console.log('[Scraper] ========================================');

  const results = { Bauer: [], CCM: [], Warrior: [], True: [] };

  // Bauer — Shopify JSON API (fast, no browser needed)
  try {
    results.Bauer = await scrapeBauer();
  } catch (err) {
    console.error('[Scraper] Bauer scrape failed:', err.message);
  }

  // CCM, Warrior, True — Puppeteer (headless Chrome)
  try {
    results.CCM = await scrapeCCM();
  } catch (err) {
    console.error('[Scraper] CCM scrape failed:', err.message);
  }

  try {
    results.Warrior = await scrapeWarrior();
  } catch (err) {
    console.error('[Scraper] Warrior scrape failed:', err.message);
  }

  try {
    results.True = await scrapeTrue();
  } catch (err) {
    console.error('[Scraper] True scrape failed:', err.message);
  }

  // Close browser
  await closeBrowser();

  const allScraped = [
    ...results.Bauer,
    ...results.CCM,
    ...results.Warrior,
    ...results.True,
  ];

  console.log('[Scraper] ========================================');
  console.log(`[Scraper] Scrape complete. Total items found:`);
  console.log(`  Bauer: ${results.Bauer.length}`);
  console.log(`  CCM: ${results.CCM.length}`);
  console.log(`  Warrior: ${results.Warrior.length}`);
  console.log(`  True: ${results.True.length}`);
  console.log(`  TOTAL: ${allScraped.length}`);
  console.log('[Scraper] ========================================');

  return allScraped;
}

async function runScrape() {
  const existing = loadSticks();
  const scraped = await scrapeAllBrands();
  const { sticks: updated, newModels } = mergeScrapedData(existing, scraped);
  saveSticks(updated);

  // Save scrape log
  const log = {
    timestamp: new Date().toISOString(),
    existingCount: existing.length,
    scrapedCount: scraped.length,
    updatedCount: updated.length,
    newModelsFound: newModels.length,
    newModels: newModels.map(m => `${m.brand} ${m.model}`),
  };
  try {
    fs.writeFileSync(SCRAPE_LOG, JSON.stringify(log, null, 2));
  } catch (e) {
    console.log('[Scraper] Could not write scrape log:', e.message);
  }

  return log;
}

function loadSticks() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.log('[Scraper] Could not load sticks.json:', e.message);
    return [];
  }
}

function saveSticks(sticks) {
  try {
    // SAFETY: Never overwrite database with fewer sticks than before
    const existing = loadSticks();
    if (sticks.length < existing.length) {
      console.log(`[Scraper] SAFETY: Refusing to save ${sticks.length} sticks (had ${existing.length}). Scrape may have failed.`);
      return false;
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(sticks, null, 2));
    console.log(`[Scraper] Saved ${sticks.length} sticks to ${DATA_FILE}`);
    return true;
  } catch (e) {
    console.log('[Scraper] Could not save sticks.json:', e.message);
    return false;
  }
}

module.exports = { scrapeAllBrands, runScrape, loadSticks, saveSticks };
