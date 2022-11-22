const util = require('util')
const { v1: uuidV1 } = require('uuid')
const mime = require('mime-types')
const dialogflow = require('@google-cloud/dialogflow')
const _ = require('lodash')
const debug = require('debug')('botium-connector-dialogflow')

const { struct } = require('./structJson')
const { importHandler, importArgs } = require('./src/dialogflowintents')
const { exportHandler, exportArgs } = require('./src/dialogflowintents')
const { extractIntentUtterances, trainIntentUtterances, cleanupIntentUtterances } = require('./src/nlp')

const Capabilities = {
  DIALOGFLOW_PROJECT_ID: 'DIALOGFLOW_PROJECT_ID',
  DIALOGFLOW_ENVIRONMENT: 'DIALOGFLOW_ENVIRONMENT',
  DIALOGFLOW_CLIENT_EMAIL: 'DIALOGFLOW_CLIENT_EMAIL',
  DIALOGFLOW_PRIVATE_KEY: 'DIALOGFLOW_PRIVATE_KEY',
  DIALOGFLOW_LANGUAGE_CODE: 'DIALOGFLOW_LANGUAGE_CODE',
  DIALOGFLOW_QUERY_PARAMS: 'DIALOGFLOW_QUERY_PARAMS',
  DIALOGFLOW_INPUT_CONTEXT_NAME: 'DIALOGFLOW_INPUT_CONTEXT_NAME',
  DIALOGFLOW_INPUT_CONTEXT_LIFESPAN: 'DIALOGFLOW_INPUT_CONTEXT_LIFESPAN',
  DIALOGFLOW_INPUT_CONTEXT_PARAMETERS: 'DIALOGFLOW_INPUT_CONTEXT_PARAMETERS',
  DIALOGFLOW_OUTPUT_PLATFORM: 'DIALOGFLOW_OUTPUT_PLATFORM',
  DIALOGFLOW_FORCE_INTENT_RESOLUTION: 'DIALOGFLOW_FORCE_INTENT_RESOLUTION',
  DIALOGFLOW_BUTTON_EVENTS: 'DIALOGFLOW_BUTTON_EVENTS',
  DIALOGFLOW_ENABLE_KNOWLEDGEBASE: 'DIALOGFLOW_ENABLE_KNOWLEDGEBASE',
  DIALOGFLOW_FALLBACK_INTENTS: 'DIALOGFLOW_FALLBACK_INTENTS',
  DIALOGFLOW_AUDIOINPUT_ENCODING: 'DIALOGFLOW_AUDIOINPUT_ENCODING',
  DIALOGFLOW_AUDIOINPUT_SAMPLERATEHERTZ: 'DIALOGFLOW_AUDIOINPUT_SAMPLERATEHERTZ',
  DIALOGFLOW_API_ENDPOINT: 'DIALOGFLOW_API_ENDPOINT'
}

const Defaults = {
  [Capabilities.DIALOGFLOW_LANGUAGE_CODE]: 'en',
  [Capabilities.DIALOGFLOW_FORCE_INTENT_RESOLUTION]: true,
  [Capabilities.DIALOGFLOW_BUTTON_EVENTS]: true,
  [Capabilities.DIALOGFLOW_ENABLE_KNOWLEDGEBASE]: false,
  [Capabilities.DIALOGFLOW_FALLBACK_INTENTS]: ['Default Fallback Intent']
}

class BotiumConnectorDialogflow {
  constructor ({ queueBotSays, caps }) {
    this.queueBotSays = queueBotSays
    this.caps = caps
  }

