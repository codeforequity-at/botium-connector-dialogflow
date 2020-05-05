const util = require('util')
const path = require('path')
const slug = require('slug')
const AdmZip = require('adm-zip')
const dialogflow = require('@google-cloud/dialogflow')
const _ = require('lodash')
const botium = require('botium-core')
const debug = require('debug')('botium-connector-dialogflow-intents')

const importIntents = ({ agentInfo, zipEntries, unzip }, argv) => {
  const intentEntries = zipEntries.filter((zipEntry) => zipEntry.entryName.startsWith('intent') && !zipEntry.entryName.match('usersays'))

  const convos = []
  const utterances = []

  intentEntries.forEach((zipEntry) => {
    const intent = JSON.parse(unzip.readAsText(zipEntry.entryName))
    if (intent.parentId) return

    const utterancesEntryName = zipEntry.entryName.replace('.json', '') + '_usersays_' + agentInfo.language + '.json'
    debug(`Found root intent ${intent.name}, checking for utterances in ${utterancesEntryName}`)
    if (!zipEntries.find((zipEntry) => zipEntry.entryName === utterancesEntryName)) {
      debug(`Utterances files not found for ${intent.name}, ignoring intent`)
      return
    }
    const utterancesEntry = JSON.parse(unzip.readAsText(utterancesEntryName))
    const inputUtterances = utterancesEntry.map((utterance) => utterance.data.reduce((accumulator, currentValue) => accumulator + '' + currentValue.text, ''))

    if (argv.buildconvos) {
      const utterancesRef = slug(intent.name)
      utterances.push({
        name: utterancesRef,
        utterances: inputUtterances
      })

      const convo = {
        header: {
          name: intent.name
        },
        conversation: [
          {
            sender: 'me',
            messageText: utterancesRef
          },
          {
            sender: 'bot',
            asserters: [
              {
                name: 'INTENT',
                args: [intent.name]
              }
            ]
          }
        ]
      }
      convos.push(convo)
    } else {
      utterances.push({
        name: intent.name,
        utterances: inputUtterances
      })
    }
  })
  return { convos, utterances }
}

const importConversations = ({ agentInfo, zipEntries, unzip }, argv) => {
  const intentEntries = zipEntries.filter((zipEntry) => zipEntry.entryName.startsWith('intent') && !zipEntry.entryName.match('usersays'))

  const convos = []
  const utterances = []

  const intentsById = {}
  intentEntries.forEach((zipEntry) => {
    const intent = JSON.parse(unzip.readAsText(zipEntry.entryName))

    const utterancesEntry = zipEntry.entryName.replace('.json', '') + '_usersays_' + agentInfo.language + '.json'
    debug(`Found intent ${intent.name}, checking for utterances in ${utterancesEntry}`)
    if (!zipEntries.find((zipEntry) => zipEntry.entryName === utterancesEntry)) {
      debug(`Utterances files not found for ${intent.name}, ignoring intent`)
      return
    }
    intentsById[intent.id] = intent

    const utterances = JSON.parse(unzip.readAsText(utterancesEntry))
    intent.inputUtterances = utterances.map((utterance) => utterance.data.reduce((accumulator, currentValue) => accumulator + '' + currentValue.text, ''))
    debug(`Utterances file for ${intent.name}: ${intent.inputUtterances}`)

    intent.outputUtterances = []
    if (intent.responses) {
      intent.responses.forEach((response) => {
        if (response.messages) {
          const speechOutputs = response.messages
            .filter((message) => message.type === '0' && message.lang === agentInfo.language && message.speech)
            .reduce((acc, message) => {
              if (_.isArray(message.speech)) acc = acc.concat(message.speech)
              else acc.push(message.speech)
              return acc
            }, [])
          if (speechOutputs) {
            intent.outputUtterances.push(speechOutputs)
          } else {
            intent.outputUtterances.push([])
          }
        } else {
          intent.outputUtterances.push([])
        }
      })
    }
  })
  Object.keys(intentsById).forEach((intentId) => {
    const intent = intentsById[intentId]
    debug(intent.name + '/' + intent.parentId)
    if (intent.parentId) {
      const parent = intentsById[intent.parentId]
      if (parent) {
        if (!parent.children) parent.children = []
        parent.children.push(intent)
      } else {
        debug(`Parent intent with id ${intent.parentId} not found for ${intent.name}, ignoring intent`)
      }
    }
  })
  Object.keys(intentsById).forEach((intentId) => {
    const intent = intentsById[intentId]
    if (intent.parentId) {
      delete intentsById[intentId]
    }
  })

  const follow = (intent, currentStack = []) => {
    const cp = currentStack.slice(0)

    const utterancesRef = slug(intent.name + '_input')
    cp.push({ sender: 'me', messageText: utterancesRef, intent: intent.name })

    utterances.push({
      name: utterancesRef,
      utterances: intent.inputUtterances
    })

    if (intent.outputUtterances && intent.outputUtterances.length > 0) {
      for (let stepIndex = 0; stepIndex < intent.outputUtterances.length; stepIndex++) {
        const convoStep = {
          sender: 'bot',
          asserters: [
            {
              name: 'INTENT',
              args: [intent.name]
            }
          ]
        }
        if (intent.outputUtterances[stepIndex] && intent.outputUtterances[stepIndex].length > 0) {
          const utterancesRef = slug(intent.name + '_output_' + stepIndex)
          utterances.push({
            name: utterancesRef,
            utterances: intent.outputUtterances[stepIndex]
          })
          convoStep.messageText = utterancesRef
        }
        cp.push(convoStep)
      }
    } else {
      cp.push({ sender: 'bot', messageText: '!INCOMPREHENSION' })
    }

    if (intent.children) {
      intent.children.forEach((child) => {
        follow(child, cp)
      })
    } else {
      const convo = {
        header: {
          name: cp.filter((m) => m.sender === 'me').map((m) => m.intent).join(' - ')
        },
        conversation: cp
      }
      debug(convo)
      convos.push(convo)
    }
  }
  Object.keys(intentsById).forEach((intentId) => follow(intentsById[intentId], []))

  return { convos, utterances }
}

