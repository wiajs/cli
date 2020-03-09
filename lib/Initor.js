const path = require('path')
const chalk = require('chalk')
const debug = require('debug')('Initor')
const execa = require('execa')
const inquirer = require('inquirer')
const semver = require('semver')
const EventEmitter = require('events')
const Generator = require('./Generator')
const cloneDeep = require('lodash.clonedeep')
const sortObject = require('./util/sortObject')
const getVersions = require('./util/getVersions')
const PackageManager = require('./util/ProjectPackageManager')
const { clearConsole } = require('./util/clearConsole')
const PromptModuleAPI = require('./PromptModuleAPI')
const writeFileTree = require('./util/writeFileTree')
const {copyPreset} = require('./util/copyPreset')
const loadLocalPreset = require('./util/loadLocalPreset')
const loadRemotePreset = require('./util/loadRemotePreset')
const generateReadme = require('./util/generateReadme')

const {
  defaults,
  saveOptions,
  loadOptions,
  savePreset,
  validatePreset
} = require('./options')

const {
  log,
  warn,
  error,
  hasGit,
  hasProjectGit,
  hasYarn,
  hasPnpm3OrLater,
  logWithSpinner,
  stopSpinner,
  exit,
  loadModule
} = require('@vue/cli-shared-utils')

const isManualMode = answers => answers.preset === '__manual__'

