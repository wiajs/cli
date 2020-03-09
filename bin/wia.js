#!/usr/bin/env node

// Check node version before requiring/doing anything else
// The user may be on a very old node version

const build = require('../lib/build'); // eslint-disable-line

const wiacmd = [
  'init', // 初始化工作空间
  'new', // 创建新的app
  'add', // 添加pge
  'pub', // 发布app
  'info', // 当前环境
  'help', // 帮助
  '-v', // 版本信息
  '--version',
  '-h',
  '--help',
];

// build
if (process.argv.length >= 4
  && (process.argv[2] === 'file'
  || process.argv[2] === '-f')) {
  build(process.argv[3]);
  return;
}

// wia default run build
if (process.argv.length === 2
  || (process.argv.length > 2 && !wiacmd.includes(process.argv[2]))) {
  build();
  return;
} 

const {chalk, semver} = require('@vue/cli-shared-utils')
const requiredVersion = require('../package.json').engines.node;
const leven = require('leven')

function checkNodeVersion(wanted, id) {
  if (!semver.satisfies(process.version, wanted)) {
    console.log(chalk.red(
      'You are using Node ' + process.version + ', but this version of ' + id +
      ' requires Node ' + wanted + '.\nPlease upgrade your Node version.'
    ))
    process.exit(1)
  }
}

checkNodeVersion(requiredVersion, '@wiajs/cli');

if (semver.satisfies(process.version, '9.x')) {
  console.log(
    chalk.red(
      `You are using Node ${process.version}.\n` +
        `Node.js 9.x has already reached end-of-life and will not be supported in future major releases.\n` +
        `It's strongly recommended to use an active LTS version instead.`
    )
  );
}

const fs = require('fs');
const path = require('path');
const slash = require('slash');
const minimist = require('minimist');

// enter debug mode when creating test repo
if (
  slash(process.cwd()).indexOf('/packages/test') > 0 &&
  (fs.existsSync(path.resolve(process.cwd(), '../@wiajs')) ||
    fs.existsSync(path.resolve(process.cwd(), '../../@wiajs')))
) {
  process.env.WIA_CLI_DEBUG = true;
}

const program = require('commander');
const loadCommand = require('../lib/util/loadCommand');

program
  .version(`@wiajs/cli ${require('../package').version}`, '-v, --version')
  .usage('<command> [options]')

program
  .command('init [name]')
  .description('generate a wia workspace from a preset')
  .option('-c, --clone', 'Use git clone when fetching remote preset')
  .option('-r, --registry <url>', 'Use specified npm registry when installing dependencies (only for npm)')
  .option('-f, --force', 'Overwrite target directory if it exists')
  .action((name, cmd) => {
    const opts = cleanArgs(cmd);

    if (minimist(process.argv.slice(3))._.length > 1) {
      console.log(
        chalk.yellow(
          "\n Info: You provided more than one argument. The first one will be used as the preset's name, the rest are ignored."
        )
      );
    }

    require('../lib/init')(name || 'wia', opts);
  });

program
  .command('new <app-name>')
  .description('create a new wia app in wia workspace')
  .option('-g, --git [message]', 'Force git initialization with initial commit message')
  .option('-n, --no-git', 'Skip git initialization')
  .option('-f, --force', 'Overwrite target directory if it exists')
  .option('-c, --clone', 'Use git clone when fetching remote preset')
  .action((name, cmd) => {
    const opts = cleanArgs(cmd);

    if (minimist(process.argv.slice(3))._.length > 1) {
      console.log(
        chalk.yellow(
          "\n Info: You provided more than one argument. The first one will be used as the app's name, the rest are ignored."
        )
      );
    }
    // --git makes commander to default git to true
    if (process.argv.includes('-g') || process.argv.includes('--git')) {
      opts.forceGit = true;
    }
    require('../lib/create')(name, opts);
  });

program
  .command('add <page> [pageOptions]')
  .description('add a new page to the app.')
  .allowUnknownOption()
  .action((page) => {
    require('../lib/add')(page, minimist(process.argv.slice(3)))
  })

program
  .command('pub')
  .description('publish a wia app in production mode with zero config')
  .action(() => {
    require('../lib/pub')()
  })

program
  .command('info')
  .description('print debugging information about your environment')
  .action((cmd) => {
    console.log(chalk.bold('\nEnvironment Info:'))
    require('envinfo').run(
      {
        System: ['OS', 'CPU'],
        Binaries: ['Node', 'Yarn', 'npm'],
        Browsers: ['Chrome', 'Edge', 'Firefox', 'Safari'],
        npmPackages: '/**/{typescript,*vue*,@vue/*/}',
        npmGlobalPackages: ['@wiajs/cli']
      },
      {
        showNotFound: true,
        duplicates: true,
        fullTree: true
      }
    ).then(console.log)
  })

// output help information on unknown commands
program
  .arguments('<command>')
  .action((cmd) => {
    program.outputHelp()
    console.log(`  ` + chalk.red(`Unknown command ${chalk.yellow(cmd)}.`))
    console.log()
    suggestCommands(cmd)
  })
 
// add some useful info on help
program.on('--help', () => {
  console.log();
  console.log(`  Run ${chalk.cyan(`wia <command> -h`)} for detailed usage of given command.`);
  console.log();
});

program.commands.forEach(c => c.on('--help', () => console.log()))

// enhance common error messages
const enhanceErrorMessages = require('../lib/util/enhanceErrorMessages')

enhanceErrorMessages('missingArgument', argName => {
  return `Missing required argument ${chalk.yellow(`<${argName}>`)}.`
})

enhanceErrorMessages('unknownOption', optionName => {
  return `Unknown option ${chalk.yellow(optionName)}.`
})

enhanceErrorMessages('optionMissingArgument', (option, flag) => {
  return `Missing required argument for option ${chalk.yellow(option.flags)}` + (
    flag ? `, got ${chalk.yellow(flag)}` : ``
  )
})

program.parse(process.argv)

if (!process.argv.slice(2).length) {
  program.outputHelp()
}

function suggestCommands (unknownCommand) {
  const availableCommands = program.commands.map(cmd => cmd._name)

  let suggestion

  availableCommands.forEach(cmd => {
    const isBestMatch = leven(cmd, unknownCommand) < leven(suggestion || '', unknownCommand)
    if (leven(cmd, unknownCommand) < 3 && isBestMatch) {
      suggestion = cmd
    }
  })

  if (suggestion) {
    console.log(`  ` + chalk.red(`Did you mean ${chalk.yellow(suggestion)}?`))
  }
}

function camelize(str) {
  return str.replace(/-(\w)/g, (_, c) => c ? c.toUpperCase() : '')
}

// commander passes the Command object itself as options,
// extract only actual options into a fresh object.
function cleanArgs(cmd) {
  const args = {}
  cmd.options.forEach(o => {
    const key = camelize(o.long.replace(/^--/, ''))
    // if an option is not present and Command has a method with the same name
    // it should not be copied
    if (typeof cmd[key] !== 'function' && typeof cmd[key] !== 'undefined') {
      args[key] = cmd[key]
    }
  })
  return args
}
