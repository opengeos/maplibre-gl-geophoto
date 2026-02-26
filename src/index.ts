// Import styles
import './lib/styles/plugin-control.css';
import './lib/styles/geophoto.css';

// Main entry point - Core exports
export { GeoPhotoControl } from './lib/core/GeoPhotoControl';
export { PluginControl } from './lib/core/PluginControl';

// Type exports
export type {
  GeoPhotoControlOptions,
  CameraData,
  ImageResolver,
  LoadedData,
  GeoPhotoEvent,
  GeoPhotoEventHandler,
  ParsedTrajectory,
  PluginControlOptions,
  PluginState,
  PluginControlEvent,
  PluginControlEventHandler,
} from './lib/core/types';

// Utility exports
export {
  clamp,
  formatNumericValue,
  generateId,
  debounce,
  throttle,
  classNames,
} from './lib/utils';