module.exports = class Initor extends EventEmitter {
  constructor (name, context, promptModules) {
    super()

    this.name = name
    this.context = process.env.WIA_CLI_CONTEXT = context
    const { presetPrompt, featurePrompt } = this.resolveIntroPrompts()
    this.presetPrompt = presetPrompt
    this.featurePrompt = featurePrompt
    this.outroPrompts = this.resolveOutroPrompts()
    this.injectedPrompts = []
    this.promptCompleteCbs = []
    this.createCompleteCbs = []

    this.run = this.run.bind(this)

    const promptAPI = new PromptModuleAPI(this)
    promptModules.forEach(m => m(promptAPI))
  }

  async init (cliOptions = {}, preset = null) {
    const isTestOrDebug = process.env.WIA_CLI_TEST || process.env.WIA_CLI_DEBUG
    const { run, name, context, createCompleteCbs } = this
    
    await clearConsole()
    logWithSpinner(``, `1.Init workspace in ${chalk.yellow(context)}.`)
    this.emit('init', { event: 'initing' })

    await copyPreset(context);    
    stopSpinner()

    // install additional deps (injected by generators)
    log(`  2.Installing dependencies.This might take a while...`)
    this.emit('inition', { event: 'deps-install' })
    log()
    if (!isTestOrDebug) {
      const pm = new PackageManager({ context, forcePackageManager: 'npm' });
      await pm.install()
    }

    // run complete cbs if any (injected by generators)
    logWithSpinner('', `Running completion hooks...`)
    this.emit('inition', { event: 'completion-hooks' })
    for (const cb of createCompleteCbs) {
      await cb()
    }

    // log instructions
    stopSpinner()
    log()
    log(`  3.Successfully created workspace ${chalk.yellow(name)}.`)
    if (!cliOptions.skipGetStarted) {
      log(
        `Get started with the following commands:\n\n` +
        (this.context === process.cwd() ? `` : chalk.cyan(` ${chalk.gray('$')} cd ${name}\n`)) +
        chalk.cyan(` ${chalk.gray('$')} wia new appname`)
      )
    }
    log()
    this.emit('inition', { event: 'done' })
  }

  run (command, args) {
    if (!args) { [command, ...args] = command.split(/\s+/) }
    return execa(command, args, { cwd: this.context })
  }

  async promptAndResolvePreset (answers = null) {
    // prompt
    if (!answers) {
      await clearConsole(true)
      answers = await inquirer.prompt(this.resolveFinalPrompts())
    }
    debug.extend('answers')(answers)

    // if (answers.packageManager) {
    //   saveOptions({
    //     packageManager: answers.packageManager
    //   })
    // }

    let preset = await this.resolvePreset(answers.preset)

    // validate
    // validatePreset(preset)

    debug.extend('preset')(preset)
    return preset
  }

  async resolvePreset (name, clone) {
    let preset
    const savedPresets = loadOptions().presets || {}

    if (name in savedPresets) {
      preset = savedPresets[name]
    } else if (name.endsWith('.json') || /^\./.test(name) || path.isAbsolute(name)) {
      preset = await loadLocalPreset(path.resolve(name))
    } else if (name.includes('/')) {
      logWithSpinner(`Fetching remote preset ${chalk.cyan(name)}...`)
      this.emit('creation', { event: 'fetch-remote-preset' })
      try {
        preset = await loadRemotePreset(name, clone)
        stopSpinner()
      } catch (e) {
        stopSpinner()
        error(`Failed fetching remote preset ${chalk.cyan(name)}:`)
        throw e
      }
    }

    // use default preset if user has not overwritten it
    if (name === 'default' && !preset) {
      preset = defaults.presets.default
    }
    if (!preset) {
      error(`preset "${name}" not found.`)
      const presets = Object.keys(savedPresets)
      if (presets.length) {
        log()
        log(`available presets:\n${presets.join(`\n`)}`)
      } else {
        log(`you don't seem to have any saved preset.`)
        log(`run vue-cli in manual mode to create a preset.`)
      }
      exit(1)
    }
    return preset
  }

  // { id: options } => [{ id, apply, options }]
  async resolvePlugins (rawPlugins) {
    // ensure cli-service is invoked first
    rawPlugins = sortObject(rawPlugins, ['@vue/cli-service'], true)
    const plugins = []
    for (const id of Object.keys(rawPlugins)) {
      const apply = loadModule(`${id}/generator`, this.context) || (() => {})
      let options = rawPlugins[id] || {}
      if (options.prompts) {
        const prompts = loadModule(`${id}/prompts`, this.context)
        if (prompts) {
          log()
          log(`${chalk.cyan(options._isPreset ? `Preset options:` : id)}`)
          options = await inquirer.prompt(prompts)
        }
      }
      plugins.push({ id, apply, options })
    }
    return plugins
  }

  getPresets () {
    const savedOptions = loadOptions()
    // return Object.assign({}, savedOptions.presets, defaults.presets)
    return savedOptions.presets;
  }

  resolveIntroPrompts () {
    const presets = this.getPresets()
    const presetChoices = Object.keys(presets).map(name => {
      return {
        name: `${name} (${presets[name].desc})`,
        value: name
      }
    })
    const presetPrompt = {
      name: 'preset',
      type: 'list',
      message: `Please pick a UI mode:`,
      choices: [
        ...presetChoices,
      ]
    }
    const featurePrompt = {
      name: 'features',
      when: isManualMode,
      type: 'checkbox',
      message: 'Check the features needed for your project:',
      choices: [],
      pageSize: 10
    }
    return {
      presetPrompt,
      featurePrompt
    }
  }

  resolveOutroPrompts () {
    const outroPrompts = [
      {
        name: 'useConfigFiles',
        when: isManualMode,
        type: 'list',
        message: 'Where do you prefer placing config for Babel, PostCSS, ESLint, etc.?',
        choices: [
          {
            name: 'In dedicated config files',
            value: 'files'
          },
          {
            name: 'In package.json',
            value: 'pkg'
          }
        ]
      },
      {
        name: 'save',
        when: isManualMode,
        type: 'confirm',
        message: 'Save this as a preset for future projects?',
        default: false
      },
      {
        name: 'saveName',
        when: answers => answers.save,
        type: 'input',
        message: 'Save preset as:'
      }
    ]

    // ask for packageManager once
    const savedOptions = loadOptions()
    if (!savedOptions.packageManager && (hasYarn() || hasPnpm3OrLater())) {
      const packageManagerChoices = []

      if (hasYarn()) {
        packageManagerChoices.push({
          name: 'Use Yarn',
          value: 'yarn',
          short: 'Yarn'
        })
      }

      if (hasPnpm3OrLater()) {
        packageManagerChoices.push({
          name: 'Use PNPM',
          value: 'pnpm',
          short: 'PNPM'
        })
      }

      packageManagerChoices.push({
        name: 'Use NPM',
        value: 'npm',
        short: 'NPM'
      })

      outroPrompts.push({
        name: 'packageManager',
        type: 'list',
        message: 'Pick the package manager to use when installing dependencies:',
        choices: packageManagerChoices
      })
    }

    return outroPrompts
  }

  resolveFinalPrompts () {
    // patch generator-injected prompts to only show in manual mode
    this.injectedPrompts.forEach(prompt => {
      const originalWhen = prompt.when || (() => true)
      prompt.when = answers => {
        return isManualMode(answers) && originalWhen(answers)
      }
    })
    const prompts = [
      this.presetPrompt
      // this.featurePrompt,
      // ...this.injectedPrompts,
      // ...this.outroPrompts
    ]
    debug.extend('prompts')(prompts)
    return prompts
  }

  shouldInitGit (cliOptions) {
    if (!hasGit()) {
      return false
    }
    // --git
    if (cliOptions.forceGit) {
      return true
    }
    // --no-git
    if (cliOptions.git === false || cliOptions.git === 'false') {
      return false
    }
    // default: true unless already in a git repo
    return !hasProjectGit(this.context)
  }
}
