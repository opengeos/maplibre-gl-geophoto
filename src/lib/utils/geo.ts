/**
 * Swaps [lat, lon, elev] coordinates to standard GeoJSON [lon, lat] order.
 *
 * @param coords - Coordinates in [latitude, longitude, elevation] order
 * @returns Coordinates as [longitude, latitude]
 */
export function swapLatLon(coords: [number, number, number]): [number, number] {
  return [coords[1], coords[0]];
}

/**
 * Calculates a bounding box from an array of [lon, lat] positions.
 *
 * @param positions - Array of [longitude, latitude] coordinate pairs
 * @returns Bounding box as [[minLon, minLat], [maxLon, maxLat]]
 */
export function calculateBounds(
  positions: [number, number][],
): [[number, number], [number, number]] {
  if (positions.length === 0) {
    return [
      [0, 0],
      [0, 0],
    ];
  }

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const [lon, lat] of positions) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }

  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}
