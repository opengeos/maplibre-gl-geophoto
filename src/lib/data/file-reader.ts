import JSZip from 'jszip';
import type {
  LoadedData,
  ImageResolver,
  RawTrajectoryGeojson,
  RawTrajectoryJson,
  RawObjectsGeojson,
} from '../core/types';

/**
 * Reads trajectory data from a local directory using the File System Access API.
 *
 * @param dirHandle - FileSystemDirectoryHandle from showDirectoryPicker()
 * @returns Loaded data with JSON contents and an image resolver
 */
export async function readFromDirectory(
  dirHandle: FileSystemDirectoryHandle,
): Promise<LoadedData> {
  let trajectoryGeojson: RawTrajectoryGeojson | null = null;
  let trajectoryJson: RawTrajectoryJson | null = null;
  let objectsGeojson: RawObjectsGeojson | null = null;
  let imagesDir: FileSystemDirectoryHandle | null = null;

  // Iterate top-level entries using the async iterable protocol
  // FileSystemDirectoryHandle implements Symbol.asyncIterator in browsers
  // but TypeScript's lib doesn't include this yet, so we cast
  const dirIter = dirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>;
  for await (const [name, handle] of dirIter) {
    if (handle.kind === 'file') {
      if (name === 'trajectory.geojson') {
        const file = await (handle as FileSystemFileHandle).getFile();
        trajectoryGeojson = JSON.parse(await file.text());
      } else if (!trajectoryGeojson && name.endsWith('.geojson') && name !== 'objects.geojson') {
        const file = await (handle as FileSystemFileHandle).getFile();
        trajectoryGeojson = JSON.parse(await file.text());
      } else if (name === 'trajectory.json') {
        const file = await (handle as FileSystemFileHandle).getFile();
        trajectoryJson = JSON.parse(await file.text());
      } else if (!trajectoryJson && name.endsWith('.json') && name !== 'trajectory.json') {
        const file = await (handle as FileSystemFileHandle).getFile();
        trajectoryJson = JSON.parse(await file.text());
      } else if (name === 'objects.geojson') {
        const file = await (handle as FileSystemFileHandle).getFile();
        objectsGeojson = JSON.parse(await file.text());
      }
    } else if (handle.kind === 'directory' && name === 'images') {
      imagesDir = handle as FileSystemDirectoryHandle;
    }
  }

  // Build a map of image file handles for lazy loading
  const imageHandles = new Map<string, FileSystemFileHandle>();
  if (imagesDir) {
    const imgIter = imagesDir as unknown as AsyncIterable<[string, FileSystemHandle]>;
    for await (const [name, handle] of imgIter) {
      if (handle.kind === 'file') {
        imageHandles.set(name, handle as FileSystemFileHandle);
      }
    }
  }

  // Track blob URLs for cleanup
  const blobUrls = new Set<string>();

  const imageResolver: ImageResolver = async (imageId: string) => {
    const fileHandle = imageHandles.get(imageId);
    if (!fileHandle) return null;
    const file = await fileHandle.getFile();
    const url = URL.createObjectURL(file);
    blobUrls.add(url);
    return url;
  };

  // Attach cleanup method to resolver
  (imageResolver as ImageResolver & { cleanup?: () => void }).cleanup = () => {
    for (const url of blobUrls) {
      URL.revokeObjectURL(url);
    }
    blobUrls.clear();
  };

  return { trajectoryGeojson, trajectoryJson, objectsGeojson, imageResolver };
}

/**
 * Reads trajectory data from a ZIP file.
 *
 * @param file - ZIP File from file input
 * @returns Loaded data with JSON contents and an image resolver
 */
