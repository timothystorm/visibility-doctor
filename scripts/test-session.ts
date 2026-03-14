// Quick session roundtrip smoke test — run with: npx tsx scripts/test-session.ts
import { saveSession, loadSession, sessionAge, clearSession } from '../src/auth/session.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const cookies = [
  { name: 'ssoToken', value: 'abc123secret', domain: 'example.com', path: '/', httpOnly: true, secure: true },
  { name: 'sessionId', value: 'xyz789', domain: 'example.com', path: '/' },
];

saveSession('test-env', cookies);
console.log('✓ Saved');

const file = join(homedir(), '.config', 'vis-doc', 'sessions', 'test-env.json');
const raw = existsSync(file) ? readFileSync(file, 'utf8') : 'MISSING';
const isEncrypted = !raw.startsWith('{') && !raw.startsWith('[');
console.log(`  Encrypted (not plain JSON): ${isEncrypted}   preview: ${raw.slice(0, 40)}…`);

const loaded = loadSession('test-env');
console.log(`✓ Loaded: ${loaded?.cookies.length} cookies`);
console.log(`  cookies[0].name = ${loaded?.cookies[0]?.name}`);
console.log(`  cookies[0].value = ${loaded?.cookies[0]?.value}`);
console.log(`  cookies[1].name = ${loaded?.cookies[1]?.name}`);

const age = sessionAge(loaded!);
console.log(`  Age: ${age.hours}h ${age.minutes}m`);

clearSession('test-env');
console.log(`✓ Cleared. Gone: ${loadSession('test-env') === null}`);