  async Validate () {
    debug('Validate called')
    this.caps = Object.assign({}, Defaults, this.caps)

    if (!this.caps[Capabilities.DIALOGFLOW_PROJECT_ID]) throw new Error('DIALOGFLOW_PROJECT_ID capability required')
    if (!!this.caps[Capabilities.DIALOGFLOW_CLIENT_EMAIL] !== !!this.caps[Capabilities.DIALOGFLOW_PRIVATE_KEY]) throw new Error('DIALOGFLOW_CLIENT_EMAIL and DIALOGFLOW_PRIVATE_KEY capabilities both or none required')

    if (!_.isArray(this.caps[Capabilities.DIALOGFLOW_ENABLE_KNOWLEDGEBASE]) && !_.isBoolean(this.caps[Capabilities.DIALOGFLOW_ENABLE_KNOWLEDGEBASE] && !_.isString(this.caps[Capabilities.DIALOGFLOW_ENABLE_KNOWLEDGEBASE]))) throw new Error('DIALOGFLOW_ENABLE_KNOWLEDGEBASE capability has to be an array of knowledge base identifiers, or a boolean')
    if (_.isString(this.caps[Capabilities.DIALOGFLOW_ENABLE_KNOWLEDGEBASE])) {
      this.caps[Capabilities.DIALOGFLOW_ENABLE_KNOWLEDGEBASE] = this.caps[Capabilities.DIALOGFLOW_ENABLE_KNOWLEDGEBASE] === 'true'
    }

    const contextSuffixes = this._getContextSuffixes()
    contextSuffixes.forEach((contextSuffix) => {
      if (!this.caps[Capabilities.DIALOGFLOW_INPUT_CONTEXT_NAME + contextSuffix] || !this.caps[Capabilities.DIALOGFLOW_INPUT_CONTEXT_LIFESPAN + contextSuffix]) {
        throw new Error(`DIALOGFLOW_INPUT_CONTEXT_NAME${contextSuffix} and DIALOGFLOW_INPUT_CONTEXT_LIFESPAN${contextSuffix} capability required`)
      }
    })
  }

  async Build () {
    debug('Build called')

    this.sessionOpts = {
      fallback: true
    }

    if (this.caps[Capabilities.DIALOGFLOW_CLIENT_EMAIL] && this.caps[Capabilities.DIALOGFLOW_PRIVATE_KEY]) {
      this.sessionOpts.credentials = {
        client_email: this.caps[Capabilities.DIALOGFLOW_CLIENT_EMAIL],
        private_key: this.caps[Capabilities.DIALOGFLOW_PRIVATE_KEY]
      }
    }

    if (this.caps[Capabilities.DIALOGFLOW_API_ENDPOINT]) {
      this.sessionOpts.apiEndpoint = this.caps[Capabilities.DIALOGFLOW_API_ENDPOINT]
    }
  }

  async Start () {
    debug('Start called')

    this.conversationId = uuidV1()
    this.queryParams = {}

    if (this.caps[Capabilities.DIALOGFLOW_QUERY_PARAMS]) {
      if (_.isString(this.caps[Capabilities.DIALOGFLOW_QUERY_PARAMS])) {
        Object.assign(this.queryParams, JSON.parse(this.caps[Capabilities.DIALOGFLOW_QUERY_PARAMS]))
      } else {
        Object.assign(this.queryParams, this.caps[Capabilities.DIALOGFLOW_QUERY_PARAMS])
      }
    }
    if (_.isBoolean(this.caps[Capabilities.DIALOGFLOW_ENABLE_KNOWLEDGEBASE]) && this.caps[Capabilities.DIALOGFLOW_ENABLE_KNOWLEDGEBASE]) {
      this.kbClient = new dialogflow.v2beta1.KnowledgeBasesClient(Object.assign({}, this.sessionOpts, {
        projectPath: this.caps[Capabilities.DIALOGFLOW_PROJECT_ID]
      }))
      const formattedParent = this.kbClient.projectPath(this.caps[Capabilities.DIALOGFLOW_PROJECT_ID])
      const [resources] = await this.kbClient.listKnowledgeBases({
        parent: formattedParent
      })
      this.kbNames = resources && resources.map(r => r.name)
    } else if (_.isArray(this.caps[Capabilities.DIALOGFLOW_ENABLE_KNOWLEDGEBASE])) {
      this.kbNames = this.caps[Capabilities.DIALOGFLOW_ENABLE_KNOWLEDGEBASE]
    }

    let useBeta = false
    if (this.kbNames && this.kbNames.length > 0) {
      debug(`Using Dialogflow Knowledge Bases ${util.inspect(this.kbNames)}, switching to v2beta1 version of Dialogflow API`)
      this.queryParams.knowledgeBaseNames = this.kbNames
      useBeta = true
    } else if (this.caps[Capabilities.DIALOGFLOW_API_ENDPOINT]) {
      debug('Using custom api endpoint (for localized dialogflow), switching to v2beta1 version of Dialogflow API')
      useBeta = true
    }
    if (useBeta) {
      this.sessionClient = new dialogflow.v2beta1.SessionsClient(this.sessionOpts)
    } else {
      this.sessionClient = new dialogflow.SessionsClient(this.sessionOpts)
    }

    if (this.caps[Capabilities.DIALOGFLOW_ENVIRONMENT]) {
      this.sessionPath = this.sessionClient.projectAgentEnvironmentUserSessionPath(this.caps[Capabilities.DIALOGFLOW_PROJECT_ID], this.caps[Capabilities.DIALOGFLOW_ENVIRONMENT], '-', this.conversationId)
    } else {
      this.sessionPath = this.sessionClient.projectAgentSessionPath(this.caps[Capabilities.DIALOGFLOW_PROJECT_ID], this.conversationId)
    }

    debug(`Using Dialogflow SessionPath: ${this.sessionPath}`)
    this.contextClient = new dialogflow.ContextsClient(this.sessionOpts)
    this.queryParams.contexts = this._getContextSuffixes().map((c) => this._createInitialContext(c))
  }

