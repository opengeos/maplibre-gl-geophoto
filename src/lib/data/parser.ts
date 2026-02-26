import type {
  CameraData,
  ParsedTrajectory,
  RawTrajectoryGeojson,
  RawTrajectoryJson,
} from '../core/types';
import { swapLatLon, calculateBounds } from '../utils/geo';

/**
 * Parses trajectory data into a structured format for map display.
 *
 * @param geojsonData - Parsed trajectory.geojson content
 * @param jsonData - Optional parsed trajectory.json metadata for capture_time ordering
 * @returns Parsed cameras, line feature, and bounds
 */
export function parseTrajectory(
  geojsonData: RawTrajectoryGeojson,
  jsonData?: RawTrajectoryJson | null,
): ParsedTrajectory {
  type TrajectoryGroup = NonNullable<RawTrajectoryGeojson['trajectories']>[number];
  const fallbackTrajectoryGroup = Object.values(geojsonData).find((value) => {
    if (!Array.isArray(value) || value.length === 0) return false;
    const first = value[0];
    return typeof first === 'object' && first !== null && 'cameras' in (first as Record<string, unknown>);
  }) as TrajectoryGroup[] | undefined;
  const trajectory = geojsonData.trajectories?.[0] ?? fallbackTrajectoryGroup?.[0];
  if (!trajectory || !trajectory.cameras) {
    return {
      cameras: [],
      lineFeature: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [] },
      },
      bounds: [
        [0, 0],
        [0, 0],
      ],
    };
  }

  // Build capture_time lookup from the optional metadata JSON if available
  const captureTimeMap = new Map<string, number>();
  if (jsonData && jsonData.length > 0) {
    const shots = jsonData[0].shots;
    for (const [shotId, shotData] of Object.entries(shots)) {
      if (shotData.capture_time !== undefined) {
        captureTimeMap.set(shotId, shotData.capture_time);
      }
    }
  }

  // Parse cameras, swapping [lat, lon, elev] to [lon, lat]
  const cameras: CameraData[] = trajectory.cameras.map((cam) => {
    const coords = swapLatLon(cam.coordinates);
    return {
      id: cam.id,
      coordinates: coords,
      elevation: cam.coordinates[2],
      rotation: cam.rotation,
      captureTime: captureTimeMap.get(cam.id),
    };
  });

  // Sort by capture_time if available
  if (captureTimeMap.size > 0) {
    cameras.sort((a, b) => {
      if (a.captureTime !== undefined && b.captureTime !== undefined) {
        return a.captureTime - b.captureTime;
      }
      return 0;
    });
  }

  // Build LineString from ordered camera positions
  const lineCoordinates = cameras.map((cam) => cam.coordinates);
  const lineFeature: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: lineCoordinates,
    },
  };

  // Calculate bounds
  const bounds = calculateBounds(cameras.map((cam) => cam.coordinates));

  return { cameras, lineFeature, bounds };
}

/**
 * Builds a GeoJSON FeatureCollection of camera points for map display.
 *
 * @param cameras - Parsed camera data array
 * @param selectedIndex - Index of the currently selected camera (-1 for none)
 * @returns GeoJSON FeatureCollection of Point features
 */
export function camerasToGeoJSON(
  cameras: CameraData[],
  selectedIndex: number = -1,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cameras.map((cam, index) => ({
      type: 'Feature',
      properties: {
        id: cam.id,
        index,
        elevation: cam.elevation,
        captureTime: cam.captureTime ?? null,
        selected: index === selectedIndex,
      },
      geometry: {
        type: 'Point',
        coordinates: cam.coordinates,
      },
    })),
  };
}
