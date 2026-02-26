import { useState, useCallback } from 'react';
import type { CameraData, PluginState } from '../core/types';

/**
 * Default state for GeoPhoto
 */
const DEFAULT_STATE: PluginState = {
  collapsed: true,
  panelWidth: 360,
  data: {},
};

/**
 * React hook for managing GeoPhoto control state.
 *
 * @param initialState - Optional initial state override
 * @returns State and control methods
 */
export function useGeoPhoto(initialState?: Partial<PluginState>) {
  const [state, setStateInternal] = useState<PluginState>({
    ...DEFAULT_STATE,
    ...initialState,
  });

  const [selectedCamera, setSelectedCamera] = useState<CameraData | null>(null);
  const [cameraIndex, setCameraIndex] = useState<number>(-1);
  const [totalCameras, setTotalCameras] = useState<number>(0);

  const setState = useCallback((newState: Partial<PluginState>) => {
    setStateInternal((prev) => ({ ...prev, ...newState }));
  }, []);

  const setCollapsed = useCallback((collapsed: boolean) => {
    setStateInternal((prev) => ({ ...prev, collapsed }));
  }, []);

  const toggle = useCallback(() => {
    setStateInternal((prev) => ({ ...prev, collapsed: !prev.collapsed }));
  }, []);

  const handleCameraSelect = useCallback((camera: CameraData, index: number) => {
    setSelectedCamera(camera);
    setCameraIndex(index);
  }, []);

  const handleDataLoaded = useCallback((cameras: CameraData[]) => {
    setTotalCameras(cameras.length);
    if (cameras.length > 0) {
      setSelectedCamera(cameras[0]);
      setCameraIndex(0);
    }
  }, []);

  return {
    state,
    setState,
    setCollapsed,
    toggle,
    selectedCamera,
    cameraIndex,
    totalCameras,
    handleCameraSelect,
    handleDataLoaded,
  };
}
