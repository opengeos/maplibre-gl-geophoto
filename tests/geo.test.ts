import { describe, it, expect } from 'vitest';
import { swapLatLon, calculateBounds } from '../src/lib/utils/geo';

describe('swapLatLon', () => {
  it('swaps latitude and longitude', () => {
    const result = swapLatLon([47.671, -122.274, 14.3]);
    expect(result).toEqual([-122.274, 47.671]);
  });

  it('handles zero values', () => {
    const result = swapLatLon([0, 0, 0]);
    expect(result).toEqual([0, 0]);
  });

  it('handles negative coordinates', () => {
    const result = swapLatLon([-33.8688, 151.2093, 5.0]);
    expect(result).toEqual([151.2093, -33.8688]);
  });
});

describe('calculateBounds', () => {
  it('calculates bounds for multiple points', () => {
    const positions: [number, number][] = [
      [-122.274, 47.671],
      [-122.276, 47.669],
      [-122.272, 47.673],
    ];
    const result = calculateBounds(positions);
    expect(result).toEqual([
      [-122.276, 47.669],
      [-122.272, 47.673],
    ]);
  });

  it('handles a single point', () => {
    const result = calculateBounds([[-122.274, 47.671]]);
    expect(result).toEqual([
      [-122.274, 47.671],
      [-122.274, 47.671],
    ]);
  });

  it('returns zero bounds for empty array', () => {
    const result = calculateBounds([]);
    expect(result).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });
});
