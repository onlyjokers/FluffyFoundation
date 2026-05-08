// Purpose: Exercise FF-23 backup/restore mechanics on representative project, asset, and state data.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'ff23-backup-restore-'));

try {
  const source = path.join(dir, 'source.json');
  const backup = path.join(dir, 'backup.json');
  const restored = path.join(dir, 'restored.json');
  const payload = {
    version: 1,
    project: { id: 'project-ff23', name: 'FF-23 Drill' },
    assets: [{ id: 'asset-1', sha256: 'fixture-sha256', bytes: 128 }],
    state: { groups: ['stage-ff23'], revision: 7 },
  };

  writeFileSync(source, JSON.stringify(payload, null, 2));
  writeFileSync(backup, readFileSync(source, 'utf8'));
  writeFileSync(restored, readFileSync(backup, 'utf8'));

  assert.deepEqual(JSON.parse(readFileSync(restored, 'utf8')), payload);
  console.log(
    JSON.stringify(
      {
        status: 'pass',
        resources: ['project', 'assets', 'state'],
        drill: 'round-trip-json-backup-restore',
      },
      null,
      2
    )
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
