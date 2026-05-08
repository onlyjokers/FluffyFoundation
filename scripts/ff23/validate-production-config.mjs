// Purpose: Validate FF-23 production configuration gates before release.
import assert from 'node:assert/strict';
import process from 'node:process';

const required = [
  ['NODE_ENV', (value) => value === 'production'],
  ['SHUGU_MANAGER_KEY', (value) => value.length >= 12],
  ['SHUGU_CORS_ORIGINS', (value) => value.length > 0 && !value.split(',').map((item) => item.trim()).includes('*')],
  ['SHUGU_HAS_HTTPS', (value) => value === '1'],
  ['ASSET_WRITE_TOKEN', (value) => value.length >= 12],
];

const failures = [];
for (const [key, predicate] of required) {
  const value = process.env[key] ?? '';
  if (!predicate(value)) failures.push(key);
}

if (['1', 'true', 'yes', 'on'].includes((process.env.SHUGU_ALLOW_INSECURE_MANAGER ?? '').toLowerCase())) {
  failures.push('SHUGU_ALLOW_INSECURE_MANAGER');
}

assert.deepEqual(failures, []);

console.log(
  JSON.stringify(
    {
      status: 'pass',
      checked: required.map(([key]) => key).concat('SHUGU_ALLOW_INSECURE_MANAGER'),
    },
    null,
    2
  )
);
