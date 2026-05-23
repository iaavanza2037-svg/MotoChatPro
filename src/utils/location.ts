/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Approximate coordinate centroids for municipalities/districts in Honduras (Valle/Choluteca departments)
export const ZONAS_COORDINATES: { [key: string]: { lat: number, lon: number } } = {
  "Langue (Centro)": { lat: 13.6267, lon: -87.6433 },
  "Concepción de Langue": { lat: 13.6400, lon: -87.6600 },
  "San Isidro": { lat: 13.7256, lon: -87.6833 },
  "El Jícaro": { lat: 13.6180, lon: -87.6150 },
  "El Carrizal": { lat: 13.6550, lon: -87.6250 },
  "Las Mesas": { lat: 13.6010, lon: -87.6590 },
  "San Francisco": { lat: 13.6470, lon: -87.6820 },
  "Aduana El Amatillo": { lat: 13.5939, lon: -87.7553 },
  "Nacaome Centro": { lat: 13.5233, lon: -87.4914 },
  "Pespire Centro": { lat: 13.5947, lon: -87.3592 },
  "Choluteca Centro": { lat: 13.4331, lon: -87.1856 },
};

/**
 * Calculates the Haversine distance between two points in kilometers.
 */
export const getHaversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
};

/**
 * Finds the nearest preset zone based on latitude and longitude coordinates.
 */
export const getNearestPresetZone = (lat: number, lon: number): string => {
  let nearestZone = "Langue (Centro)";
  let minDistance = Infinity;

  for (const [zoneName, coords] of Object.entries(ZONAS_COORDINATES)) {
    const dist = getHaversineDistance(lat, lon, coords.lat, coords.lon);
    if (dist < minDistance) {
      minDistance = dist;
      nearestZone = zoneName;
    }
  }

  return nearestZone;
};