  UserSays (msg) {
    debug('UserSays called')
    if (!this.sessionClient) return Promise.reject(new Error('not built'))

    const request = {
      session: this.sessionPath,
      queryInput: {
      }
    }
    if (this.caps[Capabilities.DIALOGFLOW_BUTTON_EVENTS] && msg.buttons && msg.buttons.length > 0 && (msg.buttons[0].text || msg.buttons[0].payload)) {
      let payload = msg.buttons[0].payload || msg.buttons[0].text
      try {
        payload = JSON.parse(payload)
        request.queryInput.event = Object.assign({}, { languageCode: this.caps[Capabilities.DIALOGFLOW_LANGUAGE_CODE] }, payload)
        if (request.queryInput.event.parameters) {
          request.queryInput.event.parameters = struct.encode(request.queryInput.event.parameters)
        }
      } catch (err) {
        request.queryInput.event = {
          name: payload,
          languageCode: this.caps[Capabilities.DIALOGFLOW_LANGUAGE_CODE]
        }
      }
    } else if (msg.media && msg.media.length > 0) {
      const media = msg.media[0]
      if (!media.buffer) {
        return Promise.reject(new Error(`Media attachment ${media.mediaUri} not downloaded`))
      }
      if (!media.mimeType || !media.mimeType.startsWith('audio')) {
        return Promise.reject(new Error(`Media attachment ${media.mediaUri} mime type ${media.mimeType || '<empty>'} not supported (audio only)`))
      }
      request.queryInput.audioConfig = {
        audioEncoding: this.caps[Capabilities.DIALOGFLOW_AUDIOINPUT_ENCODING],
        sampleRateHertz: this.caps[Capabilities.DIALOGFLOW_AUDIOINPUT_SAMPLERATEHERTZ],
        languageCode: this.caps[Capabilities.DIALOGFLOW_LANGUAGE_CODE],
        audioChannelCount: this.caps[Capabilities.DIALOGFLOW_AUDIOINPUT_CHANNELS],
        enableSeparateRecognitionPerChannel: this.caps[Capabilities.DIALOGFLOW_AUDIOINPUT_RECOGNITION_PER_CHANNEL]
      }
      request.inputAudio = media.buffer

      if (!msg.attachments) {
        msg.attachments = []
      }
      msg.attachments.push({
        name: media.mediaUri,
        mimeType: media.mimeType,
        base64: media.buffer.toString('base64')
      })
    } else {
      request.queryInput.text = {
        text: msg.messageText,
        languageCode: this.caps[Capabilities.DIALOGFLOW_LANGUAGE_CODE]
      }
    }

    const customContexts = this._extractCustomContexts(msg)
    // this.queryParams.contexts may contain a value just the first time.
    customContexts.forEach(customContext => {
      const index = this.queryParams.contexts.findIndex(c => c.name === customContext.name)
      if (index >= 0) {
        this.queryParams.contexts[index] = customContext
      } else {
        this.queryParams.contexts.push(customContext)
      }
    })

    const mergeQueryParams = {}
    if (msg.SET_DIALOGFLOW_QUERYPARAMS) {
      Object.assign(mergeQueryParams, msg.SET_DIALOGFLOW_QUERYPARAMS)
    }

    request.queryParams = Object.assign({}, this.queryParams, mergeQueryParams)
    if (request.queryParams.payload) {
      request.queryParams.payload = struct.encode(request.queryParams.payload)
    }

    debug(`dialogflow request: ${JSON.stringify(_.omit(request, ['inputAudio']), null, 2)}`)
    msg.sourceData = request

    return this.sessionClient.detectIntent(request)
      .then((responses) => {
        this.queryParams.contexts = []
        const response = responses[0]

        debug(`dialogflow response: ${JSON.stringify(_.omit(response, ['outputAudio']), null, 2)}`)
        let decoded = false
        if (response.queryResult.parameters) {
          response.queryResult.parameters = struct.decode(response.queryResult.parameters)
        }
        if (response.queryResult.outputContexts) {
          response.queryResult.outputContexts.forEach(context => {
            if (context.parameters) {
              context.parameters = struct.decode(context.parameters)
              decoded = true
            }
          })
        }
        if (decoded) debug(`dialogflow response (after struct.decode): ${JSON.stringify(_.omit(response, ['outputAudio']), null, 2)}`)

        const nlp = {
          intent: this._extractIntent(response),
          entities: this._extractEntities(response)
        }
        const audioAttachment = this._getAudioOutput(response)
        const attachments = audioAttachment ? [audioAttachment] : []

        const outputPlatform = this.caps[Capabilities.DIALOGFLOW_OUTPUT_PLATFORM]
        const ffSrc = response.queryResult.fulfillmentMessages ? JSON.parse(JSON.stringify(response.queryResult.fulfillmentMessages)) : []
        let fulfillmentMessages = ffSrc.filter(f => {
          if (outputPlatform && f.platform === outputPlatform) {
            return true
          } else if (!outputPlatform && (f.platform === 'PLATFORM_UNSPECIFIED' || !f.platform)) {
            return true
          }
          return false
        })

        // use default if platform specific is not found
        if (fulfillmentMessages.length === 0 && outputPlatform) {
          fulfillmentMessages = ffSrc.filter(f =>
            (f.platform === 'PLATFORM_UNSPECIFIED' || !f.platform))
        }

        let forceIntentResolution = this.caps[Capabilities.DIALOGFLOW_FORCE_INTENT_RESOLUTION]
        fulfillmentMessages.forEach((fulfillmentMessage) => {
          let acceptedResponse = true
          const botMsg = { sender: 'bot', sourceData: response.queryResult, nlp, attachments }
          if (fulfillmentMessage.text) {
            botMsg.messageText = fulfillmentMessage.text.text[0]
          } else if (fulfillmentMessage.simpleResponses) {
            botMsg.messageText = fulfillmentMessage.simpleResponses.simpleResponses[0].textToSpeech
          } else if (fulfillmentMessage.image) {
            botMsg.media = [{
              mediaUri: fulfillmentMessage.image.imageUri,
              mimeType: mime.lookup(fulfillmentMessage.image.imageUri) || 'application/unknown'
            }]
          } else if (fulfillmentMessage.quickReplies) {
            botMsg.messageText = fulfillmentMessage.quickReplies.title
            botMsg.buttons = fulfillmentMessage.quickReplies.quickReplies.map((q) => ({ text: q }))
          } else if (fulfillmentMessage.card) {
            botMsg.messageText = fulfillmentMessage.card.title
            botMsg.cards = [{
              text: fulfillmentMessage.card.title,
              image: fulfillmentMessage.card.imageUri && {
                mediaUri: fulfillmentMessage.card.imageUri,
                mimeType: mime.lookup(fulfillmentMessage.card.imageUri) || 'application/unknown'
              },
              buttons: fulfillmentMessage.card.buttons && fulfillmentMessage.card.buttons.map((q) => ({ text: q.text, payload: q.postback }))
            }]
          } else if (fulfillmentMessage.basicCard) {
            botMsg.messageText = fulfillmentMessage.basicCard.title
            botMsg.cards = [{
              text: fulfillmentMessage.basicCard.title,
              image: fulfillmentMessage.basicCard.image && {
                mediaUri: fulfillmentMessage.basicCard.image.imageUri,
                mimeType: mime.lookup(fulfillmentMessage.basicCard.image.imageUri) || 'application/unknown',
                altText: fulfillmentMessage.basicCard.image.accessibilityText
              },
              buttons: fulfillmentMessage.basicCard.buttons && fulfillmentMessage.basicCard.buttons.map((q) => ({ text: q.title, payload: q.openUriAction && q.openUriAction.uri }))
            }]
          } else if (fulfillmentMessage.listSelect) {
            botMsg.messageText = fulfillmentMessage.listSelect.title
            botMsg.cards = fulfillmentMessage.listSelect.items.map(item => ({
              text: item.title,
              subtext: item.description,
              image: item.image && {
                mediaUri: item.image.imageUri,
                mimeType: mime.lookup(item.image.imageUri) || 'application/unknown',
                altText: item.image.accessibilityText
              },
              buttons: item.info && item.info.key && [{ text: item.info.key }]
            }))
          } else if (fulfillmentMessage.carouselSelect) {
            botMsg.cards = fulfillmentMessage.carouselSelect.items.map(item => ({
              text: item.title,
              subtext: item.description,
              image: item.image && {
                mediaUri: item.image.imageUri,
                mimeType: mime.lookup(item.image.imageUri) || 'application/unknown',
                altText: item.image.accessibilityText
              },
              buttons: item.info && item.info.key && [{ text: item.info.key }]
            }))
          } else if (fulfillmentMessage.suggestions) {
            botMsg.buttons = fulfillmentMessage.suggestions.suggestions && fulfillmentMessage.suggestions.suggestions.map((q) => ({ text: q.title }))
          } else if (fulfillmentMessage.linkOutSuggestion) {
            botMsg.buttons = [{ text: fulfillmentMessage.linkOutSuggestion.destinationName, payload: fulfillmentMessage.linkOutSuggestion.uri }]
          } else {
            acceptedResponse = false
          }

          if (acceptedResponse) {
            setTimeout(() => this.queueBotSays(botMsg), 0)
            forceIntentResolution = false
          }
        })

        if (forceIntentResolution) {
          setTimeout(() => this.queueBotSays({ sender: 'bot', sourceData: response.queryResult, nlp, attachments }), 0)
        }
      }).catch((err) => {
        debug(err)
        throw new Error(`Cannot send message to dialogflow container: ${err.message}`)
      })
  }

