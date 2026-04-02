// Store directory module — European and North American hockey stores

const STORES = [
  // === EUROPEAN STORES ===
  {
    id: 'skatepro', name: 'Skatepro', flag: '🇪🇺',
    note: { en: 'Ships all EU + CH', de: 'Liefert in ganz EU + CH', fr: 'Livraison UE + CH' },
    import: false,
    regions: ['EU', 'CH', 'GB'],
    searchUrl: q => `https://www.skatepro.eu/en/search/?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'sport-bittl', name: 'Sport Bittl', flag: '🇩🇪',
    note: { en: 'DACH specialist', de: 'DACH-Spezialist', fr: 'Spécialiste DACH' },
    import: false,
    regions: ['EU', 'CH'],
    searchUrl: q => `https://www.sport-bittl.com/search?sSearch=${encodeURIComponent(q)}`,
  },
  {
    id: 'kingsport', name: 'Kingsport', flag: '🇫🇮',
    note: { en: 'Nordic hockey specialist', de: 'Nordischer Hockeyspezialist', fr: 'Spécialiste hockey nordique' },
    import: false,
    regions: ['EU', 'CH'],
    searchUrl: q => `https://www.kingsport.fi/en/catalogsearch/result/?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'hockey-express', name: 'Hockey Express', flag: '🇬🇧',
    note: { en: 'UK hockey specialist', de: 'UK-Hockeyspezialist', fr: 'Spécialiste hockey UK' },
    import: false,
    regions: ['GB', 'EU', 'CH'],
    searchUrl: q => `https://www.hockeyexpress.co.uk/catalogsearch/result/?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'amazon-de', name: 'Amazon.de', flag: '🛒',
    note: { en: 'Fast EU delivery', de: 'Schnelle EU-Lieferung', fr: 'Livraison rapide UE' },
    import: false,
    regions: ['EU', 'CH'],
    searchUrl: q => `https://www.amazon.de/s?k=${encodeURIComponent(q)}`,
  },
  {
    id: 'amazon-uk', name: 'Amazon.co.uk', flag: '🛒',
    note: { en: 'UK fast delivery', de: 'Schnelle UK-Lieferung', fr: 'Livraison rapide UK' },
    import: false,
    regions: ['GB'],
    searchUrl: q => `https://www.amazon.co.uk/s?k=${encodeURIComponent(q)}`,
  },
  {
    id: 'ebay-de', name: 'eBay.de', flag: '🔨',
    note: { en: 'New & used — often cheapest', de: 'Neu & gebraucht — oft günstigster', fr: 'Neuf & occasion — souvent le moins cher' },
    import: false,
    regions: ['EU', 'CH'],
    searchUrl: q => `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=0`,
  },
  {
    id: 'ebay-uk', name: 'eBay.co.uk', flag: '🔨',
    note: { en: 'New & used', de: 'Neu & gebraucht', fr: 'Neuf & occasion' },
    import: false,
    regions: ['GB'],
    searchUrl: q => `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=0`,
  },
  // === ADDITIONAL EUROPEAN STORES ===
  {
    id: 'sportega', name: 'Sportega', flag: '🇨🇿',
    note: { en: 'Great prices, ships across EU', de: 'Super Preise, EU-weiter Versand', fr: 'Très bons prix, livraison dans toute l\'UE' },
    import: false,
    regions: ['EU', 'CH'],
    searchUrl: q => `https://www.sportega.com/en/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'hps-sport', name: 'HPS Hockey Shop', flag: '🇩🇪',
    note: { en: 'German hockey specialist — competitive prices', de: 'Deutscher Hockey-Spezialist — wettbewerbsfähige Preise', fr: 'Spécialiste hockey allemand — prix compétitifs' },
    import: false,
    regions: ['EU', 'CH'],
    searchUrl: q => `https://hockey.hps-sport-shop.de/catalogsearch/result/?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'ochsner-hockey', name: 'Ochsner Hockey', flag: '🇨🇭',
    note: { en: 'Switzerland\'s hockey specialist', de: 'Schweizer Hockey-Spezialist', fr: 'Spécialiste hockey suisse' },
    import: false,
    regions: ['CH', 'EU'],
    searchUrl: q => `https://www.ochsnerhockey.ch/de/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'conte-hockey', name: 'Conte Hockey Shop', flag: '🇨🇭',
    note: { en: 'Swiss hockey store — good selection', de: 'Schweizer Hockey-Laden — gute Auswahl', fr: 'Magasin de hockey suisse — bon choix' },
    import: false,
    regions: ['CH', 'EU'],
    searchUrl: q => `https://www.contehockeyshop.ch/search?q=${encodeURIComponent(q)}`,
  },
  // === NORTH AMERICAN STORES ===
  {
    id: 'pure-hockey', name: 'Pure Hockey', flag: '🇺🇸',
    note: { en: 'US hockey specialist', de: 'US-Hockeyspezialist', fr: 'Spécialiste hockey US' },
    import: true,
    regions: ['US', 'CA', 'EU', 'CH', 'GB'],
    searchUrl: q => `https://www.purehockey.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'hockey-monkey', name: 'HockeyMonkey', flag: '🇺🇸',
    note: { en: 'Huge selection, ships worldwide', de: 'Riesige Auswahl, weltweiter Versand', fr: 'Énorme sélection, livraison mondiale' },
    import: true,
    regions: ['US', 'CA', 'EU', 'CH', 'GB'],
    searchUrl: q => `https://www.hockeymonkey.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'ice-warehouse', name: 'Ice Warehouse', flag: '🇺🇸',
    note: { en: 'Competitive US prices', de: 'Wettbewerbsfähige US-Preise', fr: 'Prix compétitifs US' },
    import: true,
    regions: ['US', 'CA', 'EU', 'CH', 'GB'],
    searchUrl: q => `https://www.icewarehouse.com/search.html?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'pro-hockey-life', name: 'Pro Hockey Life', flag: '🇨🇦',
    note: { en: "Canada's largest hockey store", de: 'Kanadas größter Hockeyladen', fr: 'Le plus grand magasin de hockey du Canada' },
    import: true,
    regions: ['CA', 'US', 'EU', 'CH', 'GB'],
    searchUrl: q => `https://www.prohockeylife.com/search?type=product&q=${encodeURIComponent(q)}`,
  },
  // === GOOGLE SHOPPING ===
  {
    id: 'google-shopping', name: 'Google Shopping', flag: '🔍',
    note: { en: 'Compare all stores at once', de: 'Alle Shops auf einen Blick', fr: 'Comparer tous les magasins' },
    import: false,
    regions: ['EU', 'CH', 'GB', 'US', 'CA'],
    searchUrl: q => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`,
  },
];

// Country → region mapping
const COUNTRY_REGION = {
  AT: 'EU', BE: 'EU', HR: 'EU', CZ: 'EU', DK: 'EU', EE: 'EU', FI: 'EU', FR: 'EU', DE: 'EU',
  HU: 'EU', IT: 'EU', LV: 'EU', LT: 'EU', NL: 'EU', NO: 'EU', PL: 'EU', SK: 'EU', SI: 'EU',
  ES: 'EU', SE: 'EU', GB: 'GB', CH: 'CH', CA: 'CA', US: 'US',
};

function getStoresForCountry(countryCode, maxCount = 7) {
  const region = COUNTRY_REGION[countryCode] || 'EU';
  const primary = STORES.filter(s => s.regions[0] === region && !s.import && s.id !== 'google-shopping');
  const secondary = STORES.filter(s => s.regions[0] !== region && s.regions.includes(region) && !s.import && s.id !== 'google-shopping');
  const local = [...primary, ...secondary];
  const overseas = STORES.filter(s => s.import && s.regions.includes(region));
  const google = STORES.find(s => s.id === 'google-shopping');
  const ordered = [...local, ...overseas, google].filter(Boolean);
  const seen = new Set();
  return ordered.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  }).slice(0, maxCount);
}

function getStoreLinksForStick(stick, size, countryCode, maxCount = 7) {
  const stores = getStoresForCountry(countryCode, maxCount);
  const searchQuery = `${stick.brand} ${stick.model} ${size} hockey stick`;
  return stores.map(store => ({
    id: store.id,
    name: store.name,
    flag: store.flag,
    note: store.note,
    import: store.import,
    url: store.searchUrl(searchQuery),
  }));
}

module.exports = { STORES, COUNTRY_REGION, getStoresForCountry, getStoreLinksForStick };
