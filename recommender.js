// Recommendation engine — scores and ranks sticks based on player profile

const KICK_PREF = {
  sniper: ['low', 'mid-low', 'variable'],
  defender: ['mid', 'mid-low', 'variable', 'mid-high', 'high'],
  'power-forward': ['mid', 'mid-low', 'variable', 'mid-high'],
  grinder: ['mid-high', 'high', 'mid', 'variable'],
};

const BRAND_SCORES_BY_SKILL = {
  beginner: { Bauer: 3, CCM: 3, True: 3, Warrior: 3 },
  recreational: { Bauer: 4, CCM: 4, True: 4, Warrior: 4 },
  competitive: { Bauer: 5, CCM: 5, True: 5, Warrior: 5 },
  elite: { Bauer: 5, CCM: 5, True: 5, Warrior: 5 },
};

function toKg(val, unit) {
  return unit === 'lbs' ? val / 2.2046 : val;
}

function toCm(val, unit) {
  return unit === 'in' ? val * 2.54 : val;
}

function calcFlex(weightKg) {
  const lbs = weightKg * 2.2046;
  const raw = lbs * 0.46;
  return Math.round(raw / 5) * 5;
}

function getSize(heightCm, age) {
  if (heightCm < 122 || age <= 7) return 'youth';
  if (heightCm < 147 || age <= 12) return 'junior';
  if (heightCm < 165 || age <= 15) return 'intermediate';
  return 'senior';
}

// Standard flex ranges by size category
// Used when a stick doesn't have explicit flexRange data
const STANDARD_FLEX_BY_SIZE = {
  youth:        { min: 20, max: 35 },
  junior:       { min: 30, max: 52 },
  intermediate: { min: 55, max: 67 },
  senior:       { min: 70, max: 105 },
};

function stickOffersFlexForSize(stick, size, targetFlex) {
  // If stick has explicit flex range data, use it
  if (stick.flexRange && stick.flexRange[size]) {
    const { min, max } = stick.flexRange[size];
    return targetFlex >= min - 5 && targetFlex <= max + 5; // 5-flex tolerance
  }
  // Otherwise, use standard flex ranges for the size category
  // If the stick is available in this size, assume standard range
  if (stick.sizes.includes(size)) {
    const range = STANDARD_FLEX_BY_SIZE[size];
    if (range) {
      return targetFlex >= range.min - 5 && targetFlex <= range.max + 5;
    }
  }
  return false;
}

function scoreStick(stick, position, skill, size, targetFlex) {
  if (!stick.sizes.includes(size)) return -1;

  // Check if the stick actually offers a flex close to what the player needs
  if (targetFlex && !stickOffersFlexForSize(stick, size, targetFlex)) return -1;

  let score = 0;

  // Position fit (0–40)
  const posIdx = stick.positions.indexOf(position);
  if (posIdx === 0) score += 40;
  else if (posIdx === 1) score += 30;
  else if (posIdx >= 2) score += 18;
  else score += 5;

  // Skill level fit (0–20)
  const skillIdx = stick.skillLevel.indexOf(skill);
  if (skillIdx === 0) score += 20;
  else if (skillIdx >= 1) score += 13;
  else score += 4;

  // Kick point preference (0–25)
  // Variable kick adapts to grip style — scores well for any position
  if (stick.kickpoint === 'variable') {
    score += 12;
  } else {
    const prefs = KICK_PREF[position] || [];
    const kickIdx = prefs.indexOf(stick.kickpoint);
    if (kickIdx === 0) score += 25;
    else if (kickIdx === 1) score += 15;
    else if (kickIdx >= 2) score += 7;
  }

  // Brand quality fit (0–10)
  score += (BRAND_SCORES_BY_SKILL[skill] || {})[stick.brand] || 3;

  return score;
}

function recommend(sticks, { heightCm, weightKg, age, position, skillLevel }) {
  const flex = calcFlex(weightKg);
  const size = getSize(heightCm, age);

  const scored = sticks
    .map(s => ({ ...s, score: scoreStick(s, position, skillLevel, size, flex) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  // Pure fit-based ranking — top 7 by score, no brand balancing
  return { sticks: scored.slice(0, 7), flex, size, heightCm, weightKg };
}

module.exports = { recommend, calcFlex, getSize, toKg, toCm };
