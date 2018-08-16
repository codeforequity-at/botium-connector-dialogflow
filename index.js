const util = require('util')
const uuidV1 = require('uuid/v1')
const dialogflow = require('dialogflow')
const _ = require('lodash')
const debug = require('debug')('botium-connector-dialogflow')

const structjson = require('./structjson')

const Capabilities = {
  DIALOGFLOW_PROJECT_ID: 'DIALOGFLOW_PROJECT_ID',
  DIALOGFLOW_CLIENT_EMAIL: 'DIALOGFLOW_CLIENT_EMAIL',
  DIALOGFLOW_PRIVATE_KEY: 'DIALOGFLOW_PRIVATE_KEY',
  DIALOGFLOW_LANGUAGE_CODE: 'DIALOGFLOW_LANGUAGE_CODE',
  DIALOGFLOW_USE_INTENT: 'DIALOGFLOW_USE_INTENT',
  DIALOGFLOW_INPUT_CONTEXT_NAME: 'DIALOGFLOW_INPUT_CONTEXT_NAME',
  DIALOGFLOW_INPUT_CONTEXT_LIFESPAN: 'DIALOGFLOW_INPUT_CONTEXT_LIFESPAN',
  DIALOGFLOW_INPUT_CONTEXT_PARAMETERS: 'DIALOGFLOW_INPUT_CONTEXT_PARAMETERS'
}

const Defaults = {
  [Capabilities.DIALOGFLOW_LANGUAGE_CODE]: 'en-US',
  [Capabilities.DIALOGFLOW_USE_INTENT]: false
}

class BotiumConnectorDialogflow {
  constructor ({ queueBotSays, caps }) {
    this.queueBotSays = queueBotSays
    this.caps = caps
  }

  Validate () {
    debug('Validate called')
    if (!this.caps[Capabilities.DIALOGFLOW_PROJECT_ID]) throw new Error('DIALOGFLOW_PROJECT_ID capability required')
    if (!this.caps[Capabilities.DIALOGFLOW_CLIENT_EMAIL]) throw new Error('DIALOGFLOW_CLIENT_EMAIL capability required')
    if (!this.caps[Capabilities.DIALOGFLOW_PRIVATE_KEY]) throw new Error('DIALOGFLOW_PRIVATE_KEY capability required')
    if (!this.caps[Capabilities.DIALOGFLOW_LANGUAGE_CODE]) this.caps[Capabilities.DIALOGFLOW_LANGUAGE_CODE] = Defaults[Capabilities.DIALOGFLOW_LANGUAGE_CODE]

    const contextSuffixes = this._getContextSuffixes()
    contextSuffixes.forEach((contextSuffix) => {
      if (!this.caps[Capabilities.DIALOGFLOW_INPUT_CONTEXT_NAME + contextSuffix] || !this.caps[Capabilities.DIALOGFLOW_INPUT_CONTEXT_LIFESPAN + contextSuffix]) {
        throw new Error(`DIALOGFLOW_INPUT_CONTEXT_NAME${contextSuffix} and DIALOGFLOW_INPUT_CONTEXT_LIFESPAN${contextSuffix} capability required`)
      }
    })
    return Promise.resolve()
  }

  Build () {
    debug('Build called')
    this.sessionOpts = {
      credentials: {
        client_email: this.caps[Capabilities.DIALOGFLOW_CLIENT_EMAIL],
        private_key: this.caps[Capabilities.DIALOGFLOW_PRIVATE_KEY]
      }
    }
    return Promise.resolve()
  }

  Start () {
    debug('Start called')

    this.sessionClient = new dialogflow.SessionsClient(this.sessionOpts)
    this.conversationId = uuidV1()
    this.sessionPath = this.sessionClient.sessionPath(this.caps[Capabilities.DIALOGFLOW_PROJECT_ID], this.conversationId)
    this.queryParams = null

    this.contextClient = new dialogflow.ContextsClient(this.sessionOpts)
    return Promise.all(this._getContextSuffixes().map((c) => this._createContext(c)))
  }

  UserSays (msg) {
    debug('UserSays called')
    if (!this.sessionClient) return Promise.reject(new Error('not built'))

    return new Promise((resolve, reject) => {
      const request = {
        session: this.sessionPath,
        queryInput: {
          text: {
            text: msg.messageText,
            languageCode: this.caps[Capabilities.DIALOGFLOW_LANGUAGE_CODE]
          }
        }
      }
      request.queryParams = this.queryParams
      debug(`dialogflow request: ${JSON.stringify(request, null, 2)}`)

      this.sessionClient.detectIntent(request).then((responses) => {
        const response = responses[0]
        debug(`dialogflow response: ${JSON.stringify(response, null, 2)}`)

        response.queryResult.outputContexts.forEach(context => {
          context.parameters = structjson.jsonToStructProto(
            structjson.structProtoToJson(context.parameters)
          )
        })
        this.queryParams = {
          contexts: response.queryResult.outputContexts
        }
        resolve(this)

        if (this.caps[Capabilities.DIALOGFLOW_USE_INTENT]) {
          if (response.queryResult.intent) {
            const botMsg = { sender: 'bot', sourceData: response.queryResult, messageText: response.queryResult.intent.displayName }
            this.queueBotSays(botMsg)
          }
        } else {
          if (response.queryResult.fulfillmentText) {
            const botMsg = { sender: 'bot', sourceData: response.queryResult, messageText: response.queryResult.fulfillmentText }
            this.queueBotSays(botMsg)
          }
        }
      }).catch((err) => {
        reject(new Error(`Cannot send message to dialogflow container: ${util.inspect(err)}`))
      })
    })
  }

  Stop () {
    debug('Stop called')
    this.sessionClient = null
    this.sessionPath = null
    this.queryParams = null
    return Promise.resolve()
  }

  Clean () {
    debug('Clean called')
    this.sessionOpts = null
    return Promise.resolve()
  }

  _createContext (contextSuffix) {
    const contextPath = this.contextClient.contextPath(this.caps[Capabilities.DIALOGFLOW_PROJECT_ID],
      this.conversationId, this.caps[Capabilities.DIALOGFLOW_INPUT_CONTEXT_NAME + contextSuffix])
    const context = {lifespanCount: parseInt(this.caps[Capabilities.DIALOGFLOW_INPUT_CONTEXT_LIFESPAN + contextSuffix]), name: contextPath}
    if (this.caps[Capabilities.DIALOGFLOW_INPUT_CONTEXT_PARAMETERS + contextSuffix]) {
      context.parameters = structjson.jsonToStructProto(this.caps[Capabilities.DIALOGFLOW_INPUT_CONTEXT_PARAMETERS + contextSuffix])
    }
    const request = {parent: this.sessionPath, context: context}
    return this.contextClient.createContext(request)
  }

  _getContextSuffixes () {
    const suffixes = []
    const contextNameCaps = _.pickBy(this.caps, (v, k) => k.startsWith(Capabilities.DIALOGFLOW_INPUT_CONTEXT_NAME))
    _(contextNameCaps).keys().sort().each((key) => {
      suffixes.push(key.substring(Capabilities.DIALOGFLOW_INPUT_CONTEXT_NAME.length))
    })
    return suffixes
  }
}

module.exports = {
  PluginVersion: 1,
  PluginClass: BotiumConnectorDialogflow
}
