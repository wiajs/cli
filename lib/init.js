const fs = require('fs-extra')
const path = require('path')
const chalk = require('chalk')
const inquirer = require('inquirer')
const Initor = require('./Initor')
const { clearConsole } = require('./util/clearConsole')
const { getPromptModules } = require('./util/createTools')
const { error, stopSpinner, exit } = require('@vue/cli-shared-utils')
const validateProjectName = require('validate-npm-package-name')

async function init (name, options) {
  if (options.proxy) {
    process.env.HTTP_PROXY = options.proxy
  }

  const cwd = options.cwd || process.cwd()
  const inCurrent = name === '.'
  const targetDir = path.resolve(cwd, name || '.')
  name = inCurrent ? path.relative('../', cwd) : name

  const result = validateProjectName(name)
  if (!result.validForNewPackages) {
    console.error(chalk.red(`Invalid workspace name: "${name}"`))
    result.errors && result.errors.forEach(err => {
      console.error(chalk.red.dim('Error: ' + err))
    })
    result.warnings && result.warnings.forEach(warn => {
      console.error(chalk.red.dim('Warning: ' + warn))
    })
    exit(1)
  }

  if (fs.existsSync(targetDir)) {
    await clearConsole()
    if (inCurrent) {
      const { ok } = await inquirer.prompt([
        {
          name: 'ok',
          type: 'confirm',
          message: `Generate wia workspace in current directory?`
        }
      ])
      if (!ok) {
        return
      }
    } else {
      const { action } = await inquirer.prompt([
        {
          name: 'action',
          type: 'list',
          message: `Target directory ${chalk.cyan(targetDir)} already exists.\n Pick an action:`,
          choices: [
            { name: 'Overwrite', value: 'overwrite' },
            { name: 'Merge', value: 'merge' },
            { name: 'Cancel', value: false }
          ]
        }
      ])
      if (!action) {
        return
      } else if (action === 'overwrite') {
        console.log(`\nRemoving ${chalk.cyan(targetDir)}...`)
        await fs.remove(targetDir)
      }
    }
  } else
    fs.ensureDirSync(targetDir)

  const initor = new Initor(name, targetDir, getPromptModules())
  // await initor.init(options, 'Dom')
  await initor.init(options)
}

module.exports = (...args) => {
  return init(...args).catch(err => {
    stopSpinner(false) // do not persist
    error(err)
    if (!process.env.WIA_CLI_TEST) {
      process.exit(1)
    }
  })
}
