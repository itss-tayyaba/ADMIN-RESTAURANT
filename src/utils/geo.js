// src/utils/geo.js
//
// Small geo helper used to sanity-check delivery pins against a region's
// approximate center point. Not a precise polygon boundary — Faisalabad's
// service areas aren't perfect circles — just a safety net that catches
// obviously wrong pins (wrong city, stale GPS fix, a search result that
// resolved somewhere unrelated).

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth radius in km
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = { haversineKm };