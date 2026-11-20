export const LOCAL_SCHEMA = 'wand.collection.local@1';
export const LOCAL_KEY = 'dreamwishwand.collection.local.v1';
export const MAX_WORKSPACES = 5;
const VALID_STATUS = new Set(['owned', 'missing']);

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function validId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

export function createCollectionState() {
  return {
    schema: LOCAL_SCHEMA,
    active: 'local-1',
    workspaces: [{ id: 'local-1', name: 'My Collection', entries: {} }]
  };
}

export function validateCollectionState(input) {
  if (!asRecord(input) || input.schema !== LOCAL_SCHEMA || !Array.isArray(input.workspaces) || !input.workspaces.length || input.workspaces.length > MAX_WORKSPACES)
    throw new Error('Unsupported collection backup.');
  const ids = new Set();
  const workspaces = input.workspaces.map((workspace) => {
    if (!asRecord(workspace) || !validId(workspace.id) || ids.has(workspace.id) || typeof workspace.name !== 'string' || !workspace.name.trim() || workspace.name.length > 80 || !asRecord(workspace.entries))
      throw new Error('Invalid collection workspace.');
    ids.add(workspace.id);
    const entries = {};
    for (const [id, value] of Object.entries(workspace.entries)) {
      if (!/^[1-9]\d{0,11}$/.test(id) || !Number.isSafeInteger(Number(id)) || !asRecord(value))
        throw new Error('Invalid collection entry.');
      const allowed = ['status', 'quantity', 'discovered', 'favorite'];
      if (Object.keys(value).some((key) => !allowed.includes(key)))
        throw new Error('Unsupported collection field.');
      const entry = {};
      if (value.status !== undefined) {
        if (!VALID_STATUS.has(value.status)) throw new Error('Invalid owned state.');
        entry.status = value.status;
      }
      if (value.quantity !== undefined) {
        if (!Number.isInteger(value.quantity) || value.quantity < 0 || value.quantity > 999999)
          throw new Error('Invalid item quantity.');
        entry.quantity = value.quantity;
      }
      if (value.discovered !== undefined) {
        if (typeof value.discovered !== 'boolean') throw new Error('Invalid discovery state.');
        entry.discovered = value.discovered;
      }
      if (value.favorite !== undefined) {
        if (typeof value.favorite !== 'boolean') throw new Error('Invalid favorite state.');
        entry.favorite = value.favorite;
      }
      if (Object.keys(entry).length) entries[id] = entry;
    }
    return { id: workspace.id, name: workspace.name.trim(), entries };
  });
  if (!ids.has(input.active)) throw new Error('Collection workspace not found.');
  return { schema: LOCAL_SCHEMA, active: input.active, workspaces };
}

export function readCollectionState(storage) {
  const raw = storage.getItem(LOCAL_KEY);
  return raw === null ? createCollectionState() : validateCollectionState(JSON.parse(raw));
}

export function persistCollectionState(storage, state) {
  const checked = validateCollectionState(state);
  storage.setItem(LOCAL_KEY, JSON.stringify(checked));
  return checked;
}

export function activeWorkspace(state) {
  return state.workspaces.find((workspace) => workspace.id === state.active);
}

export function setActiveWorkspace(state, id) {
  if (!state.workspaces.some((workspace) => workspace.id === id)) throw new Error('Unknown workspace.');
  return validateCollectionState({ ...state, active: id });
}

export function addWorkspace(state, name, id) {
  if (state.workspaces.length >= MAX_WORKSPACES) throw new Error('Workspace limit reached.');
  if (!validId(id) || state.workspaces.some((workspace) => workspace.id === id))
    throw new Error('Invalid workspace identity.');
  return validateCollectionState({
    ...state,
    active: id,
    workspaces: [...state.workspaces, { id, name: String(name).trim(), entries: {} }]
  });
}

export function renameWorkspace(state, id, name) {
  return validateCollectionState({
    ...state,
    workspaces: state.workspaces.map((workspace) => workspace.id === id ? { ...workspace, name: String(name).trim() } : workspace)
  });
}

export function removeWorkspace(state, id) {
  if (state.workspaces.length === 1) throw new Error('The last workspace cannot be removed.');
  const workspaces = state.workspaces.filter((workspace) => workspace.id !== id);
  if (workspaces.length === state.workspaces.length) throw new Error('Unknown workspace.');
  return validateCollectionState({ ...state, workspaces, active: state.active === id ? workspaces[0].id : state.active });
}

export function setCollectionEntry(state, itemId, changes) {
  const id = String(itemId);
  if (!/^[1-9]\d{0,11}$/.test(id) || !asRecord(changes)) throw new Error('Invalid item ID or changes.');
  const workspace = activeWorkspace(state);
  const current = { ...(workspace.entries[id] ?? {}) };
  for (const [key, value] of Object.entries(changes)) {
    if (!['status', 'quantity', 'discovered', 'favorite'].includes(key)) throw new Error('Unsupported collection change.');
    if (value === null || value === undefined) delete current[key];
    else current[key] = value;
  }
  const entries = { ...workspace.entries };
  if (Object.keys(current).length) entries[id] = current;
  else delete entries[id];
  return validateCollectionState({
    ...state,
    workspaces: state.workspaces.map((item) => item.id === state.active ? { ...item, entries } : item)
  });
}

export function setCollectionStatuses(state, itemIds, status) {
  if (!Array.isArray(itemIds) || itemIds.length > 20000 || (status !== null && !VALID_STATUS.has(status)))
    throw new Error('Invalid bulk collection operation.');
  const workspace = activeWorkspace(state);
  const entries = { ...workspace.entries };
  for (const value of itemIds) {
    const id = String(value);
    if (!/^[1-9]\\d{0,11}$/.test(id) || !Number.isSafeInteger(Number(id)))
      throw new Error('Invalid bulk item ID.');
    const entry = { ...(entries[id] ?? {}) };
    if (status === null) delete entry.status;
    else entry.status = status;
    if (Object.keys(entry).length) entries[id] = entry;
    else delete entries[id];
  }
  return validateCollectionState({
    ...state,
    workspaces: state.workspaces.map((item) => item.id === state.active ? { ...item, entries } : item)
  });
}

export function exportCollectionState(state) {
  return JSON.stringify(validateCollectionState(state), null, 2);
}

export function importCollectionState(json) {
  if (typeof json !== 'string' || json.length > 10000000) throw new Error('Invalid backup file.');
  return validateCollectionState(JSON.parse(json));
}

export function collectionProgress(records, entries) {
  let owned = 0;
  let missing = 0;
  let unknown = 0;
  let discovered = 0;
  for (const record of records) {
    const entry = entries[String(record.itemId)];
    if (entry?.status === 'owned') owned++;
    else if (entry?.status === 'missing') missing++;
    else unknown++;
    if (entry?.discovered === true) discovered++;
  }
  return { owned, missing, unknown, discovered, total: records.length };
}
