import { useEffect, useRef } from 'react';
import { GeoPhotoControl } from './GeoPhotoControl';
import type { GeoPhotoControlReactProps } from './types';

/**
 * React wrapper component for GeoPhotoControl.
 *
 * @example
 * ```tsx
 * import { GeoPhotoControlReact } from 'maplibre-gl-geophoto/react';
 *
 * function MyMap() {
 *   const [map, setMap] = useState<Map | null>(null);
 *
 *   return (
 *     <>
 *       <div ref={mapContainer} />
 *       {map && (
 *         <GeoPhotoControlReact
 *           map={map}
 *           title="Street View"
 *           collapsed={false}
 *         />
 *       )}
 *     </>
 *   );
 * }
 * ```
 */
export function GeoPhotoControlReact({
  map,
  onCameraSelect,
  onDataLoaded,
  onStateChange,
  ...options
}: GeoPhotoControlReactProps): null {
  const controlRef = useRef<GeoPhotoControl | null>(null);

  useEffect(() => {
    if (!map) return;

    const control = new GeoPhotoControl(options);
    controlRef.current = control;

    if (onStateChange) {
      control.on('statechange', (event) => {
        onStateChange(event.state);
      });
    }

    if (onCameraSelect) {
      control.on('cameraselect', (event) => {
        if (event.camera && event.cameraIndex !== undefined) {
          onCameraSelect(event.camera, event.cameraIndex);
        }
      });
    }

    if (onDataLoaded) {
      control.on('dataloaded', () => {
        onDataLoaded(control.getCameras());
      });
    }

    map.addControl(control, options.position || 'top-right');

    return () => {
      if (map.hasControl(control)) {
        map.removeControl(control);
      }
      controlRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (controlRef.current) {
      const currentState = controlRef.current.getState();
      if (options.collapsed !== undefined && options.collapsed !== currentState.collapsed) {
        if (options.collapsed) {
          controlRef.current.collapse();
        } else {
          controlRef.current.expand();
        }
      }
    }
  }, [options.collapsed]);

  return null;
}
