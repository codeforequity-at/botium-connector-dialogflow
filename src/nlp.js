const uuidv4 = require('uuid/v4')
const path = require('path')
const randomize = require('randomatic')
const AdmZip = require('adm-zip')
const dialogflow = require('dialogflow')
const botium = require('botium-core')
const debug = require('debug')('botium-connector-dialogflow-nlp')

const { loadAgentZip } = require('./helpers')

const timeout = ms => new Promise(resolve => setTimeout(resolve, ms))

const getCaps = (caps) => {
  const result = Object.assign({}, caps || {})
  result.CONTAINERMODE = path.resolve(__dirname, '..', 'index.js')
  result.DIALOGFLOW_FORCE_INTENT_RESOLUTION = true
  return result
}

const getNLPCaps = (caps) => {
  const result = Object.assign({}, caps || {})
  result.CONTAINERMODE = path.resolve(__dirname, '..', 'index.js')
  result.DIALOGFLOW_FORCE_INTENT_RESOLUTION = true
  result.DIALOGFLOW_PROJECT_ID = caps.DIALOGFLOW_NLP_PROJECT_ID
  result.DIALOGFLOW_CLIENT_EMAIL = caps.DIALOGFLOW_NLP_CLIENT_EMAIL
  result.DIALOGFLOW_PRIVATE_KEY = caps.DIALOGFLOW_NLP_PRIVATE_KEY
  return result
}

const jsonBuffer = (obj) => {
  return Buffer.from(JSON.stringify(obj, null, 2), 'utf-8')
}

const extractIntentUtterances = async ({ caps }) => {
  const driver = new botium.BotDriver(getCaps(caps))
  const container = await driver.Build()

  try {
    const agentsClient = new dialogflow.AgentsClient(container.pluginInstance.sessionOpts)
    const projectPath = agentsClient.projectPath(container.caps.DIALOGFLOW_PROJECT_ID)
    const { unzip, zipEntries, agentInfo } = await loadAgentZip(agentsClient, projectPath)
    debug(`Dialogflow agent: ${JSON.stringify(agentInfo, null, 2)}`)
    // debug(`Dialogflow agent file entries: ${JSON.stringify(zipEntries.map(z => z.entryName), null, 2)}`)

    const languageCodeBotium = container.pluginInstance.caps.DIALOGFLOW_LANGUAGE_CODE.toLowerCase()
    const languageCodeAgent = agentInfo.defaultLanguageCode

    const intents = []

    const intentEntries = zipEntries.filter((zipEntry) => zipEntry.entryName.startsWith('intent') && !zipEntry.entryName.match('usersays'))
    intentEntries.forEach((zipEntry) => {
      const intent = JSON.parse(unzip.readAsText(zipEntry.entryName))
      if (intent.parentId) return
      if (intent.contexts && intent.contexts.length > 0) return

      const utterancesEntryName1 = zipEntry.entryName.replace('.json', '') + '_usersays_' + languageCodeBotium + '.json'
      const utterancesEntryName2 = zipEntry.entryName.replace('.json', '') + '_usersays_' + languageCodeAgent + '.json'

      let utterancesEntryName = null
      if (zipEntries.find((zipEntry) => zipEntry.entryName === utterancesEntryName1)) {
        utterancesEntryName = utterancesEntryName1
      } else if (zipEntries.find((zipEntry) => zipEntry.entryName === utterancesEntryName2)) {
        utterancesEntryName = utterancesEntryName2
      }
      if (!utterancesEntryName) {
        debug(`Utterances files not found for ${intent.name}, checking for utterances in ${utterancesEntryName1} and ${utterancesEntryName2}. Ignoring intent.`)
        return
      }
      const utterancesEntry = JSON.parse(unzip.readAsText(utterancesEntryName))
      const inputUtterances = utterancesEntry.map((utterance) => utterance.data.reduce((accumulator, currentValue) => accumulator + '' + currentValue.text, ''))

      intents.push({
        intentName: intent.name,
        utterances: inputUtterances
      })
    })
    return {
      intents,
      origAgentInfo: agentInfo
    }
  } finally {
    if (container) await container.Clean()
  }
}

