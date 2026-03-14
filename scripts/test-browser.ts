import { findSystemChrome, chromeProfileDir, findFreePort } from '../src/auth/browser.js';
console.log('Chrome found:', findSystemChrome() ?? 'NOT FOUND');
console.log('Profile dir:', chromeProfileDir('prod'));
const port = await findFreePort();
console.log('Free port found:', port, typeof port === 'number' && port > 1024 ? '✓' : '✗');
