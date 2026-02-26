import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import { GeoPhotoControlReact, useGeoPhoto } from '../../src/react';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  const {
    selectedCamera,
    cameraIndex,
    totalCameras,
    handleCameraSelect,
    handleDataLoaded,
  } = useGeoPhoto();

  useEffect(() => {
    if (!mapContainer.current) return;

    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
          },
        ],
      },
      center: [-122.274, 47.671],
      zoom: 15,
    });

    mapInstance.addControl(new maplibregl.NavigationControl(), 'top-right');

    mapInstance.on('load', () => {
      setMap(mapInstance);
    });

    return () => {
      mapInstance.remove();
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      {map && (
        <GeoPhotoControlReact
          map={map}
          title="GeoPhoto"
          collapsed={false}
          panelWidth={360}
          showPath={true}
          showObjects={true}
          fitBoundsOnLoad={true}
          onCameraSelect={handleCameraSelect}
          onDataLoaded={handleDataLoaded}
        />
      )}
      {selectedCamera && (
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            left: 10,
            background: 'rgba(255,255,255,0.9)',
            padding: '8px 12px',
            borderRadius: 4,
            fontSize: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }}
        >
          Camera {cameraIndex + 1} / {totalCameras}: {selectedCamera.id}
        </div>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
