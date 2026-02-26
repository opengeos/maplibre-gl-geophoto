// React entry point
export { GeoPhotoControlReact } from './lib/core/GeoPhotoControlReact';
export { PluginControlReact } from './lib/core/PluginControlReact';

// React hooks
export { useGeoPhoto } from './lib/hooks';
export { usePluginState } from './lib/hooks';

// Re-export types for React consumers
export type {
  GeoPhotoControlOptions,
  GeoPhotoControlReactProps,
  CameraData,
  GeoPhotoEvent,
  GeoPhotoEventHandler,
  PluginControlOptions,
  PluginState,
  PluginControlReactProps,
  PluginControlEvent,
  PluginControlEventHandler,
} from './lib/core/types';
