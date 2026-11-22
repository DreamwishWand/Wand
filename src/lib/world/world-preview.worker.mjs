import { openLocalWorldZip } from './local-snapshot.mjs';
import { getNativeTerrainWindow } from './catalog.mjs';
import {
  listWorldPreviewViews, summarizeWorldPreviewSourceCoverage,
  getWorldPreviewAnchorWindow,
} from './preview-views.mjs';

// Worker owns the source records; the Svelte page sees only selected read-only
// preview data. This worker has no fetch(), writer, save integration or upload.
let loaded = null;
let catalog = null;
let views = [];
self.onmessage = async event => {
  const message = event.data;
  const requestId = Number.isSafeInteger(message?.requestId) ? message.requestId : 0;
  try {
    if (message?.command === 'clear') {
      loaded = null;
      catalog = null;
      views = [];
      self.postMessage({kind:'cleared', requestId});
      return;
    }
    if (message?.command === 'load') {
      loaded = null;
      catalog = null;
      views = [];
      const source = await openLocalWorldZip(message.file);
      catalog = source.catalog;
      loaded = source;
      views = listWorldPreviewViews(catalog);
      self.postMessage({
        kind:'loaded', requestId,
        gameVersion:source.gameVersion, platform:source.platform,
        integrity:source.integrity,
        originalSourceAuthenticated:false, privateDataUploaded:false,
        manifestFilesVerified:source.manifestFilesVerified,
        sourceScopeVerified:source.sourceScopeVerified,
        regionCoverage:summarizeWorldPreviewSourceCoverage(catalog),
        layouts: views,
      });
      return;
    }
    if (message?.command !== 'view' || !catalog) {
      throw new TypeError('No selected local World source');
    }
    const {viewKey, gridIdNative, rect, offset} = message;
    const sourceView = views.find(view => view.viewKey === viewKey);
    const page = getWorldPreviewAnchorWindow(
      catalog, sourceView, gridIdNative, rect,
      {offset, limit:64});
    if (page.status !== 'source_native_default_layout_anchors_only') {
      self.postMessage({kind:'view', requestId, page, markers:[], terrainStatus:null});
      return;
    }
    // Aggregate all recorded source anchors as **point counts**, not native
    // footprint/collision masks. Only the selected 32x32 viewport is scanned.
    const full = getWorldPreviewAnchorWindow(
      catalog, sourceView, gridIdNative, rect);
    const counts = new Map();
    for (const record of full.defaultObjectAnchors) {
      const key = record.x + ':' + record.y;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const markers = [...counts].map(([key,count]) => {
      const [x,y] = key.split(':').map(Number);
      return {x,y,count};
    });
    const terrain = getNativeTerrainWindow(catalog, page.gridDataPath, rect);
    self.postMessage({
      kind:'view', requestId, page, markers,
      terrainStatus:terrain.status,
      terrainRows:terrain.status === 'source_corroborated_grid_local_preview'
        ? terrain.rows : null,
    });
  } catch (error) {
    self.postMessage({
      kind:'error', requestId,
      message: error instanceof Error ? error.message.slice(0, 240) :
        'ローカルWorldデータの処理に失敗しました。',
    });
  }
};