const loadAgentZip = (filenameOrRawData) => {
  const result = {}
  result.unzip = new AdmZip(filenameOrRawData)
  result.zipEntries = result.unzip.getEntries()
  result.zipEntries.forEach((zipEntry) => {
    debug(`Dialogflow agent got entry: ${zipEntry.entryName}`)
  })
  result.agentInfo = JSON.parse(result.unzip.readAsText('agent.json'))
  debug(`Dialogflow agent info: ${util.inspect(result.agentInfo)}`)
  return result
}

const importDialogflow = async (argv, importFunction) => {
  const caps = argv.caps || {}
  if (argv.agentzip) {
    caps[botium.Capabilities.CONTAINERMODE] = () => ({ UserSays: () => {} })
  } else {
    caps[botium.Capabilities.CONTAINERMODE] = path.resolve(__dirname, '..', 'index.js')
  }
  const botiumContext = {
    driver: new botium.BotDriver(caps),
    compiler: null,
    container: null,
    unzip: null,
    zipEntries: null,
    agentInfo: null
  }

  const result = {
    botiumContext
  }

  botiumContext.container = await botiumContext.driver.Build()
  botiumContext.compiler = await botiumContext.driver.BuildCompiler()

  if (!argv.agentzip) {
    try {
      const agentsClient = new dialogflow.AgentsClient(botiumContext.container.pluginInstance.sessionOpts)
      const projectPath = agentsClient.projectPath(botiumContext.container.caps.DIALOGFLOW_PROJECT_ID)

      const allResponses = await agentsClient.exportAgent({ parent: projectPath })
      const responses = await allResponses[0].promise()
      try {
        const buf = Buffer.from(responses[0].agentContent, 'base64')
        Object.assign(botiumContext, loadAgentZip(buf))
      } catch (err) {
        throw new Error(`Dialogflow agent unpack failed: ${util.inspect(err)}`)
      }
    } catch (err) {
      throw new Error(`Dialogflow agent connection failed: ${util.inspect(err)}`)
    }
  } else {
    try {
      Object.assign(botiumContext, loadAgentZip(argv.agentzip))
    } catch (err) {
      throw new Error(`Dialogflow agent unpack failed: ${util.inspect(err)}`)
    }
  }
  Object.assign(result, importFunction(botiumContext, argv))

  try {
    await botiumContext.container.Clean()
  } catch (err) {
    debug(`Error container cleanup: ${util.inspect(err)}`)
  }
  return result
}

const handler = async (argv) => {
  debug(`command options: ${util.inspect(argv)}`)

  let result = null
  if (argv.buildmultistepconvos) {
    result = await importDialogflow(argv, importConversations)
  } else {
    result = await importDialogflow(argv, importIntents)
  }
  return {
    convos: result.convos,
    utterances: result.utterances
  }
}

module.exports = {
  importHandler: ({ caps, buildconvos, buildmultistepconvos, agentzip, ...rest } = {}) => handler({ caps, buildconvos, buildmultistepconvos, agentzip, ...rest }),
  importArgs: {
    caps: {
      describe: 'Capabilities',
      type: 'json',
      skipCli: true
    },
    buildconvos: {
      describe: 'Build convo files with intent asserters',
      type: 'boolean',
      default: true
    },
    buildmultistepconvos: {
      describe: 'Reverse-engineer Dialogflow agent and build multi-step convo files',
      type: 'boolean',
      default: false
    },
    agentzip: {
      describe: 'Path to the exported Dialogflow agent zip file. If not given, it will be downloaded (with connection settings from botium.json).',
      type: 'string'
    }
  }
}
