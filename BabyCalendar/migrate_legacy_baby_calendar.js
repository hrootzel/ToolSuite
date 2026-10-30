#!/usr/bin/env node
// One-time migration from the OLD BabyCalendar server API's state.json file.
// Run manually BEFORE opening the newly upgraded calendar in a browser.
// Does NOT run in the web server, and never overwrites an existing new document.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

async function main() {
  const [legacyFile, appDir] = process.argv.slice(2);
  if (!legacyFile || !appDir) {
    console.error('Usage: node migrate_legacy_baby_calendar.js /old/.baby-calendar-data/state.json /srv/www/ToolSuite');
    process.exitCode = 2;
    return;
  }
  const old = JSON.parse(await fs.promises.readFile(path.resolve(legacyFile), 'utf8'));
  if (old.version !== 1 || !Array.isArray(old.entries) || !Array.isArray(old.eventTypes)) {
    throw new Error('Legacy file is not a valid BabyCalendar state.json');
  }
  const destFolder = path.resolve(appDir, 'data');
  const appStat = await fs.promises.stat(path.resolve(appDir));
  if (!appStat.isDirectory()) throw new Error('Target app directory is invalid');
  await fs.promises.mkdir(destFolder, { mode: 0o700 }).catch(e => { if (e.code !== 'EEXIST') throw e; });
  const folderStat = await fs.promises.lstat(destFolder);
  if (!folderStat.isDirectory() || folderStat.isSymbolicLink()) throw new Error('Refusing symlink data directory');
  const destFile = path.join(destFolder, 'baby-calendar.json');
  const value = { version: 1, revision: Math.max(1, Number.isSafeInteger(old.revision) ? old.revision : 1),
    data: { version: 1, entries: old.entries, eventTypes: old.eventTypes } };
  const tempFile = path.join(destFolder, `.migration-${crypto.randomBytes(8).toString('hex')}.tmp`);
  let handle;
  try {
    handle = await fs.promises.open(tempFile, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(value, null, 2) + '\n', 'utf8');
    await handle.close(); handle = null;
    // 'wx' refuses to overwrite an existing active store.
    await fs.promises.copyFile(tempFile, destFile, fs.constants.COPYFILE_EXCL);
    console.log(`Migrated ${old.entries.length} events and ${old.eventTypes.length} event types to ${destFile}`);
  } finally {
    if (handle) await handle.close();
    await fs.promises.rm(tempFile, { force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
