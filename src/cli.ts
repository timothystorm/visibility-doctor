import { program } from 'commander';
import chalk from 'chalk';
import {
  getConfig,
  getEnvNames,
  getDefaultEnv,
  configPath,
  initConfigIfMissing,
  CONFIG_DIR,
} from './config/store.js';
import { launchTui } from './tui/App.js';
import { runLogin } from './auth/login.js';
import { loadSession, sessionAge } from './auth/session.js';

const VERSION = '0.1.0';

// ─── Banner ───────────────────────────────────────────────────────────────────

function printBanner() {
  console.log(chalk.cyan.bold('\n  👁  visibility-doctor') + chalk.dim(`  v${VERSION}`));
  console.log(chalk.dim('  Full-stack sweep tool for developers and SREs\n'));
}

// ─── First-run notice ─────────────────────────────────────────────────────────

function printFirstRunNotice() {
  console.log(chalk.cyan('  ✦ First run detected!\n'));
  console.log('  A default config has been written to:\n');
  console.log('    ' + chalk.bold(configPath()) + '\n');
  console.log('  Edit that file to set your real URLs, then run ' + chalk.cyan('vdoc') + ' again.');
  console.log('  Or use ' + chalk.cyan('vdoc config add') + ' to be guided through setup.\n');
  console.log(chalk.dim('  Tip: all vdoc state lives in ' + CONFIG_DIR));
  console.log(chalk.dim('  You can commit, diff, or share configs from there.\n'));
}

// ─── Bare run ─────────────────────────────────────────────────────────────────
// When no subcommand is provided, launch the interactive TUI.

async function bareRun() {
  const firstRun = initConfigIfMissing();
  const config = getConfig();

  if (firstRun) {
    printBanner();
    printFirstRunNotice();
    process.exit(0);
  }

  // Detect placeholder URLs left over from default config — treat as unconfigured
  const names = getEnvNames();
  const unconfigured = names.filter(
    (n) => config.envs[n].baseUrl.includes('REPLACE_WITH') || config.envs[n].loginUrl?.includes('REPLACE_WITH'),
  );
  if (unconfigured.length === names.length) {
    printBanner();
    console.log(chalk.yellow('  Config found but no environments have been set up yet.\n'));
    console.log('  Edit ' + chalk.bold(configPath()));
    console.log('  and replace the REPLACE_WITH_* placeholders with your real URLs.\n');
    console.log('  Or run ' + chalk.cyan('vdoc config add') + ' to be guided through it.\n');
    process.exit(0);
  }

  launchTui(config.envs, getDefaultEnv());
}

// ─── CLI program ──────────────────────────────────────────────────────────────

program
  .name('vdoc')
  .version(VERSION)
  .description('Quickly sweep the visibility app stack to surface hotspots')
  .addHelpText(
    'after',
    `
${chalk.dim('Examples:')}
  ${chalk.cyan('vdoc')}                  Launch interactive TUI sweep
  ${chalk.cyan('vdoc sweep')}            Full-stack sweep (non-interactive)
  ${chalk.cyan('vdoc check page')}       Check only the Page routes
  ${chalk.cyan('vdoc login')}            Open browser to refresh your session
  ${chalk.cyan('vdoc config')}           Manage environments and settings
`,
  );

// ─── sweep ────────────────────────────────────────────────────────────────────

program
  .command('sweep')
  .description('Run a full-stack sweep across all layers (non-interactive)')
  .option('-e, --env <name>', 'Environment to sweep (defaults to your default env)')
  .action(async (opts: { env?: string }) => {
    const config = getConfig();
    const envName = opts.env ?? getDefaultEnv();

    if (!envName || !config.envs[envName]) {
      console.error(chalk.red('\n  No environment specified and no default configured.'));
      console.error('  Run ' + chalk.cyan('vdoc config') + ' to set one up.\n');
      process.exit(1);
    }

    launchTui({ [envName]: config.envs[envName] }, envName);
  });

// ─── check ────────────────────────────────────────────────────────────────────