const trainIntentUtterances = async ({ caps }, intents, { origAgentInfo }) => {
  const driver = new botium.BotDriver(getCaps(caps))

  if (!driver.caps.DIALOGFLOW_NLP_PROJECT_ID || !driver.caps.DIALOGFLOW_NLP_CLIENT_EMAIL || !driver.caps.DIALOGFLOW_NLP_PRIVATE_KEY) {
    throw new Error('Required to create separate Google Project for Training and set capabilities DIALOGFLOW_NLP_PROJECT_ID + DIALOGFLOW_NLP_CLIENT_EMAIL + DIALOGFLOW_NLP_PRIVATE_KEY')
  }

  const nlpDriver = new botium.BotDriver(getNLPCaps(driver.caps))
  const nlpContainer = await nlpDriver.Build()

  try {
    const agentsClient = new dialogflow.AgentsClient(nlpContainer.pluginInstance.sessionOpts)
    const projectPathNLP = agentsClient.projectPath(nlpContainer.pluginInstance.caps.DIALOGFLOW_NLP_PROJECT_ID)

    const newAgentData = {
      parent: projectPathNLP,
      enableLogging: true
    }
    if (origAgentInfo) {
      Object.assign(newAgentData, {
        displayName: `${origAgentInfo.displayName}-BotiumTrainingCopy-${randomize('Aa0', 5)}`,
        defaultLanguageCode: origAgentInfo.defaultLanguageCode,
        timeZone: origAgentInfo.timeZone,
        matchMode: origAgentInfo.matchMode,
        classificationThreshold: origAgentInfo.classificationThreshold
      })
    } else {
      Object.assign(newAgentData, {
        displayName: `BotiumTrainingCopy-${randomize('Aa0', 5)}`,
        defaultLanguageCode: nlpContainer.pluginInstance.caps.DIALOGFLOW_LANGUAGE_CODE
      })
    }

    const createAgentResponses = await agentsClient.setAgent({ agent: newAgentData })
    const newAgent = createAgentResponses[0]
    debug(`Dialogflow agent created: ${newAgent.parent}/${newAgent.displayName}`)

    const agentZip = new AdmZip()
    agentZip.addFile('package.json', jsonBuffer({
      version: '1.0.0'
    }))
    for (const intent of (intents || [])) {
      agentZip.addFile(`intents/${intent.intentName}.json`, jsonBuffer({
        id: uuidv4(),
        name: intent.intentName
      }))
      agentZip.addFile(`intents/${intent.intentName}_usersays_${newAgent.defaultLanguageCode}.json`, jsonBuffer(
        (intent.utterances || []).map(u => ({
          id: uuidv4(),
          data: [
            {
              text: u
            }
          ]
        }))
      ))
    }
    const agentZipBuffer = agentZip.toBuffer()

    debug(`Dialogflow agent restoring intents: ${newAgent.parent}/${newAgent.displayName}`)
    const restoreResponses = await agentsClient.restoreAgent({ parent: newAgent.parent, agentContent: agentZipBuffer })
    await restoreResponses[0].promise()

    debug(`Dialogflow agent started training: ${newAgent.parent}/${newAgent.displayName}`)
    const trainResponses = await agentsClient.trainAgent({ parent: newAgent.parent })
    await trainResponses[0].promise()

    debug(`Dialogflow agent ready: ${newAgent.parent}/${newAgent.displayName}`)

    const sessionClient = new dialogflow.SessionsClient(nlpContainer.pluginInstance.sessionOpts)
    const sessionPath = sessionClient.sessionPath(nlpContainer.pluginInstance.caps.DIALOGFLOW_NLP_PROJECT_ID, randomize('Aa0', 20))
    const pingRequest = {
      session: sessionPath,
      queryInput: {
        text: {
          text: 'hello',
          languageCode: nlpContainer.pluginInstance.caps.DIALOGFLOW_LANGUAGE_CODE
        }
      }
    }
    while (true) {
      try {
        await sessionClient.detectIntent(pingRequest)
        debug(`Dialogflow agent ${newAgent.parent}/${newAgent.displayName} returned response on pingRequest, continue.`)
        break
      } catch (err) {
        debug(`Dialogflow agent ${newAgent.parent}/${newAgent.displayName} failed on pingRequest, waiting ... (${err.message})`)
        await timeout(2000)
      }
    }

    return {
      caps: Object.assign({}, nlpContainer.pluginInstance.caps),
      origAgentInfo,
      tempAgent: newAgent
    }
  } finally {
    if (nlpContainer) await nlpContainer.Clean()
  }
}

const cleanupIntentUtterances = async ({ caps }, { caps: trainCaps, origAgentInfo, tempAgent }) => {
  const nlpDriver = new botium.BotDriver(getCaps(Object.assign(caps || {}, trainCaps || {})))
  const nlpContainer = await nlpDriver.Build()

  try {
    const agentsClient = new dialogflow.AgentsClient(nlpContainer.pluginInstance.sessionOpts)

    try {
      await agentsClient.deleteAgent({ parent: tempAgent.parent })
      debug(`Dialogflow agent deleted: ${tempAgent.parent}/${tempAgent.displayName}`)
    } catch (err) {
      throw new Error(`Failed to delete Dialogflow agent: ${err.message}`)
    }
  } finally {
    if (nlpContainer) await nlpContainer.Clean()
  }
}

module.exports = {
  extractIntentUtterances,
  trainIntentUtterances,
  cleanupIntentUtterances
}
