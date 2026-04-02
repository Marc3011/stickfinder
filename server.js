const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');

const { recommend, calcFlex, getSize, toKg, toCm } = require('./recommender');
const { getStoreLinksForStick, getStoresForCountry } = require('./stores');
const { runScrape, loadSticks } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Load stick database into memory
let sticks = loadSticks();

// --- API ENDPOINTS ---

// GET /api/sticks — return all sticks
app.get('/api/sticks', (req, res) => {
  res.json({ sticks, count: sticks.length });
});

// GET /api/sticks/recommend — get top 5 recommendations
app.get('/api/sticks/recommend', (req, res) => {
  const { height, height_unit, weight, weight_unit, age, position, skill_level, country } = req.query;

  if (!height || !weight || !age || !position || !skill_level) {
    return res.status(400).json({ error: 'Missing required parameters: height, weight, age, position, skill_level' });
  }

  const heightCm = toCm(parseFloat(height), height_unit || 'cm');
  const weightKg = toKg(parseFloat(weight), weight_unit || 'kg');
  const ageNum = parseInt(age, 10);

  const result = recommend(sticks, {
    heightCm,
    weightKg,
    age: ageNum,
    position,
    skillLevel: skill_level,
  });

  // Add store links to each recommended stick
  const countryCode = country || 'DE';
  const sticksWithStores = result.sticks.map(stick => ({
    ...stick,
    stores: getStoreLinksForStick(stick, result.size, countryCode, 7),
    recBlade: stick.recBlade[position] || stick.bladePatterns[0],
  }));

  res.json({
    recommendations: sticksWithStores,
    flex: result.flex,
    size: result.size,
    heightCm: result.heightCm,
    weightKg: result.weightKg,
  });
});

// GET /api/stores — get stores for a country
app.get('/api/stores', (req, res) => {
  const { country, stick_id, size } = req.query;
  const countryCode = country || 'DE';

  if (stick_id) {
    const stick = sticks.find(s => s.id === stick_id);
    if (!stick) return res.status(404).json({ error: 'Stick not found' });
    const links = getStoreLinksForStick(stick, size || 'junior', countryCode, 7);
    return res.json({ stores: links });
  }

  const stores = getStoresForCountry(countryCode, 10);
  res.json({ stores });
});

// POST /api/scrape — trigger manual scrape
app.post('/api/scrape', async (req, res) => {
  try {
    const result = await runScrape();
    sticks = loadSticks(); // Reload after scrape
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/status — health check
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    stickCount: sticks.length,
    brands: [...new Set(sticks.map(s => s.brand))],
  });
});

// Schedule daily scrape at 3:00 AM
cron.schedule('0 3 * * *', async () => {
  console.log('[Cron] Running scheduled scrape...');
  try {
    await runScrape();
    sticks = loadSticks();
    console.log('[Cron] Scrape completed. Reloaded sticks.');
  } catch (err) {
    console.error('[Cron] Scrape failed:', err.message);
  }
});

// Serve index.html for all non-API routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`StickFinder server running on http://localhost:${PORT}`);
  console.log(`Loaded ${sticks.length} sticks from database`);
  console.log('Daily scrape scheduled for 3:00 AM');
});