program
  .command('check <layer>')
  .description('Run a single layer check (auth | akamai | ping | page)')
  .option('-e, --env <name>', 'Environment to check')
  .action(async (layer: string, opts: { env?: string }) => {
    const config = getConfig();
    const envName = opts.env ?? getDefaultEnv();

    if (!envName || !config.envs[envName]) {
      console.error(chalk.red('\n  No environment specified and no default configured.'));
      process.exit(1);
    }

    const validLayers = ['auth', 'akamai', 'ping', 'page'];
    if (!validLayers.includes(layer)) {
      console.error(chalk.red(`\n  Unknown layer: ${layer}`));
      console.error('  Valid layers: ' + validLayers.join(', ') + '\n');
      process.exit(1);
    }

    const env = config.envs[envName];
    const session = loadSession(envName);

    printBanner();
    console.log(`  Checking ${chalk.bold(layer)} on ${chalk.cyan(envName)}…\n`);

    const checkMap: Record<string, () => Promise<import('./types.js').CheckResult>> = {
      auth:   () => import('./checks/auth.js').then(m => m.runAuthCheck(env, session)),
      akamai: () => import('./checks/akamai.js').then(m => m.runAkamaiCheck(env, session)),
      ping:   () => import('./checks/ping.js').then(m => m.runPingCheck(env, session)),
      page:   () => import('./checks/page.js').then(m => m.runPageCheck(env, session)),
    };

    const result = await checkMap[layer]();

    const icon = result.status === 'healthy' ? chalk.green('✓')
               : result.status === 'degraded' ? chalk.yellow('△')
               : result.status === 'failing'  ? chalk.red('✗')
               : chalk.gray('–');

    console.log(`  ${icon}  ${result.summary}\n`);
    if (result.detail) console.log(chalk.dim(`     ${result.detail}\n`));
    if (result.nextSteps?.length) {
      console.log(chalk.bold('  Next steps:'));
      result.nextSteps.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
      console.log();
    }
  });

// ─── login ────────────────────────────────────────────────────────────────────

program
  .command('login')
  .description('Open a browser to log in and capture your session cookies')
  .option('-e, --env <name>', 'Environment to log in to')
  .action(async (opts: { env?: string }) => {
    const config = getConfig();
    const envName = opts.env ?? getDefaultEnv();

    if (!envName || !config.envs[envName]) {
      printBanner();
      console.error(chalk.red('  No environment specified and no default configured.'));
      console.error('  Run ' + chalk.cyan('vdoc config') + ' to set one up.\n');
      process.exit(1);
    }

    const env = config.envs[envName];
    printBanner();

    // Show session age if one already exists
    const existing = loadSession(envName);
    if (existing) {
      const { hours, minutes } = sessionAge(existing);
      const ageLabel = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      console.log(
        chalk.dim(`  Existing session found (${ageLabel} old) — refreshing…\n`),
      );
    }

    console.log(`  Logging in to ${chalk.bold(env.name)}  ${chalk.dim(env.baseUrl)}\n`);
    await runLogin(envName, env);
  });

// ─── config ───────────────────────────────────────────────────────────────────

const configCmd = program
  .command('config')
  .description('Manage environments and settings')
  .action(() => {
    printBanner();
    const names = getEnvNames();
    console.log('  Config: ' + chalk.bold(configPath()) + '\n');

    if (names.length === 0) {
      console.log(chalk.yellow('  No environments configured yet.'));
      console.log('  Run ' + chalk.cyan('vdoc config add') + ' to add one.\n');
    } else {
      const config = getConfig();
      const defaultEnv = getDefaultEnv();
      console.log('  Environments:\n');
      for (const name of names) {
        const isDefault = name === defaultEnv;
        const isPlaceholder =
            config.envs[name].baseUrl.includes('REPLACE_WITH') ||
            config.envs[name].loginUrl?.includes('REPLACE_WITH');
        console.log(
          '    ' +
            (isDefault ? chalk.cyan('❯ ') : '  ') +
            chalk.bold(config.envs[name].name) +
            (isPlaceholder ? chalk.red('  ⚠ not configured') : chalk.dim('  ' + config.envs[name].baseUrl)),
        );
      }
      console.log();
    }
  });

configCmd
  .command('list')
  .description('List configured environments')
  .action(() => {
    const names = getEnvNames();
    if (names.length === 0) {
      console.log(chalk.yellow('No environments configured.'));
    } else {
      const config = getConfig();
      names.forEach((n) => console.log(`${n.padEnd(20)} ${config.envs[n].baseUrl}`));
    }
  });

configCmd
  .command('path')
  .description('Show the config file path')
  .action(() => console.log(configPath()));

// ─── Entry ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length === 0) {
  bareRun();
} else {
  program.parseAsync(process.argv);
}
