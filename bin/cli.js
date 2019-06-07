#!/usr/bin/env node
const yargsCmd = require('yargs')

yargsCmd.usage('Botium Connector Dialogflow CLI\n\nUsage: $0 [options]') // eslint-disable-line
  .help('help').alias('help', 'h')
  .version('version', require('../package.json').version).alias('version', 'V')
  .showHelpOnFail(true)
  .strict(true)
  .demandCommand(1, 'You need at least one command before moving on')
  .command(require('../src/dialogflowintents').args)
  .argv