  async Stop () {
    debug('Stop called')
    this.sessionClient = null
    this.sessionPath = null
    this.queryParams = null
  }

  async Clean () {
    debug('Clean called')
    this.sessionOpts = null
  }

  _getAudioOutput (response) {
    if (response.outputAudio && response.outputAudioConfig) {
      const acSrc = JSON.parse(JSON.stringify(response.outputAudioConfig))
      const attachment = {
      }
      if (acSrc.audioEncoding === 'OUTPUT_AUDIO_ENCODING_LINEAR_16') {
        attachment.name = 'output.wav'
        attachment.mimeType = 'audio/wav'
      } else if (acSrc.audioEncoding === 'OUTPUT_AUDIO_ENCODING_MP3') {
        attachment.name = 'output.mp3'
        attachment.mimeType = 'audio/mpeg3'
      } else if (acSrc.audioEncoding === 'OUTPUT_AUDIO_ENCODING_OGG_OPUS') {
        attachment.name = 'output.ogg'
        attachment.mimeType = 'audio/ogg'
      }
      if (attachment.name) {
        attachment.base64 = Buffer.from(response.outputAudio).toString('base64')
        return attachment
      }
    }
  }

  _createInitialContext (contextSuffix) {
    let contextPath = null
    if (this.caps[Capabilities.DIALOGFLOW_ENVIRONMENT]) {
      contextPath = this.contextClient.projectAgentEnvironmentUserSessionContextPath(this.caps[Capabilities.DIALOGFLOW_PROJECT_ID], this.caps[Capabilities.DIALOGFLOW_ENVIRONMENT], '-', this.conversationId, this.caps[Capabilities.DIALOGFLOW_INPUT_CONTEXT_NAME + contextSuffix])
    } else {
      contextPath = this.contextClient.projectAgentSessionContextPath(this.caps[Capabilities.DIALOGFLOW_PROJECT_ID], this.conversationId, this.caps[Capabilities.DIALOGFLOW_INPUT_CONTEXT_NAME + contextSuffix])
    }

    return {
      name: contextPath,
      lifespanCount: parseInt(this.caps[Capabilities.DIALOGFLOW_INPUT_CONTEXT_LIFESPAN + contextSuffix]),
      parameters: this.caps[Capabilities.DIALOGFLOW_INPUT_CONTEXT_PARAMETERS + contextSuffix] &&
        struct.encode(this.caps[Capabilities.DIALOGFLOW_INPUT_CONTEXT_PARAMETERS + contextSuffix])
    }
  }

