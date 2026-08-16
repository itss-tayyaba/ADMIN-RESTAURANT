// src/data/regionCenters.js
//
// Approximate center point for each fixed delivery region in
// src/data/regions.js. Used only to sanity-check that a customer's pinned
// delivery location plausibly falls inside the region they selected from
// the dropdown — the two are otherwise unrelated (the dropdown never reads
// the pin's coordinates on its own).
//
// radiusKm is intentionally generous to allow for normal GPS drift and
// imprecise search results — this is a safety net against clearly wrong
// pins (a different city, a stale/IP-based GPS fix, an unrelated search
// result), not a strict neighborhood boundary. Keep these names in sync
// with src/data/regions.js.

const REGION_CENTERS = {
  'D Ground': { lat: 31.4065, lng: 73.1104, radiusKm: 6 },
  'Susan Road': { lat: 31.4208, lng: 73.1222, radiusKm: 6 },
  'Jinnah Colony': { lat: 31.4204, lng: 73.0665, radiusKm: 6 },
  'Madina Town': { lat: 31.4208, lng: 73.1222, radiusKm: 6 },
  'Peoples Colony': { lat: 31.4085, lng: 73.1074, radiusKm: 6 },
  'Samanabad': { lat: 31.3958, lng: 73.0688, radiusKm: 6 },
  'Gulberg': { lat: 31.4210, lng: 73.0671, radiusKm: 6 },
};

module.exports = REGION_CENTERS;