export async function readFromZip(file: File): Promise<LoadedData> {
  const zip = await JSZip.loadAsync(file);

  let trajectoryGeojson: RawTrajectoryGeojson | null = null;
  let trajectoryJson: RawTrajectoryJson | null = null;
  let objectsGeojson: RawObjectsGeojson | null = null;

  // Find files within the zip (handle possible root folder nesting)
  const files = Object.keys(zip.files);

  // Detect common prefix (e.g., "folder_name/")
  let prefix = '';
  if (files.length > 0) {
    const firstSlash = files[0].indexOf('/');
    if (firstSlash > 0) {
      const candidate = files[0].substring(0, firstSlash + 1);
      const allMatch = files.every((f) => f.startsWith(candidate) || f === candidate.slice(0, -1));
      if (allMatch) {
        prefix = candidate;
      }
    }
  }

  // Read JSON files
  const geojsonFile = zip.file(prefix + 'trajectory.geojson')
    ?? Object.entries(zip.files).find(([path, entry]) => {
      if (entry.dir) return false;
      if (!path.startsWith(prefix)) return false;
      const name = path.slice(prefix.length);
      return !!name && name.endsWith('.geojson') && name !== 'objects.geojson';
    })?.[1];
  if (geojsonFile) {
    trajectoryGeojson = JSON.parse(await geojsonFile.async('text'));
  }

  const jsonFile = zip.file(prefix + 'trajectory.json')
    ?? Object.entries(zip.files).find(([path, entry]) => {
      if (entry.dir) return false;
      if (!path.startsWith(prefix)) return false;
      const name = path.slice(prefix.length);
      return !!name && name.endsWith('.json') && !name.endsWith('.geojson') && name !== 'trajectory.json';
    })?.[1];
  if (jsonFile) {
    trajectoryJson = JSON.parse(await jsonFile.async('text'));
  }

  const objectsFile = zip.file(prefix + 'objects.geojson');
  if (objectsFile) {
    objectsGeojson = JSON.parse(await objectsFile.async('text'));
  }

  // Extract image blobs
  const imageBlobUrls = new Map<string, string>();
  const imagesPrefix = prefix + 'images/';

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (path.startsWith(imagesPrefix) && !zipEntry.dir) {
      const filename = path.substring(imagesPrefix.length);
      if (filename && (filename.endsWith('.jpg') || filename.endsWith('.jpeg') || filename.endsWith('.png'))) {
        const blob = await zipEntry.async('blob');
        imageBlobUrls.set(filename, URL.createObjectURL(blob));
      }
    }
  }

  const imageResolver: ImageResolver = async (imageId: string) => {
    return imageBlobUrls.get(imageId) ?? null;
  };

  (imageResolver as ImageResolver & { cleanup?: () => void }).cleanup = () => {
    for (const url of imageBlobUrls.values()) {
      URL.revokeObjectURL(url);
    }
    imageBlobUrls.clear();
  };

  return { trajectoryGeojson, trajectoryJson, objectsGeojson, imageResolver };
}

/**
 * Creates a LoadedData from URL-based resources.
 *
 * @param trajectoryGeojsonUrl - URL to trajectory.geojson
 * @param trajectoryJsonUrl - Optional URL to trajectory.json
 * @param objectsUrl - Optional URL to objects.geojson
 * @param imageBasePath - Base URL for image files
 * @returns Loaded data with JSON contents and a URL-based image resolver
 */
export async function readFromUrls(
  trajectoryGeojsonUrl: string,
  trajectoryJsonUrl?: string,
  objectsUrl?: string,
  imageBasePath?: string,
): Promise<LoadedData> {
  const [trajectoryGeojsonResp, trajectoryJsonResp, objectsResp] = await Promise.all([
    fetch(trajectoryGeojsonUrl).then((r) => r.json()),
    trajectoryJsonUrl ? fetch(trajectoryJsonUrl).then((r) => r.json()) : Promise.resolve(null),
    objectsUrl ? fetch(objectsUrl).then((r) => r.json()) : Promise.resolve(null),
  ]);

  const imageResolver: ImageResolver = async (imageId: string) => {
    if (!imageBasePath) return null;
    return `${imageBasePath}/${imageId}`;
  };

  (imageResolver as ImageResolver & { cleanup?: () => void }).cleanup = () => {};

  return {
    trajectoryGeojson: trajectoryGeojsonResp,
    trajectoryJson: trajectoryJsonResp,
    objectsGeojson: objectsResp,
    imageResolver,
  };
}