  _getContextSuffixes () {
    const suffixes = []
    const contextNameCaps = _.pickBy(this.caps, (v, k) => k.startsWith(Capabilities.DIALOGFLOW_INPUT_CONTEXT_NAME))
    _(contextNameCaps).keys().sort().each((key) => {
      suffixes.push(key.substring(Capabilities.DIALOGFLOW_INPUT_CONTEXT_NAME.length))
    })
    return suffixes
  }

  _extractCustomContexts (msg) {
    const result = []
    if (msg.SET_DIALOGFLOW_CONTEXT) {
      _.keys(msg.SET_DIALOGFLOW_CONTEXT).forEach(contextName => {
        const val = msg.SET_DIALOGFLOW_CONTEXT[contextName]
        if (_.isObject(val)) {
          result.push(this._createCustomContext(contextName, val.lifespan, val.parameters))
        } else {
          result.push(this._createCustomContext(contextName, val))
        }
      })
    }
    return result
  }

  _createCustomContext (contextName, contextLifespan, contextParameters) {
    let contextPath = null
    if (this.caps[Capabilities.DIALOGFLOW_ENVIRONMENT]) {
      contextPath = this.contextClient.projectAgentEnvironmentUserSessionContextPath(this.caps[Capabilities.DIALOGFLOW_PROJECT_ID], this.caps[Capabilities.DIALOGFLOW_ENVIRONMENT], '-', this.conversationId, contextName)
    } else {
      contextPath = this.contextClient.projectAgentSessionContextPath(this.caps[Capabilities.DIALOGFLOW_PROJECT_ID], this.conversationId, contextName)
    }
    try {
      contextLifespan = parseInt(contextLifespan)
    } catch (err) {
      contextLifespan = 1
    }

    const context = {
      name: contextPath,
      lifespanCount: contextLifespan
    }
    if (contextParameters) {
      context.parameters = struct.encode(contextParameters)
    }
    return context
  }

