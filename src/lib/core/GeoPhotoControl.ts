import type { IControl, Map as MapLibreMap } from 'maplibre-gl';
import type {
  GeoPhotoControlOptions,
  PluginState,
  GeoPhotoEvent,
  GeoPhotoEventHandler,
  CameraData,
  ImageResolver,
  LoadedData,
} from './types';
import { parseTrajectory, camerasToGeoJSON } from '../data/parser';
import { readFromDirectory, readFromZip, readFromUrls } from '../data/file-reader';

// SVG icon helpers (14x14, stroke-based)
const SVG_ATTRS = 'viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none"';
const ICON_FIRST = `<svg ${SVG_ATTRS}><rect x="3" y="5" width="3" height="14" rx="1"/><path d="M10 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 10 5.5z" transform="scale(-1,1) translate(-24,0)"/></svg>`;
const ICON_PREV = `<svg ${SVG_ATTRS}><path d="M7 12l11-7v14z"/></svg>`;
const ICON_PLAY = `<svg ${SVG_ATTRS}><path d="M6 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 6 4.5z"/></svg>`;
const ICON_PAUSE = `<svg ${SVG_ATTRS}><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>`;
const ICON_NEXT = `<svg ${SVG_ATTRS}><path d="M17 12L6 5v14z"/></svg>`;
const ICON_LAST = `<svg ${SVG_ATTRS}><path d="M10 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 10 5.5z"/><rect x="18" y="5" width="3" height="14" rx="1"/></svg>`;

const DEFAULT_OPTIONS: Required<GeoPhotoControlOptions> = {
  collapsed: true,
  position: 'top-right',
  title: 'GeoPhoto',
  panelWidth: 360,
  maxHeight: 500,
  className: '',
  showPath: true,
  showPathDirectionArrows: false,
  pathDirectionArrowSpacing: 48,
  pathDirectionArrowSize: 11,
  pathDirectionArrowColor: '#4a90d9',
  preloadUrl: '',
  fitBoundsOnLoad: true,
  fitBoundsPadding: 50,
  showObjects: true,
  pathColor: '#4a90d9',
  pointColor: '#4a90d9',
  selectedPointColor: '#f97316',
};

type EventHandlersMap = globalThis.Map<GeoPhotoEvent, Set<GeoPhotoEventHandler>>;

/**
 * A MapLibre GL control for visualizing geo-tagged photos and streetview imagery.
 * Users can load data from a local folder, ZIP file, or URLs.
 *
 * @example
 * ```typescript
 * const control = new GeoPhotoControl({
 *   title: 'Street View',
 *   collapsed: false,
 *   panelWidth: 360,
 * });
 * map.addControl(control, 'top-right');
 * ```
 */
export class GeoPhotoControl implements IControl {
  private _map?: MapLibreMap;
  private _mapContainer?: HTMLElement;
  private _container?: HTMLElement;
  private _panel?: HTMLElement;
  private _options: Required<GeoPhotoControlOptions>;
  private _state: PluginState;
  private _eventHandlers: EventHandlersMap = new globalThis.Map();

  // Panel positioning handlers
  private _resizeHandler: (() => void) | null = null;
  private _mapResizeHandler: (() => void) | null = null;
  private _clickOutsideHandler: ((e: MouseEvent) => void) | null = null;

  // Panel resize drag state
  private _resizeHandleEl?: HTMLElement;
  private _isResizing: boolean = false;
  private _resizeStartX: number = 0;
  private _resizeStartWidth: number = 0;
  private _resizeMouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private _resizeMouseUpHandler: ((e: MouseEvent) => void) | null = null;

  // Data state
  private _cameras: CameraData[] = [];
  private _currentIndex: number = -1;
  private _imageResolver: (ImageResolver & { cleanup?: () => void }) | null = null;
  private _isPlaying: boolean = false;
  private _playTimer: ReturnType<typeof setInterval> | null = null;
  private _playIntervalMs: number = 1000;

  // DOM references for viewer mode
  private _filePickerEl?: HTMLElement;
  private _viewerEl?: HTMLElement;
  private _loadingEl?: HTMLElement;
  private _imageEl?: HTMLImageElement;
  private _imagePlaceholder?: HTMLElement;
  private _coordsEl?: HTMLElement;
  private _elevEl?: HTMLElement;
  private _timeEl?: HTMLElement;
  private _counterEl?: HTMLElement;
  private _firstBtn?: HTMLButtonElement;
  private _prevBtn?: HTMLButtonElement;
  private _nextBtn?: HTMLButtonElement;
  private _lastBtn?: HTMLButtonElement;
  private _playBtn?: HTMLButtonElement;
  private _lightboxEl?: HTMLElement;
  private _lightboxImg?: HTMLImageElement;

