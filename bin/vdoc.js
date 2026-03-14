#!/usr/bin/env node
import('../dist/cli.js').catch((err) => {
  console.error('Failed to start vdoc:', err.message);
  process.exit(1);
});
