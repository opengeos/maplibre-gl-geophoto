import { describe, it, expect } from 'vitest';
import { parseTrajectory, camerasToGeoJSON } from '../src/lib/data/parser';
import type { RawTrajectoryGeojson, RawTrajectoryJson } from '../src/lib/core/types';

const sampleGeojson: RawTrajectoryGeojson = {
  trajectories: [
    {
      cameras: [
        {
          id: 'img1.jpg',
          coordinates: [47.671, -122.274, 14.3],
          rotation: [0.7, -0.1, 0.1, 0.67],
        },
        {
          id: 'img2.jpg',
          coordinates: [47.672, -122.275, 12.5],
          rotation: [0.71, -0.14, 0.13, 0.68],
        },
        {
          id: 'img3.jpg',
          coordinates: [47.670, -122.273, 10.0],
          rotation: [0.72, -0.15, 0.12, 0.69],
        },
      ],
    },
  ],
};

const sampleJson: RawTrajectoryJson = [
  {
    shots: {
      'img1.jpg': {
        rotation: [0, 0, 0],
        translation: [0, 0, 0],
        camera: 'test',
        orientation: 1,
        capture_time: 1746394518.0,
        gps_dop: 0.05,
        gps_position: [47.671, -122.274, 14.3],
      },
      'img2.jpg': {
        rotation: [0, 0, 0],
        translation: [0, 0, 0],
        camera: 'test',
        orientation: 1,
        capture_time: 1746394516.0,
        gps_dop: 0.05,
        gps_position: [47.672, -122.275, 12.5],
      },
      'img3.jpg': {
        rotation: [0, 0, 0],
        translation: [0, 0, 0],
        camera: 'test',
        orientation: 1,
        capture_time: 1746394520.0,
        gps_dop: 0.05,
        gps_position: [47.670, -122.273, 10.0],
      },
    },
  },
];

describe('parseTrajectory', () => {
  it('parses cameras and swaps coordinates', () => {
    const result = parseTrajectory(sampleGeojson);
    expect(result.cameras).toHaveLength(3);
    // Coordinates should be swapped: [lat, lon, elev] -> [lon, lat]
    expect(result.cameras[0].coordinates).toEqual([-122.274, 47.671]);
    expect(result.cameras[0].elevation).toBe(14.3);
    expect(result.cameras[0].id).toBe('img1.jpg');
  });

  it('builds a LineString feature', () => {
    const result = parseTrajectory(sampleGeojson);
    expect(result.lineFeature.geometry.type).toBe('LineString');
    expect(result.lineFeature.geometry.coordinates).toHaveLength(3);
  });

  it('calculates bounds', () => {
    const result = parseTrajectory(sampleGeojson);
    const [[minLon, minLat], [maxLon, maxLat]] = result.bounds;
    expect(minLon).toBeLessThanOrEqual(maxLon);
    expect(minLat).toBeLessThanOrEqual(maxLat);
  });

  it('sorts by capture_time when trajectory.json is provided', () => {
    const result = parseTrajectory(sampleGeojson, sampleJson);
    expect(result.cameras[0].id).toBe('img2.jpg'); // capture_time 1746394516
    expect(result.cameras[1].id).toBe('img1.jpg'); // capture_time 1746394518
    expect(result.cameras[2].id).toBe('img3.jpg'); // capture_time 1746394520
  });

  it('merges capture_time into camera data', () => {
    const result = parseTrajectory(sampleGeojson, sampleJson);
    expect(result.cameras[0].captureTime).toBe(1746394516.0);
    expect(result.cameras[1].captureTime).toBe(1746394518.0);
  });

  it('handles empty trajectories', () => {
    const emptyData: RawTrajectoryGeojson = { trajectories: [{ cameras: [] }] };
    const result = parseTrajectory(emptyData);
    expect(result.cameras).toHaveLength(0);
    expect(result.lineFeature.geometry.coordinates).toHaveLength(0);
  });
});

describe('camerasToGeoJSON', () => {
  it('converts cameras to GeoJSON FeatureCollection', () => {
    const { cameras } = parseTrajectory(sampleGeojson);
    const geojson = camerasToGeoJSON(cameras);
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features).toHaveLength(3);
    expect(geojson.features[0].geometry.type).toBe('Point');
  });

  it('marks selected camera', () => {
    const { cameras } = parseTrajectory(sampleGeojson);
    const geojson = camerasToGeoJSON(cameras, 1);
    expect(geojson.features[0].properties!.selected).toBe(false);
    expect(geojson.features[1].properties!.selected).toBe(true);
    expect(geojson.features[2].properties!.selected).toBe(false);
  });

  it('sets index property', () => {
    const { cameras } = parseTrajectory(sampleGeojson);
    const geojson = camerasToGeoJSON(cameras);
    expect(geojson.features[0].properties!.index).toBe(0);
    expect(geojson.features[2].properties!.index).toBe(2);
  });
});