  _extractIntent (response) {
    if (response.queryResult.intent) {
      return {
        name: response.queryResult.intent.displayName,
        confidence: response.queryResult.intentDetectionConfidence,
        incomprehension: this.caps.DIALOGFLOW_FALLBACK_INTENTS.includes(response.queryResult.intent.displayName) ? true : undefined
      }
    }
    return {}
  }

  _extractEntities (response) {
    if (response.queryResult.parameters && Object.keys(response.queryResult.parameters).length > 0) {
      return this._extractEntitiesFromFields('', response.queryResult.parameters)
    }
    return []
  }

  _extractEntitiesFromFields (keyPrefix, fields) {
    return Object.keys(fields).reduce((entities, key) => {
      return entities.concat(this._extractEntityValues(`${keyPrefix ? keyPrefix + '.' : ''}${key}`, fields[key]))
    }, [])
  }

  _extractEntityValues (key, field) {
    if (_.isNull(field) || _.isUndefined(field)) {
      return []
    } else if (_.isString(field) || _.isNumber(field) || _.isBoolean(field)) {
      return [{
        name: key,
        value: field
      }]
    } else if (_.isArray(field)) {
      return field.reduce((entities, lv, i) => {
        return entities.concat(this._extractEntityValues(`${key}.${i}`, lv))
      }, [])
    } else if (_.isObject(field)) {
      return this._extractEntitiesFromFields(key, field)
    }
    debug(`Unsupported entity kind for ${key}, skipping entity.`)
    return []
  }
}

