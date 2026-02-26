# MapLibre GL GeoPhoto

A MapLibre GL JS plugin for visualizing geo-tagged photos and streetview imagery. Users can load trajectory data from a local folder or ZIP file, and the plugin renders GPS camera positions on the map with an interactive image viewer panel.

[![npm version](https://img.shields.io/npm/v/maplibre-gl-geophoto.svg)](https://www.npmjs.com/package/maplibre-gl-geophoto)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Local Data Loading** - Load trajectory data from folders (File System Access API) or ZIP files (JSZip)
- **Interactive Image Viewer** - Browse streetview images with prev/next/play controls and lightbox enlargement
- **GPS Visualization** - Camera positions rendered as interactive map points with connecting path line
- **Directional Path Arrows** - Optional directional arrows along the path line
- **Object Detection Layer** - Optional display of detected objects from `objects.geojson`
- **Resizable Panel** - Drag the panel edge to resize with configurable max height
- **TypeScript Support** - Full TypeScript support with type definitions
- **React Integration** - React wrapper component and custom hooks

## Installation

```bash
npm install maplibre-gl-geophoto
```

## Quick Start

### Vanilla JavaScript/TypeScript

```typescript
import maplibregl from 'maplibre-gl';
import { GeoPhotoControl } from 'maplibre-gl-geophoto';
import 'maplibre-gl-geophoto/style.css';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  center: [-122.274, 47.671],
  zoom: 15,
});

map.on('load', () => {
  const control = new GeoPhotoControl({
    title: 'Street View',
    collapsed: false,
    panelWidth: 360,
    maxHeight: 600,
    showPath: true,
    showPathDirectionArrows: true,
    pathDirectionArrowSpacing: 40,
    pathDirectionArrowSize: 12,
    preloadUrl: 'https://example.com/datasets/streetview.zip',
    showObjects: true,
    fitBoundsOnLoad: true,
  });

  map.addControl(control, 'top-right');
});
```

### React

```tsx
import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map } from 'maplibre-gl';
import { GeoPhotoControlReact, useGeoPhoto } from 'maplibre-gl-geophoto/react';
import 'maplibre-gl-geophoto/style.css';

function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<Map | null>(null);
  const { selectedCamera, cameraIndex, totalCameras, handleCameraSelect, handleDataLoaded } = useGeoPhoto();

  useEffect(() => {
    if (!mapContainer.current) return;
    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [-122.274, 47.671],
      zoom: 15,
    });
    mapInstance.on('load', () => setMap(mapInstance));
    return () => mapInstance.remove();
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      {map && (
        <GeoPhotoControlReact
          map={map}
          title="Street View"
          collapsed={false}
          panelWidth={360}
          maxHeight={600}
          showPath={true}
          showPathDirectionArrows={true}
          pathDirectionArrowSpacing={40}
          pathDirectionArrowSize={12}
          preloadUrl="https://example.com/datasets/streetview.zip"
          showObjects={true}
          fitBoundsOnLoad={true}
          onCameraSelect={handleCameraSelect}
          onDataLoaded={handleDataLoaded}
        />
      )}
    </div>
  );
}
```

## Data Format

The plugin expects trajectory data in the following structure:

```
dataset/
├── trajectory.geojson       # Camera positions (required)
├── trajectory.json          # Shot metadata with timestamps (optional)
├── objects.geojson           # Detected objects (optional)
└── images/                  # Streetview photos (optional)
    ├── uuid1.jpg
    ├── uuid2.jpg
    └── ...
```

**Note:** `trajectory.geojson` uses `[latitude, longitude, elevation]` coordinate ordering. The plugin automatically swaps to standard GeoJSON `[longitude, latitude]`.

**ZIP URL preload note:** `preloadUrl` loads a ZIP from the browser, so the remote server must allow cross-origin requests (CORS).

## API

### GeoPhotoControl

The main control class implementing MapLibre's `IControl` interface.

#### Constructor Options

| Option                      | Type      | Default       | Description                                            |
| --------------------------- | --------- | ------------- | ------------------------------------------------------ |
| `collapsed`                 | `boolean` | `true`        | Whether the panel starts collapsed                     |
| `position`                  | `string`  | `'top-right'` | Control position on the map                            |
| `title`                     | `string`  | `'GeoPhoto'`  | Title displayed in the panel header                    |
| `panelWidth`                | `number`  | `360`         | Initial width of the panel in pixels                   |
| `maxHeight`                 | `number`  | `500`         | Maximum panel height in pixels                         |
| `showPath`                  | `boolean` | `true`        | Show line connecting camera positions                  |
| `showPathDirectionArrows`   | `boolean` | `false`       | Show directional arrows along the path                 |
| `pathDirectionArrowSpacing` | `number`  | `48`          | Spacing between path direction arrows (pixels)         |
| `pathDirectionArrowSize`    | `number`  | `11`          | Path direction arrow size (pixels)                     |
| `pathDirectionArrowColor`   | `string`  | `pathColor`   | Path direction arrow color                             |
| `preloadUrl`                | `string`  | `''`          | ZIP dataset URL to auto-load when the control is added |
| `showObjects`               | `boolean` | `true`        | Show detected objects layer                            |
| `fitBoundsOnLoad`           | `boolean` | `true`        | Auto-fit map to data bounds                            |
| `fitBoundsPadding`          | `number`  | `50`          | Padding for fitBounds in pixels                        |
| `pathColor`                 | `string`  | `'#4a90d9'`   | Path line color                                        |
| `pointColor`                | `string`  | `'#4a90d9'`   | Camera point color                                     |
| `selectedPointColor`        | `string`  | `'#f97316'`   | Selected camera point color                            |

#### Methods

- `openFolder()` - Open folder picker dialog to load data
- `openZip(file)` - Load data from a ZIP file
- `loadZipFromUrl(zipUrl)` - Load data from a ZIP file URL
- `loadFromUrls(geojsonUrl, jsonUrl?, objectsUrl?, imageBasePath?)` - Load data from URLs
- `selectCamera(index)` - Select a camera by index
- `nextCamera()` / `prevCamera()` - Navigate to next/previous camera
- `firstCamera()` / `lastCamera()` - Jump to first/last camera
- `play()` / `stop()` / `togglePlay()` - Auto-play controls
- `clearData()` - Clear loaded data and return to file picker
- `toggle()` / `expand()` / `collapse()` - Panel visibility
- `on(event, handler)` / `off(event, handler)` - Event handling

#### Events

- `cameraselect` - Fired when a camera is selected
- `dataloaded` - Fired when trajectory data is loaded
- `datacleared` - Fired when data is cleared
- `collapse` / `expand` / `statechange` - Panel state events

## Development

```bash
# Clone the repository
git clone https://github.com/opengeos/maplibre-gl-geophoto.git
cd maplibre-gl-geophoto

# Install dependencies
npm install

# Start development server
npm run dev

# Build the library
npm run build

# Run tests
npm test
```

### Project Structure

```
maplibre-gl-geophoto/
├── src/
│   ├── index.ts              # Main entry point
│   ├── react.ts              # React entry point
│   ├── index.css             # Root styles
│   └── lib/
│       ├── core/             # GeoPhotoControl, React wrapper, types
│       ├── data/             # File reader (folder/ZIP/URL), parser
│       ├── hooks/            # React hooks (useGeoPhoto, usePluginState)
│       ├── utils/            # Utilities (geo, helpers)
│       └── styles/           # Component styles
├── tests/                    # Test files
├── examples/                 # Example applications
│   ├── streetview/           # Vanilla JS streetview example
│   └── streetview-react/     # React streetview example
└── .github/workflows/        # CI/CD workflows
```

## Docker

```bash
# Pull and run
docker pull ghcr.io/opengeos/maplibre-gl-geophoto:latest
docker run -p 8080:80 ghcr.io/opengeos/maplibre-gl-geophoto:latest

# Or build locally
docker build -t maplibre-gl-geophoto .
docker run -p 8080:80 maplibre-gl-geophoto
```

Then open http://localhost:8080/maplibre-gl-geophoto/ in your browser.

## License

MIT License - see [LICENSE](LICENSE) for details.
