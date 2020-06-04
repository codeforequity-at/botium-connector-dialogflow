#!/usr/bin/env node
const yargsCmd = require('yargs')
const slug = require('slug')
const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const { BotDriver } = require('botium-core')

const { importHandler, importArgs } = require('../src/dialogflowintents')
const { exportHandler, exportArgs } = require('../src/dialogflowintents')

const writeConvo = (compiler, convo, outputDir) => {
  const filename = path.resolve(outputDir, slug(convo.header.name) + '.convo.txt')

  mkdirp.sync(outputDir)

  const scriptData = compiler.Decompile([convo], 'SCRIPTING_FORMAT_TXT')

  fs.writeFileSync(filename, scriptData)
  return filename
}

const writeUtterances = (compiler, utterance, samples, outputDir) => {
  const filename = path.resolve(outputDir, slug(utterance) + '.utterances.txt')

  mkdirp.sync(outputDir)

  const scriptData = [utterance, ...samples].join('\n')

  fs.writeFileSync(filename, scriptData)
  return filename
}

yargsCmd.usage('Botium Connector Dialogflow CLI\n\nUsage: $0 [options]') // eslint-disable-line
  .help('help').alias('help', 'h')
  .version('version', require('../package.json').version).alias('version', 'V')
  .showHelpOnFail(true)
  .strict(true)
  .command({
    command: 'import',
    describe: 'Importing Convos and Utterances from Dialogflow to Botium',
    builder: (yargs) => {
      for (const arg of Object.keys(importArgs)) {
        if (importArgs[arg].skipCli) continue
        yargs.option(arg, importArgs[arg])
      }
      yargs.option('output', {
        describe: 'Output directory',
        type: 'string',
        default: '.'
      })
    },
    handler: async (argv) => {
      const outputDir = argv.output

      let convos = []
      let utterances = []
      try {
        ({ convos, utterances } = await importHandler(argv))
      } catch (err) {
        console.log(`FAILED: ${err.message}`)
        return
      }

      const driver = new BotDriver()
      const compiler = await driver.BuildCompiler()

      for (const convo of convos) {
        try {
          const filename = writeConvo(compiler, convo, outputDir)
          console.log(`SUCCESS: wrote convo to file ${filename}`)
        } catch (err) {
          console.log(`WARNING: writing convo "${convo.header.name}" failed: ${err.message}`)
        }
      }
      for (const utterance of utterances) {
        try {
          const filename = writeUtterances(compiler, utterance.name, utterance.utterances, outputDir)
          console.log(`SUCCESS: wrote utterances to file ${filename}`)
        } catch (err) {
          console.log(`WARNING: writing utterances "${utterance.name}" failed: ${err.message}`)
        }
      }
    }
  })
  .command({
    command: 'export',
    describe: 'Uploading Utterances from Botium to Dialogflow',
    builder: (yargs) => {
      for (const arg of Object.keys(exportArgs)) {
        if (exportArgs[arg].skipCli) continue
        yargs.option(arg, exportArgs[arg])
      }
      yargs.option('input', {
        describe: 'Input directory',
        type: 'string',
        default: '.'
      })
    },
    handler: async (argv) => {
      const inputDir = argv.input

      const driver = new BotDriver()
      const compiler = driver.BuildCompiler()
      compiler.ReadScriptsFromDirectory(inputDir)

      const convos = []
      const utterances = Object.keys(compiler.utterances).reduce((acc, u) => acc.concat([compiler.utterances[u]]), [])

      try {
        const result = await exportHandler(argv, { convos, utterances }, { statusCallback: (log, obj) => console.log(log, obj) })
        console.log(JSON.stringify(result, null, 2))
      } catch (err) {
        console.log(`FAILED: ${err.message}`)
      }
    }
  })
  .argv