  constructor(options?: Partial<GeoPhotoControlOptions>) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
    if (options?.pathDirectionArrowColor === undefined) {
      this._options.pathDirectionArrowColor = this._options.pathColor;
    }
    this._state = {
      collapsed: this._options.collapsed,
      panelWidth: this._options.panelWidth,
      data: {},
    };
  }

  /**
   * Called when the control is added to the map (IControl interface).
   */
  onAdd(map: MapLibreMap): HTMLElement {
    this._map = map;
    this._mapContainer = map.getContainer();
    this._container = this._createContainer();
    this._panel = this._createPanel();
    this._setupResizeHandle();

    this._mapContainer.appendChild(this._panel);
    this._setupEventListeners();

    if (!this._state.collapsed) {
      this._panel.classList.add('expanded');
      requestAnimationFrame(() => this._updatePanelPosition());
    }

    if (this._options.preloadUrl) {
      void this._loadZipFromUrl(this._options.preloadUrl);
    }

    return this._container;
  }

  /**
   * Called when the control is removed from the map (IControl interface).
   */
  onRemove(): void {
    this.stop();
    this._cleanupMapLayers();
    this._revokeBlobs();
    this._lightboxEl?.parentNode?.removeChild(this._lightboxEl);

    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._mapResizeHandler && this._map) {
      this._map.off('resize', this._mapResizeHandler);
      this._mapResizeHandler = null;
    }
    if (this._clickOutsideHandler) {
      document.removeEventListener('click', this._clickOutsideHandler);
      this._clickOutsideHandler = null;
    }
    if (this._resizeMouseMoveHandler) {
      document.removeEventListener('mousemove', this._resizeMouseMoveHandler);
      this._resizeMouseMoveHandler = null;
    }
    if (this._resizeMouseUpHandler) {
      document.removeEventListener('mouseup', this._resizeMouseUpHandler);
      this._resizeMouseUpHandler = null;
    }

    this._panel?.parentNode?.removeChild(this._panel);
    this._container?.parentNode?.removeChild(this._container);

    this._map = undefined;
    this._mapContainer = undefined;
    this._container = undefined;
    this._panel = undefined;
    this._eventHandlers.clear();
  }

  // ---- Public API: State ----

  /**
   * Gets the current state of the control.
   */
  getState(): PluginState {
    return { ...this._state };
  }

  /**
   * Updates the control state.
   */
  setState(newState: Partial<PluginState>): void {
    this._state = { ...this._state, ...newState };
    this._emit('statechange');
  }

  /**
   * Toggles the collapsed state.
   */
  toggle(): void {
    this._state.collapsed = !this._state.collapsed;

    if (this._panel) {
      if (this._state.collapsed) {
        this._panel.classList.remove('expanded');
        this._emit('collapse');
      } else {
        this._panel.classList.add('expanded');
        this._updatePanelPosition();
        this._emit('expand');
      }
    }
    this._emit('statechange');
  }

  expand(): void {
    if (this._state.collapsed) this.toggle();
  }

  collapse(): void {
    if (!this._state.collapsed) this.toggle();
  }

  // ---- Public API: Events ----

  on(event: GeoPhotoEvent, handler: GeoPhotoEventHandler): void {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }
    this._eventHandlers.get(event)!.add(handler);
  }

  off(event: GeoPhotoEvent, handler: GeoPhotoEventHandler): void {
    this._eventHandlers.get(event)?.delete(handler);
  }

  // ---- Public API: Data Loading ----

  /**
   * Opens a folder picker dialog and loads trajectory data.
   */
  async openFolder(): Promise<void> {
    try {
      const dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
      this._showLoading('Loading folder...');
      const data = await readFromDirectory(dirHandle);
      await this._processLoadedData(data);
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return; // User cancelled
      console.error('Failed to load folder:', err);
      this._showFilePicker();
    }
  }

  /**
   * Loads trajectory data from a ZIP file.
   */
  async openZip(file: File): Promise<void> {
    try {
      this._showLoading('Extracting ZIP...');
      const data = await readFromZip(file);
      await this._processLoadedData(data);
    } catch (err) {
      console.error('Failed to load ZIP:', err);
      this._showFilePicker();
    }
  }

  /**
   * Loads trajectory data from URLs.
   */
  async loadFromUrls(
    trajectoryGeojsonUrl: string,
    trajectoryJsonUrl?: string,
    objectsUrl?: string,
    imageBasePath?: string,
  ): Promise<void> {
    try {
      this._showLoading('Loading data...');
      const data = await readFromUrls(trajectoryGeojsonUrl, trajectoryJsonUrl, objectsUrl, imageBasePath);
      await this._processLoadedData(data);
    } catch (err) {
      console.error('Failed to load URLs:', err);
      this._showFilePicker();
    }
  }

  /**
   * Loads trajectory data from a ZIP file URL.
   */
  async loadZipFromUrl(zipUrl: string): Promise<void> {
    await this._loadZipFromUrl(zipUrl);
  }

  // ---- Public API: Navigation ----

  /**
   * Selects a camera by index.
   */
  selectCamera(index: number): void {
    if (index < 0 || index >= this._cameras.length) return;
    this._currentIndex = index;
    this._updateViewer();
    this._updateMapSelection();
    this._emit('cameraselect');
  }

  /**
   * Selects the next camera.
   */
  nextCamera(): void {
    if (this._currentIndex < this._cameras.length - 1) {
      this.selectCamera(this._currentIndex + 1);
    }
  }

  /**
   * Selects the previous camera.
   */
  prevCamera(): void {
    if (this._currentIndex > 0) {
      this.selectCamera(this._currentIndex - 1);
    }
  }

  /**
   * Selects the first camera.
   */
  firstCamera(): void {
    if (this._cameras.length > 0) {
      this.selectCamera(0);
    }
  }

  /**
   * Selects the last camera.
   */
  lastCamera(): void {
    if (this._cameras.length > 0) {
      this.selectCamera(this._cameras.length - 1);
    }
  }

  /**
   * Starts auto-playing through the image sequence.
   */
  play(): void {
    if (this._isPlaying || this._cameras.length === 0) return;
    this._isPlaying = true;
    this._updatePlayButton();
    this._playTimer = setInterval(() => {
      if (this._currentIndex < this._cameras.length - 1) {
        this.selectCamera(this._currentIndex + 1);
      } else {
        this.stop();
      }
    }, this._playIntervalMs);
  }

  /**
   * Stops auto-play.
   */
  stop(): void {
    if (!this._isPlaying) return;
    this._isPlaying = false;
    if (this._playTimer) {
      clearInterval(this._playTimer);
      this._playTimer = null;
    }
    this._updatePlayButton();
  }

  /**
   * Toggles play/stop.
   */
  togglePlay(): void {
    if (this._isPlaying) {
      this.stop();
    } else {
      this.play();
    }
  }

  /**
   * Returns all loaded cameras.
   */
  getCameras(): CameraData[] {
    return [...this._cameras];
  }

  /**
   * Returns the currently selected camera.
   */
  getCurrentCamera(): CameraData | null {
    return this._cameras[this._currentIndex] ?? null;
  }

  /**
   * Clears all loaded data and resets to file picker mode.
   */
  clearData(): void {
    this.stop();
    this._cleanupMapLayers();
    this._revokeBlobs();
    this._cameras = [];
    this._currentIndex = -1;
    this._imageResolver = null;
    this._showFilePicker();
    this._emit('datacleared');
  }

  /**
   * Gets the map instance.
   */
  getMap(): MapLibreMap | undefined {
    return this._map;
  }

  /**
   * Gets the control container element.
   */
  getContainer(): HTMLElement | undefined {
    return this._container;
  }

  // ---- Private: Event System ----

  private _emit(event: GeoPhotoEvent): void {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      const eventData = {
        type: event,
        state: this.getState(),
        camera: this.getCurrentCamera() ?? undefined,
        cameraIndex: this._currentIndex >= 0 ? this._currentIndex : undefined,
      };
      handlers.forEach((handler) => handler(eventData));
    }
  }

  // ---- Private: DOM Creation ----

  private _createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = `maplibregl-ctrl maplibregl-ctrl-group plugin-control${
      this._options.className ? ` ${this._options.className}` : ''
    }`;

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'plugin-control-toggle';
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-label', this._options.title);
    toggleBtn.innerHTML = `
      <span class="plugin-control-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="4" width="15" height="16" rx="2" ry="2"/>
          <polygon points="17 8 22 5.5 22 18.5 17 16"/>
        </svg>
      </span>
    `;
    toggleBtn.addEventListener('click', () => this.toggle());

    container.appendChild(toggleBtn);
    return container;
  }

  private _createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'plugin-control-panel geophoto-panel';
    panel.style.width = `${this._options.panelWidth}px`;
    panel.style.maxHeight = `${this._options.maxHeight}px`;

    // Header
    const header = document.createElement('div');
    header.className = 'plugin-control-header';

    const title = document.createElement('span');
    title.className = 'plugin-control-title';
    title.textContent = this._options.title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'plugin-control-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close panel');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.collapse());

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Content area
    const content = document.createElement('div');
    content.className = 'plugin-control-content';

    // File picker mode
    this._filePickerEl = this._createFilePicker();
    content.appendChild(this._filePickerEl);

    // Loading mode (hidden)
    this._loadingEl = this._createLoadingEl();
    this._loadingEl.style.display = 'none';
    content.appendChild(this._loadingEl);

    // Viewer mode (hidden)
    this._viewerEl = this._createViewer();
    this._viewerEl.style.display = 'none';
    content.appendChild(this._viewerEl);

    panel.appendChild(header);
    panel.appendChild(content);

    // Resize handle (appended last so it's on top in stacking order)
    this._resizeHandleEl = document.createElement('div');
    // Set initial side based on option (will be updated in _updatePanelPosition)
    const isRight = this._options.position === 'top-right' || this._options.position === 'bottom-right';
    this._resizeHandleEl.className = `geophoto-resize-handle ${isRight ? 'geophoto-resize-handle-left' : 'geophoto-resize-handle-right'}`;
    panel.appendChild(this._resizeHandleEl);

    return panel;
  }

  private _createFilePicker(): HTMLElement {
    const picker = document.createElement('div');
    picker.className = 'geophoto-file-picker';

    const instructions = document.createElement('p');
    instructions.className = 'geophoto-instructions';
    instructions.textContent = 'Select a folder, ZIP file, or HTTP ZIP URL containing trajectory data';

    const folderBtn = document.createElement('button');
    folderBtn.className = 'geophoto-btn';
    folderBtn.type = 'button';
    folderBtn.innerHTML = '<span class="geophoto-btn-icon">&#128193;</span> Open Folder';
    folderBtn.addEventListener('click', () => this.openFolder());

    const divider = document.createElement('div');
    divider.className = 'geophoto-file-divider';
    divider.textContent = 'or';

    const zipBtn = document.createElement('button');
    zipBtn.className = 'geophoto-btn';
    zipBtn.type = 'button';
    zipBtn.innerHTML = '<span class="geophoto-btn-icon">&#128230;</span> Open ZIP File';

    const zipInput = document.createElement('input');
    zipInput.type = 'file';
    zipInput.accept = '.zip';
    zipInput.style.display = 'none';
    zipInput.addEventListener('change', () => {
      const file = zipInput.files?.[0];
      if (file) this.openZip(file);
      zipInput.value = '';
    });

    zipBtn.addEventListener('click', () => {
      zipInput.click();
    });

    const divider2 = document.createElement('div');
    divider2.className = 'geophoto-file-divider';
    divider2.textContent = 'or';

    const urlBtn = document.createElement('button');
    urlBtn.className = 'geophoto-btn';
    urlBtn.type = 'button';
    urlBtn.innerHTML = '<span class="geophoto-btn-icon">&#127760;</span> Load from URL';

    const urlPanel = document.createElement('div');
    urlPanel.className = 'geophoto-url-panel';
    urlPanel.hidden = true;

    const urlForm = document.createElement('form');
    urlForm.className = 'geophoto-url-form';

    const urlInput = document.createElement('input');
    urlInput.className = 'geophoto-url-input';
    urlInput.type = 'url';
    urlInput.inputMode = 'url';
    urlInput.placeholder = 'https://example.com/dataset.zip';
    urlInput.value = this._options.preloadUrl || '';
    urlInput.setAttribute('aria-label', 'ZIP file URL');

    const urlSubmitBtn = document.createElement('button');
    urlSubmitBtn.className = 'geophoto-btn geophoto-url-submit';
    urlSubmitBtn.type = 'submit';
    urlSubmitBtn.innerHTML = '<span class="geophoto-btn-icon">&#11015;</span> Load ZIP URL';

    urlForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const trimmedUrl = urlInput.value.trim();
      if (!trimmedUrl) return;
      void this.loadZipFromUrl(trimmedUrl);
    });

    urlBtn.addEventListener('click', () => {
      urlPanel.hidden = !urlPanel.hidden;
      urlBtn.setAttribute('aria-expanded', String(!urlPanel.hidden));
      if (!urlPanel.hidden) {
        requestAnimationFrame(() => urlInput.focus());
      }
    });
    urlBtn.setAttribute('aria-expanded', 'false');

    urlForm.appendChild(urlInput);
    urlForm.appendChild(urlSubmitBtn);
    urlPanel.appendChild(urlForm);

    picker.appendChild(instructions);
    picker.appendChild(folderBtn);
    picker.appendChild(divider);
    picker.appendChild(zipBtn);
    picker.appendChild(divider2);
    picker.appendChild(urlBtn);
    picker.appendChild(urlPanel);
    picker.appendChild(zipInput);

    return picker;
  }

  private _createLoadingEl(): HTMLElement {
    const loading = document.createElement('div');
    loading.className = 'geophoto-loading';

    const spinner = document.createElement('div');
    spinner.className = 'geophoto-spinner';

    const text = document.createElement('p');
    text.className = 'geophoto-loading-text';
    text.textContent = 'Loading...';

    loading.appendChild(spinner);
    loading.appendChild(text);

    return loading;
  }

  private _createViewer(): HTMLElement {
    const viewer = document.createElement('div');
    viewer.className = 'geophoto-viewer';

    // Image container
    const imgContainer = document.createElement('div');
    imgContainer.className = 'geophoto-image-container';

    this._imageEl = document.createElement('img');
    this._imageEl.className = 'geophoto-image';
    this._imageEl.alt = 'Streetview photo';

    this._imagePlaceholder = document.createElement('div');
    this._imagePlaceholder.className = 'geophoto-image-loading';
    this._imagePlaceholder.innerHTML = '<div class="geophoto-spinner"></div>';
    this._imagePlaceholder.style.display = 'none';

    // Expand button overlay on image
    const expandBtn = document.createElement('button');
    expandBtn.className = 'geophoto-expand-btn';
    expandBtn.type = 'button';
    expandBtn.setAttribute('aria-label', 'Enlarge image');
    expandBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
    expandBtn.addEventListener('click', () => this._openLightbox());

    imgContainer.appendChild(this._imageEl);
    imgContainer.appendChild(this._imagePlaceholder);
    imgContainer.appendChild(expandBtn);

    // Also click image to enlarge
    this._imageEl.addEventListener('click', () => this._openLightbox());
    this._imageEl.style.cursor = 'zoom-in';

    // Metadata
    const metadata = document.createElement('div');
    metadata.className = 'geophoto-metadata';

    const coordRow = this._createMetadataRow('Coords:');
    this._coordsEl = coordRow.querySelector('.geophoto-metadata-value')!;
    const elevRow = this._createMetadataRow('Elevation:');
    this._elevEl = elevRow.querySelector('.geophoto-metadata-value')!;
    const timeRow = this._createMetadataRow('Time:');
    this._timeEl = timeRow.querySelector('.geophoto-metadata-value')!;

    metadata.appendChild(coordRow);
    metadata.appendChild(elevRow);
    metadata.appendChild(timeRow);

    // Navigation with first/prev/play/next/last buttons
    const nav = document.createElement('div');
    nav.className = 'geophoto-nav';

    this._firstBtn = document.createElement('button');
    this._firstBtn.className = 'geophoto-nav-btn geophoto-nav-btn-icon';
    this._firstBtn.type = 'button';
    this._firstBtn.setAttribute('aria-label', 'First image');
    this._firstBtn.innerHTML = ICON_FIRST;
    this._firstBtn.addEventListener('click', () => this.firstCamera());

    this._prevBtn = document.createElement('button');
    this._prevBtn.className = 'geophoto-nav-btn geophoto-nav-btn-icon';
    this._prevBtn.type = 'button';
    this._prevBtn.setAttribute('aria-label', 'Previous image');
    this._prevBtn.innerHTML = ICON_PREV;
    this._prevBtn.addEventListener('click', () => this.prevCamera());

    this._playBtn = document.createElement('button');
    this._playBtn.className = 'geophoto-nav-btn geophoto-play-btn';
    this._playBtn.type = 'button';
    this._playBtn.setAttribute('aria-label', 'Play sequence');
    this._playBtn.innerHTML = ICON_PLAY;
    this._playBtn.addEventListener('click', () => this.togglePlay());

    this._counterEl = document.createElement('span');
    this._counterEl.className = 'geophoto-nav-counter';
    this._counterEl.textContent = '0 / 0';

    this._nextBtn = document.createElement('button');
    this._nextBtn.className = 'geophoto-nav-btn geophoto-nav-btn-icon';
    this._nextBtn.type = 'button';
    this._nextBtn.setAttribute('aria-label', 'Next image');
    this._nextBtn.innerHTML = ICON_NEXT;
    this._nextBtn.addEventListener('click', () => this.nextCamera());

    this._lastBtn = document.createElement('button');
    this._lastBtn.className = 'geophoto-nav-btn geophoto-nav-btn-icon';
    this._lastBtn.type = 'button';
    this._lastBtn.setAttribute('aria-label', 'Last image');
    this._lastBtn.innerHTML = ICON_LAST;
    this._lastBtn.addEventListener('click', () => this.lastCamera());

    nav.appendChild(this._firstBtn);
    nav.appendChild(this._prevBtn);
    nav.appendChild(this._playBtn);
    nav.appendChild(this._counterEl);
    nav.appendChild(this._nextBtn);
    nav.appendChild(this._lastBtn);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'geophoto-actions';

    const clearBtn = document.createElement('button');
    clearBtn.className = 'geophoto-btn-small';
    clearBtn.type = 'button';
    clearBtn.textContent = 'Load Different Data';
    clearBtn.addEventListener('click', () => this.clearData());

    actions.appendChild(clearBtn);

    viewer.appendChild(imgContainer);
    viewer.appendChild(metadata);
    viewer.appendChild(nav);
    viewer.appendChild(actions);

    return viewer;
  }

  private _createMetadataRow(label: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'geophoto-metadata-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'geophoto-metadata-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('span');
    valueEl.className = 'geophoto-metadata-value';
    valueEl.textContent = '-';

    row.appendChild(labelEl);
    row.appendChild(valueEl);
    return row;
  }

  // ---- Private: Panel Mode Switching ----

  private _showFilePicker(): void {
    if (this._filePickerEl) this._filePickerEl.style.display = '';
    if (this._loadingEl) this._loadingEl.style.display = 'none';
    if (this._viewerEl) this._viewerEl.style.display = 'none';
  }

  private _showLoading(message: string): void {
    if (this._filePickerEl) this._filePickerEl.style.display = 'none';
    if (this._loadingEl) {
      this._loadingEl.style.display = '';
      const text = this._loadingEl.querySelector('.geophoto-loading-text');
      if (text) text.textContent = message;
    }
    if (this._viewerEl) this._viewerEl.style.display = 'none';

    // Auto-expand panel
    if (this._state.collapsed) this.expand();
  }

  private _showViewer(): void {
    if (this._filePickerEl) this._filePickerEl.style.display = 'none';
    if (this._loadingEl) this._loadingEl.style.display = 'none';
    if (this._viewerEl) this._viewerEl.style.display = '';
  }

  // ---- Private: Data Processing ----

  private async _processLoadedData(data: LoadedData): Promise<void> {
    this._revokeBlobs();

    if (!data.trajectoryGeojson) {
      console.warn('No trajectory.geojson file found');
      this._showFilePicker();
      return;
    }

    // Parse trajectory data
    const parsed = parseTrajectory(data.trajectoryGeojson, data.trajectoryJson);
    this._cameras = parsed.cameras;
    this._imageResolver = data.imageResolver as ImageResolver & { cleanup?: () => void };

    if (this._cameras.length === 0) {
      console.warn('No cameras found in trajectory data');
      this._showFilePicker();
      return;
    }

    // Setup map layers
    this._setupMapLayers(parsed);

    // Load objects if available
    if (data.objectsGeojson && this._options.showObjects) {
      this._setupObjectsLayer(data.objectsGeojson);
    }

    // Setup click interactions
    this._setupMapInteractions();

    // Show viewer and select first camera
    this._showViewer();
    this.selectCamera(0);

    // Fit bounds after initial selection, since selectCamera() pans to the active camera.
    if (this._options.fitBoundsOnLoad && this._map) {
      this._map.fitBounds(parsed.bounds, {
        padding: this._options.fitBoundsPadding,
      });
    }

    this._emit('dataloaded');
  }

  private async _loadZipFromUrl(zipUrl: string): Promise<void> {
    try {
      this._showLoading('Loading ZIP from URL...');
      const response = await fetch(zipUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} while fetching ZIP`);
      }

      const blob = await response.blob();
      const urlObj = new URL(zipUrl, window.location.href);
      const fileName = urlObj.pathname.split('/').pop() || 'dataset.zip';
      const zipFile = new File([blob], fileName, {
        type: blob.type || 'application/zip',
      });

      const data = await readFromZip(zipFile);
      await this._processLoadedData(data);
    } catch (err) {
      console.error('Failed to load ZIP from URL:', err);
      this._showFilePicker();
    }
  }

  // ---- Private: Map Layer Management ----

  private _setupMapLayers(parsed: ReturnType<typeof parseTrajectory>): void {
    if (!this._map) return;

    // Camera points source
    this._map.addSource('geophoto-cameras', {
      type: 'geojson',
      data: camerasToGeoJSON(this._cameras, -1),
    });

    // Path line source
    if (this._options.showPath) {
      this._map.addSource('geophoto-path', {
        type: 'geojson',
        data: parsed.lineFeature,
      });

      this._map.addLayer({
        id: 'geophoto-path-line',
        type: 'line',
        source: 'geophoto-path',
        paint: {
          'line-color': this._options.pathColor,
          'line-width': 2,
          'line-dasharray': [2, 2],
          'line-opacity': 0.7,
        },
      });

      if (this._options.showPathDirectionArrows) {
        this._map.addLayer({
          id: 'geophoto-path-arrows',
          type: 'symbol',
          source: 'geophoto-path',
          layout: {
            'symbol-placement': 'line',
            'symbol-spacing': this._options.pathDirectionArrowSpacing,
            'text-field': '▶',
            'text-size': this._options.pathDirectionArrowSize,
            'text-keep-upright': false,
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': this._options.pathDirectionArrowColor,
            'text-opacity': 0.9,
            'text-halo-color': '#ffffff',
            'text-halo-width': 1,
          },
        });
      }
    }

    // Camera points layer
    this._map.addLayer({
      id: 'geophoto-cameras-points',
      type: 'circle',
      source: 'geophoto-cameras',
      paint: {
        'circle-radius': 6,
        'circle-color': this._options.pointColor,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.9,
      },
    });

    // Selected camera highlight layer
    this._map.addLayer({
      id: 'geophoto-cameras-selected',
      type: 'circle',
      source: 'geophoto-cameras',
      filter: ['==', ['get', 'selected'], true],
      paint: {
        'circle-radius': 9,
        'circle-color': this._options.selectedPointColor,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });
  }

  private _setupObjectsLayer(objectsData: GeoJSON.FeatureCollection | { type: string; features: unknown[] }): void {
    if (!this._map) return;

    this._map.addSource('geophoto-objects', {
      type: 'geojson',
      data: objectsData as GeoJSON.FeatureCollection,
    });

    this._map.addLayer({
      id: 'geophoto-objects-points',
      type: 'circle',
      source: 'geophoto-objects',
      paint: {
        'circle-radius': 5,
        'circle-color': '#ef4444',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.8,
      },
    });

    this._map.addLayer({
      id: 'geophoto-objects-labels',
      type: 'symbol',
      source: 'geophoto-objects',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-offset': [0, 1.5],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: {
        'text-color': '#ef4444',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1,
      },
    });
  }

  private _setupMapInteractions(): void {
    if (!this._map) return;

    // Click on camera point
    this._map.on('click', 'geophoto-cameras-points', (e: unknown) => {
      const evt = e as {
        features?: Array<{ properties?: Record<string, unknown> }>;
        originalEvent?: Event;
      };
      // Stop event from reaching the general map click
      if (evt.originalEvent) evt.originalEvent.stopPropagation();
      if (evt.features && evt.features.length > 0) {
        const index = evt.features[0].properties?.index;
        if (typeof index === 'number') {
          this.stop(); // Stop auto-play if running
          this.selectCamera(index);
          if (this._state.collapsed) this.expand();
        }
      }
    });

    // Cursor change on hover
    this._map.on('mouseenter', 'geophoto-cameras-points', () => {
      if (this._map) this._map.getCanvas().style.cursor = 'pointer';
    });

    this._map.on('mouseleave', 'geophoto-cameras-points', () => {
      if (this._map) this._map.getCanvas().style.cursor = '';
    });

    // Also for objects
    if (this._map.getLayer('geophoto-objects-points')) {
      this._map.on('mouseenter', 'geophoto-objects-points', () => {
        if (this._map) this._map.getCanvas().style.cursor = 'pointer';
      });
      this._map.on('mouseleave', 'geophoto-objects-points', () => {
        if (this._map) this._map.getCanvas().style.cursor = '';
      });
    }
  }

  private _cleanupMapLayers(): void {
    if (!this._map) return;

    const layers = [
      'geophoto-cameras-selected',
      'geophoto-cameras-points',
      'geophoto-path-arrows',
      'geophoto-path-line',
      'geophoto-objects-labels',
      'geophoto-objects-points',
    ];
    for (const id of layers) {
      if (this._map.getLayer(id)) this._map.removeLayer(id);
    }

    const sources = ['geophoto-cameras', 'geophoto-path', 'geophoto-objects'];
    for (const id of sources) {
      if (this._map.getSource(id)) this._map.removeSource(id);
    }
  }

  // ---- Private: Viewer Updates ----

  private async _updateViewer(): Promise<void> {
    const camera = this._cameras[this._currentIndex];
    if (!camera) return;

    // Update metadata
    if (this._coordsEl) {
      this._coordsEl.textContent = `${camera.coordinates[1].toFixed(6)}, ${camera.coordinates[0].toFixed(6)}`;
    }
    if (this._elevEl) {
      this._elevEl.textContent = `${camera.elevation.toFixed(1)} m`;
    }
    if (this._timeEl) {
      if (camera.captureTime) {
        const date = new Date(camera.captureTime * 1000);
        this._timeEl.textContent = date.toISOString().replace('T', ' ').substring(0, 19);
      } else {
        this._timeEl.textContent = '-';
      }
    }

    // Update navigation
    if (this._counterEl) {
      this._counterEl.textContent = `${this._currentIndex + 1} / ${this._cameras.length}`;
    }
    if (this._firstBtn) {
      this._firstBtn.disabled = this._currentIndex <= 0;
    }
    if (this._prevBtn) {
      this._prevBtn.disabled = this._currentIndex <= 0;
    }
    if (this._nextBtn) {
      this._nextBtn.disabled = this._currentIndex >= this._cameras.length - 1;
    }
    if (this._lastBtn) {
      this._lastBtn.disabled = this._currentIndex >= this._cameras.length - 1;
    }

    // Load image
    if (this._imageEl && this._imageResolver) {
      if (this._imagePlaceholder) this._imagePlaceholder.style.display = '';
      const loadIndex = this._currentIndex;
      try {
        const url = await this._imageResolver(camera.id);
        if (url && this._currentIndex === loadIndex) {
          this._imageEl.src = url;
          // Also update lightbox if open
          if (this._lightboxImg && this._lightboxEl?.classList.contains('geophoto-lightbox-open')) {
            this._lightboxImg.src = url;
          }
          this._imageEl.onload = () => {
            if (this._imagePlaceholder) this._imagePlaceholder.style.display = 'none';
          };
          this._imageEl.onerror = () => {
            if (this._imagePlaceholder) this._imagePlaceholder.style.display = 'none';
          };
        }
      } catch {
        if (this._imagePlaceholder) this._imagePlaceholder.style.display = 'none';
      }
    }
  }

  private _updateMapSelection(): void {
    if (!this._map || !this._map.getSource('geophoto-cameras')) return;

    const source = this._map.getSource('geophoto-cameras') as maplibregl.GeoJSONSource;
    source.setData(camerasToGeoJSON(this._cameras, this._currentIndex));

    // Pan to selected camera
    const camera = this._cameras[this._currentIndex];
    if (camera) {
      this._map.panTo(camera.coordinates);
    }
  }

  // ---- Private: Play Button ----

  private _updatePlayButton(): void {
    if (!this._playBtn) return;
    if (this._isPlaying) {
      this._playBtn.innerHTML = ICON_PAUSE;
      this._playBtn.setAttribute('aria-label', 'Pause sequence');
      this._playBtn.classList.add('geophoto-playing');
    } else {
      this._playBtn.innerHTML = ICON_PLAY;
      this._playBtn.setAttribute('aria-label', 'Play sequence');
      this._playBtn.classList.remove('geophoto-playing');
    }
  }

  // ---- Private: Lightbox ----

  private _openLightbox(): void {
    if (!this._imageEl || !this._imageEl.src) return;

    // Create lightbox if it doesn't exist
    if (!this._lightboxEl) {
      this._lightboxEl = document.createElement('div');
      this._lightboxEl.className = 'geophoto-lightbox';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'geophoto-lightbox-close';
      closeBtn.type = 'button';
      closeBtn.innerHTML = '&times;';
      closeBtn.addEventListener('click', () => this._closeLightbox());

      this._lightboxImg = document.createElement('img');
      this._lightboxImg.className = 'geophoto-lightbox-img';
      this._lightboxImg.alt = 'Enlarged streetview photo';

      // Navigation in lightbox
      const lightboxNav = document.createElement('div');
      lightboxNav.className = 'geophoto-lightbox-nav';

      const lbPrev = document.createElement('button');
      lbPrev.className = 'geophoto-lightbox-nav-btn';
      lbPrev.type = 'button';
      lbPrev.innerHTML = '\u2190';
      lbPrev.addEventListener('click', (e) => { e.stopPropagation(); this.prevCamera(); });

      const lbNext = document.createElement('button');
      lbNext.className = 'geophoto-lightbox-nav-btn';
      lbNext.type = 'button';
      lbNext.innerHTML = '\u2192';
      lbNext.addEventListener('click', (e) => { e.stopPropagation(); this.nextCamera(); });

      lightboxNav.appendChild(lbPrev);
      lightboxNav.appendChild(lbNext);

      this._lightboxEl.appendChild(closeBtn);
      this._lightboxEl.appendChild(this._lightboxImg);
      this._lightboxEl.appendChild(lightboxNav);

      // Click backdrop to close
      this._lightboxEl.addEventListener('click', (e) => {
        if (e.target === this._lightboxEl) this._closeLightbox();
      });

      // Esc key to close
      this._lightboxEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this._closeLightbox();
        if (e.key === 'ArrowLeft') this.prevCamera();
        if (e.key === 'ArrowRight') this.nextCamera();
      });

      document.body.appendChild(this._lightboxEl);
    }

    this._lightboxImg!.src = this._imageEl.src;
    this._lightboxEl.classList.add('geophoto-lightbox-open');
    this._lightboxEl.focus();
    this._lightboxEl.setAttribute('tabindex', '-1');
  }

  private _closeLightbox(): void {
    if (this._lightboxEl) {
      this._lightboxEl.classList.remove('geophoto-lightbox-open');
    }
  }

  // ---- Private: Cleanup ----

  private _revokeBlobs(): void {
    if (this._imageResolver?.cleanup) {
      this._imageResolver.cleanup();
    }
  }

  // ---- Private: Panel Resize ----

  private _setupResizeHandle(): void {
    if (!this._resizeHandleEl || !this._panel) return;

    this._resizeHandleEl.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this._isResizing = true;
      this._resizeStartX = e.clientX;
      this._resizeStartWidth = this._panel?.offsetWidth ?? this._options.panelWidth;

      // Prevent text selection while dragging
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';

      this._resizeMouseMoveHandler = (moveEvent: MouseEvent) => {
        if (!this._isResizing || !this._panel) return;
        moveEvent.preventDefault();
        const position = this._getControlPosition();
        const isRight = position === 'top-right' || position === 'bottom-right';
        // If panel is on the right, dragging left (negative dx) increases width
        const dx = moveEvent.clientX - this._resizeStartX;
        const newWidth = isRight
          ? this._resizeStartWidth - dx
          : this._resizeStartWidth + dx;
        const clampedWidth = Math.max(240, Math.min(newWidth, 1000));
        this._panel.style.width = `${clampedWidth}px`;
        this._state.panelWidth = clampedWidth;
      };

      this._resizeMouseUpHandler = () => {
        this._isResizing = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        if (this._resizeMouseMoveHandler) {
          document.removeEventListener('mousemove', this._resizeMouseMoveHandler);
          this._resizeMouseMoveHandler = null;
        }
        if (this._resizeMouseUpHandler) {
          document.removeEventListener('mouseup', this._resizeMouseUpHandler);
          this._resizeMouseUpHandler = null;
        }
      };

      document.addEventListener('mousemove', this._resizeMouseMoveHandler);
      document.addEventListener('mouseup', this._resizeMouseUpHandler);
    });
  }

  // ---- Private: Panel Positioning (from PluginControl template) ----

  private _setupEventListeners(): void {
    this._clickOutsideHandler = (e: MouseEvent) => {
      const target = e.target as Node;
      // If target was removed from DOM during the click handler (e.g. innerHTML swap),
      // it's not a genuine outside click — ignore it
      if (!target.isConnected) return;
      // Don't collapse when clicking: toggle button, panel, the map, or the lightbox
      if (
        this._container &&
        this._panel &&
        !this._container.contains(target) &&
        !this._panel.contains(target) &&
        !(this._mapContainer && this._mapContainer.contains(target)) &&
        !(this._lightboxEl && this._lightboxEl.contains(target))
      ) {
        this.collapse();
      }
    };
    document.addEventListener('click', this._clickOutsideHandler);

    this._resizeHandler = () => {
      if (!this._state.collapsed) this._updatePanelPosition();
    };
    window.addEventListener('resize', this._resizeHandler);

    this._mapResizeHandler = () => {
      if (!this._state.collapsed) this._updatePanelPosition();
    };
    this._map?.on('resize', this._mapResizeHandler);
  }

  private _getControlPosition(): 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' {
    const parent = this._container?.parentElement;
    if (!parent) return 'top-right';

    if (parent.classList.contains('maplibregl-ctrl-top-left')) return 'top-left';
    if (parent.classList.contains('maplibregl-ctrl-top-right')) return 'top-right';
    if (parent.classList.contains('maplibregl-ctrl-bottom-left')) return 'bottom-left';
    if (parent.classList.contains('maplibregl-ctrl-bottom-right')) return 'bottom-right';

    return 'top-right';
  }

  private _updatePanelPosition(): void {
    if (!this._container || !this._panel || !this._mapContainer) return;

    const button = this._container.querySelector('.plugin-control-toggle');
    if (!button) return;

    const buttonRect = button.getBoundingClientRect();
    const mapRect = this._mapContainer.getBoundingClientRect();
    const position = this._getControlPosition();

    // Update resize handle side based on panel position
    if (this._resizeHandleEl) {
      const isRight = position === 'top-right' || position === 'bottom-right';
      this._resizeHandleEl.classList.toggle('geophoto-resize-handle-left', isRight);
      this._resizeHandleEl.classList.toggle('geophoto-resize-handle-right', !isRight);
    }

    const buttonTop = buttonRect.top - mapRect.top;
    const buttonBottom = mapRect.bottom - buttonRect.bottom;
    const buttonLeft = buttonRect.left - mapRect.left;
    const buttonRight = mapRect.right - buttonRect.right;
    const panelGap = 5;

    this._panel.style.top = '';
    this._panel.style.bottom = '';
    this._panel.style.left = '';
    this._panel.style.right = '';

    switch (position) {
      case 'top-left':
        this._panel.style.top = `${buttonTop + buttonRect.height + panelGap}px`;
        this._panel.style.left = `${buttonLeft}px`;
        break;
      case 'top-right':
        this._panel.style.top = `${buttonTop + buttonRect.height + panelGap}px`;
        this._panel.style.right = `${buttonRight}px`;
        break;
      case 'bottom-left':
        this._panel.style.bottom = `${buttonBottom + buttonRect.height + panelGap}px`;
        this._panel.style.left = `${buttonLeft}px`;
        break;
      case 'bottom-right':
        this._panel.style.bottom = `${buttonBottom + buttonRect.height + panelGap}px`;
        this._panel.style.right = `${buttonRight}px`;
        break;
    }
  }
}