const audioEncodingList = [
  'AUDIO_ENCODING_UNSPECIFIED',
  'AUDIO_ENCODING_LINEAR_16',
  'AUDIO_ENCODING_FLAC',
  'AUDIO_ENCODING_MULAW',
  'AUDIO_ENCODING_AMR',
  'AUDIO_ENCODING_AMR_WB',
  'AUDIO_ENCODING_OGG_OPUS',
  'AUDIO_ENCODING_SPEEX_WITH_HEADER_BYTE'
]

module.exports = {
  PluginVersion: 1,
  PluginClass: BotiumConnectorDialogflow,
  Import: {
    Handler: importHandler,
    Args: importArgs
  },
  Export: {
    Handler: exportHandler,
    Args: exportArgs
  },
  NLP: {
    ExtractIntentUtterances: extractIntentUtterances,
    TrainIntentUtterances: trainIntentUtterances,
    CleanupIntentUtterances: cleanupIntentUtterances
  },
  PluginDesc: {
    name: 'Google Dialogflow ES',
    provider: 'Google',
    features: {
      intentResolution: true,
      intentConfidenceScore: true,
      entityResolution: true,
      testCaseGeneration: true,
      testCaseExport: true,
      audioInput: true,
      supportedFileExtensions: ['.wav', '.pcm', '.m4a', '.flac', '.riff', '.wma', '.aac', '.ogg', '.oga', '.mp3', '.amr']
    },
    capabilities: [
      {
        name: 'DIALOGFLOW_API_ENDPOINT',
        label: 'Dialogflow Region',
        description: 'For more information on what region to use, consult the <a href="https://cloud.google.com/dialogflow/es/docs/how/region" target="_blank">Dialogflow Documentation</a>',
        type: 'choice',
        required: false,
        advanced: true,
        choices: [
          { name: 'Europe/Belgium', key: 'europe-west1-dialogflow.googleapis.com' },
          { name: 'Europe/London', key: 'europe-west2-dialogflow.googleapis.com' },
          { name: 'Asia Pacific/Sydney', key: 'australia-southeast1-dialogflow.googleapis.com' },
          { name: 'Asia Pacific/Tokyo', key: 'asia-northeast1-dialogflow.googleapis.com' },
          { name: 'Global', key: 'global-dialogflow.googleapis.com' }
        ]
      },
      {
        name: 'DIALOGFLOW_LANGUAGE_CODE',
        label: 'Language',
        description: 'For more information about supported languages, consult the <a href="https://cloud.google.com/dialogflow/es/docs/reference/language" target="_blank">Dialogflow Documentation</a>',
        type: 'query',
        required: true,
        advanced: true,
        query: async (caps) => {
          if (caps && caps.DIALOGFLOW_CLIENT_EMAIL && caps.DIALOGFLOW_PRIVATE_KEY && caps.DIALOGFLOW_PROJECT_ID) {
            try {
              const sessionOpts = {
                credentials: {
                  client_email: caps[Capabilities.DIALOGFLOW_CLIENT_EMAIL],
                  private_key: caps[Capabilities.DIALOGFLOW_PRIVATE_KEY]
                }
              }
              if (caps.DIALOGFLOW_API_ENDPOINT) {
                sessionOpts.apiEndpoint = caps.DIALOGFLOW_API_ENDPOINT
              }
              const agentsClient = new dialogflow.v2beta1.AgentsClient(sessionOpts)
              const projectPath = agentsClient.projectPath(caps.DIALOGFLOW_PROJECT_ID)
              const allResponses = await agentsClient.getAgent({ parent: projectPath })
              if (allResponses && allResponses.length > 0) {
                return _.uniq([allResponses[0].defaultLanguageCode, ...allResponses[0].supportedLanguageCodes]).map(l => ({ name: l, key: l }))
              }
            } catch (err) {
              throw new Error(`Dialogflow Agent Query failed: ${err.message}`)
            }
          }
        }
      },
      {
        name: 'DIALOGFLOW_OUTPUT_PLATFORM',
        label: 'Output Platform',
        description: 'Find out more about integrations in the <a href="https://cloud.google.com/dialogflow/es/docs/intents-rich-messages" target="_blank">Dialogflow Documentation</a>',
        type: 'choice',
        required: true,
        advanced: true,
        choices: [
          { name: 'Default platform', key: 'PLATFORM_UNSPECIFIED' },
          { name: 'Facebook', key: 'FACEBOOK' },
          { name: 'Slack', key: 'SLACK' },
          { name: 'Telegram', key: 'TELEGRAM' },
          { name: 'Kik', key: 'KIK' },
          { name: 'Skype', key: 'SKYPE' },
          { name: 'Line', key: 'LINE' },
          { name: 'Viber', key: 'VIBER' },
          { name: 'Google Assistant', key: 'ACTIONS_ON_GOOGLE' },
          { name: 'Google Hangouts', key: 'GOOGLE_HANGOUTS' },
          { name: 'Telephony', key: 'TELEPHONY' }
        ]
      },
      {
        name: 'DIALOGFLOW_AUDIOINPUT_ENCODING',
        label: 'Audio Input Encoding',
        description: 'Details about audio encodings are available in the <a href="https://cloud.google.com/dialogflow/es/docs/reference/rest/v2/QueryInput#AudioEncoding" target="_blank">Dialogflow Documentation</a>',
        type: 'choice',
        required: true,
        advanced: true,
        choices: audioEncodingList.map(l => ({ name: l, key: l }))
      }
    ],
    actions: [
      {
        name: 'GetAgentMetaData',
        description: 'GetAgentMetaData',
        run: async (caps) => {
          if (caps && caps.DIALOGFLOW_CLIENT_EMAIL && caps.DIALOGFLOW_PRIVATE_KEY && caps.DIALOGFLOW_PROJECT_ID) {
            try {
              const sessionOpts = {
                credentials: {
                  client_email: caps[Capabilities.DIALOGFLOW_CLIENT_EMAIL],
                  private_key: caps[Capabilities.DIALOGFLOW_PRIVATE_KEY]
                }
              }
              if (caps.DIALOGFLOW_API_ENDPOINT) {
                sessionOpts.apiEndpoint = caps.DIALOGFLOW_API_ENDPOINT
              }
              const agentsClient = new dialogflow.v2beta1.AgentsClient(sessionOpts)
              const projectPath = agentsClient.projectPath(caps.DIALOGFLOW_PROJECT_ID)

              const agentResponses = await agentsClient.getAgent({ parent: projectPath })
              const agentInfo = agentResponses[0]

              return {
                name: agentInfo.displayName,
                description: agentInfo.description,
                metadata: agentInfo
              }
            } catch (err) {
              throw new Error(`Dialogflow Agent Query failed: ${err.message}`)
            }
          }
        }
      }
    ]
  }
}
