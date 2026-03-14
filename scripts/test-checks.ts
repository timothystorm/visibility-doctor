import { readConfig } from '../src/config/store.js';
import { loadSession } from '../src/auth/session.js';
import { runAkamaiCheck } from '../src/checks/akamai.js';
import { runPingCheck } from '../src/checks/ping.js';
import { runPageCheck } from '../src/checks/page.js';

const config = readConfig();
const envName = config.defaultEnv ?? Object.keys(config.envs)[0];
const env = config.envs[envName];
if (!env) { console.error('No env configured.'); process.exit(1); }

const session = loadSession(envName);
console.log(`\n  Env: ${env.name}  (${envName})`);
console.log(`  URL: ${env.baseUrl}`);
console.log(`  Session: ${session ? `${session.cookies.length} cookies` : 'none'}\n`);

async function run(name: string, fn: () => ReturnType<typeof runAkamaiCheck>) {
  process.stdout.write(`Running ${name}…`);
  const r = await fn();
  process.stdout.write(`\r  ${r.status.toUpperCase().padEnd(10)} ${r.summary}\n`);
  if (r.detail) console.log(`             ${r.detail}`);
}

await run('Akamai', () => runAkamaiCheck(env, session));
await run('Ping   ', () => runPingCheck(env, session));
await run('Page   ', () => runPageCheck(env, session));
console.log();
