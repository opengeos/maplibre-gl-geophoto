import type { Map } from 'maplibre-gl';

/**
 * Options for configuring the PluginControl
 */
export interface PluginControlOptions {
  /**
   * Whether the control panel should start collapsed (showing only the toggle button)
   * @default true
   */
  collapsed?: boolean;

  /**
   * Position of the control on the map
   * @default 'top-right'
   */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

  /**
   * Title displayed in the control header
   * @default 'Plugin Control'
   */
  title?: string;

  /**
   * Width of the control panel in pixels
   * @default 300
   */
  panelWidth?: number;

  /**
   * Maximum height of the control panel in pixels
   * @default 500
   */
  maxHeight?: number;

  /**
   * Custom CSS class name for the control container
   */
  className?: string;
}

/**
 * Internal state of the plugin control
 */
export interface PluginState {
  /**
   * Whether the control panel is currently collapsed
   */
  collapsed: boolean;

  /**
   * Current panel width in pixels
   */
  panelWidth: number;

  /**
   * Any custom state data
   */
  data?: Record<string, unknown>;
}

/**
 * Props for the React wrapper component
 */
export interface PluginControlReactProps extends PluginControlOptions {
  /**
   * MapLibre GL map instance
   */
  map: Map;

  /**
   * Callback fired when the control state changes
   */
  onStateChange?: (state: PluginState) => void;
}

/**
 * Event types emitted by the plugin control
 */
export type PluginControlEvent = 'collapse' | 'expand' | 'statechange';

/**
 * Event handler function type
 */
export type PluginControlEventHandler = (event: { type: PluginControlEvent; state: PluginState }) => void;

// ============================================================
// GeoPhoto-specific types
// ============================================================

/**
 * Options for configuring the GeoPhotoControl
 */
export interface GeoPhotoControlOptions extends PluginControlOptions {
  /** Show line connecting camera positions @default true */
  showPath?: boolean;

  /** Show directional arrows along the path line @default false */
  showPathDirectionArrows?: boolean;

  /** Spacing between directional arrows along the path in pixels @default 48 */
  pathDirectionArrowSpacing?: number;

  /** Directional arrow text/icon size in pixels @default 11 */
  pathDirectionArrowSize?: number;

  /** Directional arrow color (defaults to pathColor) */
  pathDirectionArrowColor?: string;

  /** URL to a ZIP dataset to auto-load when the control is added */
  preloadUrl?: string;

  /** Auto-fit map to data bounds when loaded @default true */
  fitBoundsOnLoad?: boolean;

  /** Padding in pixels for fitBounds @default 50 */
  fitBoundsPadding?: number;

  /** Show detected objects layer @default true */
  showObjects?: boolean;

  /** Path line color @default '#4a90d9' */
  pathColor?: string;

  /** Camera point fill color @default '#4a90d9' */
  pointColor?: string;

  /** Selected camera point color @default '#f97316' */
  selectedPointColor?: string;
}

/**
 * Parsed camera data with corrected coordinates
 */
export interface CameraData {
  /** Image filename (e.g., "uuid.jpg") */
  id: string;

  /** [longitude, latitude] in standard GeoJSON order */
  coordinates: [number, number];

  /** Elevation in meters */
  elevation: number;

  /** Rotation quaternion [w, x, y, z] */
  rotation: [number, number, number, number];

  /** Unix timestamp of capture */
  captureTime?: number;

  /** Blob URL for locally-loaded image */
  blobUrl?: string;
}

/**
 * Function that resolves an image ID to a displayable URL.
 * For folder mode: lazily reads file handle and creates blob URL.
 * For zip mode: returns pre-extracted blob URL.
 * For URL mode: constructs URL from base path.
 */
export type ImageResolver = (imageId: string) => Promise<string | null>;

/**
 * Data loaded from a local folder, ZIP file, or URLs
 */
export interface LoadedData {
  trajectoryGeojson: RawTrajectoryGeojson | null;
  trajectoryJson: RawTrajectoryJson | null;
  objectsGeojson: RawObjectsGeojson | null;
  imageResolver: ImageResolver;
}

/**
 * Raw trajectory.geojson format (coordinates are [lat, lon, elev] — non-standard!)
 */
export interface RawTrajectoryGeojson {
  trajectories?: Array<{
    cameras: Array<{
      id: string;
      coordinates: [number, number, number];
      rotation: [number, number, number, number];
    }>;
    points?: Array<{
      coordinates: [number, number, number];
      color: [number, number, number];
    }>;
  }>;
}

/**
 * Raw trajectory.json format (array of trajectories with shots)
 */
export type RawTrajectoryJson = Array<{
  shots: Record<
    string,
    {
      rotation: [number, number, number];
      translation: [number, number, number];
      camera: string;
      orientation: number;
      capture_time: number;
      gps_dop: number;
      gps_position: [number, number, number];
    }
  >;
  reference_lla?: {
    latitude: number;
    longitude: number;
    altitude: number;
  };
}>;

/**
 * Raw objects.geojson format (standard GeoJSON FeatureCollection)
 */
export interface RawObjectsGeojson {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'Point';
      coordinates: [number, number];
    };
    properties: {
      label: string;
      confidence: number;
      id: string;
      timestamp: number;
      inputs?: Array<{
        media: {
          device_id: string;
          image_id: string;
          sequence_id: string;
          frame_num: number;
          frame_timestamp: number;
          width: number;
          height: number;
          xmin: number;
          ymin: number;
          xmax: number;
          ymax: number;
        };
        sensor: {
          timestamp: number;
          latitude: number;
          longitude: number;
          heading: number;
          ground_speed: number;
        };
      }>;
      [key: string]: unknown;
    };
  }>;
}

/**
 * Parsed trajectory result
 */
export interface ParsedTrajectory {
  cameras: CameraData[];
  lineFeature: GeoJSON.Feature<GeoJSON.LineString>;
  bounds: [[number, number], [number, number]];
}

/**
 * GeoPhoto event types
 */
export type GeoPhotoEvent = PluginControlEvent | 'cameraselect' | 'dataloaded' | 'datacleared';

/**
 * GeoPhoto event handler
 */
export type GeoPhotoEventHandler = (event: {
  type: GeoPhotoEvent;
  state: PluginState;
  camera?: CameraData;
  cameraIndex?: number;
}) => void;

/**
 * Props for the GeoPhotoControlReact component
 */
export interface GeoPhotoControlReactProps extends GeoPhotoControlOptions {
  /** MapLibre GL map instance */
  map: Map;

  /** Callback when a camera is selected */
  onCameraSelect?: (camera: CameraData, index: number) => void;

  /** Callback when data finishes loading */
  onDataLoaded?: (cameras: CameraData[]) => void;

  /** Callback when control state changes */
  onStateChange?: (state: PluginState) => void;
}
