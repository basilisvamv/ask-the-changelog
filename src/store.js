// Storage in JSON files. One company = one snapshot. Changes are kept in one list.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const DATA = path.resolve(import.meta.dirname, '..', 'data');
const MAX_CHANGES = 500;

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2));
}

export const loadSnapshot = (id) =>
  readJson(path.join(DATA, 'snapshots', `${id}.json`), null);

export const saveSnapshot = (id, snap) =>
  writeJson(path.join(DATA, 'snapshots', `${id}.json`), snap);

export const loadChanges = () =>
  readJson(path.join(DATA, 'changes.json'), []);

export async function appendChanges(newOnes) {
  if (newOnes.length === 0) return;
  const all = await loadChanges();
  await writeJson(path.join(DATA, 'changes.json'), [...newOnes, ...all].slice(0, MAX_CHANGES));
}

export const loadProfile = () => readJson(path.join(DATA, 'profile.json'), null);

export const saveProfile = (tags) =>
  writeJson(path.join(DATA, 'profile.json'), { tags, saved_at: new Date().toISOString() });
