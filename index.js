const util = require('util')
const uuidV1 = require('uuid/v1')
const mime = require('mime-types')
const dialogflow = require('dialogflow')
const _ = require('lodash')
const debug = require('debug')('botium-connector-dialogflow')

const { importDialogflowIntents, importDialogflowConversations } = require('./src/dialogflowintents')

const structjson = require('./structjson')

const Capabilities = {
  DIALOGFLOW_PROJECT_ID: 'DIALOGFLOW_PROJECT_ID',
  DIALOGFLOW_CLIENT_EMAIL: 'DIALOGFLOW_CLIENT_EMAIL',
  DIALOGFLOW_PRIVATE_KEY: 'DIALOGFLOW_PRIVATE_KEY',
  DIALOGFLOW_LANGUAGE_CODE: 'DIALOGFLOW_LANGUAGE_CODE',
  DIALOGFLOW_INPUT_CONTEXT_NAME: 'DIALOGFLOW_INPUT_CONTEXT_NAME',
  DIALOGFLOW_INPUT_CONTEXT_LIFESPAN: 'DIALOGFLOW_INPUT_CONTEXT_LIFESPAN',
  DIALOGFLOW_INPUT_CONTEXT_PARAMETERS: 'DIALOGFLOW_INPUT_CONTEXT_PARAMETERS',
  DIALOGFLOW_OUTPUT_PLATFORM: 'DIALOGFLOW_OUTPUT_PLATFORM',
  DIALOGFLOW_FORCE_INTENT_RESOLUTION: 'DIALOGFLOW_FORCE_INTENT_RESOLUTION',
  DIALOGFLOW_BUTTON_EVENTS: 'DIALOGFLOW_BUTTON_EVENTS'
}

const Defaults = {
  [Capabilities.DIALOGFLOW_LANGUAGE_CODE]: 'en-US',
  [Capabilities.DIALOGFLOW_FORCE_INTENT_RESOLUTION]: true,
  [Capabilities.DIALOGFLOW_BUTTON_EVENTS]: true
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
    if (!this.caps[Capabilities.DIALOGFLOW_FORCE_INTENT_RESOLUTION]) this.caps[Capabilities.DIALOGFLOW_FORCE_INTENT_RESOLUTION] = Defaults[Capabilities.DIALOGFLOW_FORCE_INTENT_RESOLUTION]
    if (!this.caps[Capabilities.DIALOGFLOW_BUTTON_EVENTS]) this.caps[Capabilities.DIALOGFLOW_BUTTON_EVENTS] = Defaults[Capabilities.DIALOGFLOW_BUTTON_EVENTS]

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
        }
      }
      if (this.caps[Capabilities.DIALOGFLOW_BUTTON_EVENTS] && msg.buttons && msg.buttons.length > 0 && (msg.buttons[0].text || msg.buttons[0].payload)) {
        let payload = msg.buttons[0].payload || msg.buttons[0].text
        try {
          payload = JSON.parse(payload)
          request.queryInput.event = Object.assign({}, { languageCode: this.caps[Capabilities.DIALOGFLOW_LANGUAGE_CODE] }, payload)
        } catch (err) {
          request.queryInput.event = {
            name: payload,
            languageCode: this.caps[Capabilities.DIALOGFLOW_LANGUAGE_CODE]
          }
        }
      } else {
        request.queryInput.text = {
          text: msg.messageText,
          languageCode: this.caps[Capabilities.DIALOGFLOW_LANGUAGE_CODE]
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

        const nlp = {
          intent: this._extractIntent(response),
          entities: this._extractEntities(response)
        }
        let fulfillmentMessages = response.queryResult.fulfillmentMessages.filter(f =>
          (this.caps[Capabilities.DIALOGFLOW_OUTPUT_PLATFORM] && f.platform === this.caps[Capabilities.DIALOGFLOW_OUTPUT_PLATFORM]) ||
          (!this.caps[Capabilities.DIALOGFLOW_OUTPUT_PLATFORM] && (f.platform === 'PLATFORM_UNSPECIFIED' || !f.platform))
        )

        // use default if platform specific is not found
        if (!fulfillmentMessages.length && this.caps[Capabilities.DIALOGFLOW_OUTPUT_PLATFORM]) {
          fulfillmentMessages = response.queryResult.fulfillmentMessages.filter(f =>
            (f.platform === 'PLATFORM_UNSPECIFIED' || !f.platform))
        }

        let forceIntentResolution = this.caps[Capabilities.DIALOGFLOW_FORCE_INTENT_RESOLUTION]
        fulfillmentMessages.forEach((fulfillmentMessage) => {
          let acceptedResponse = true
          const botMsg = { sender: 'bot', sourceData: response.queryResult, nlp }
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
          setTimeout(() => this.queueBotSays({ sender: 'bot', sourceData: response.queryResult, nlp }), 0)
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
    const context = { lifespanCount: parseInt(this.caps[Capabilities.DIALOGFLOW_INPUT_CONTEXT_LIFESPAN + contextSuffix]), name: contextPath }
    if (this.caps[Capabilities.DIALOGFLOW_INPUT_CONTEXT_PARAMETERS + contextSuffix]) {
      context.parameters = structjson.jsonToStructProto(this.caps[Capabilities.DIALOGFLOW_INPUT_CONTEXT_PARAMETERS + contextSuffix])
    }
    const request = { parent: this.sessionPath, context: context }
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

  _extractIntent (response) {
    if (response.queryResult.intent) {
      return {
        name: response.queryResult.intent.displayName,
        confidence: response.queryResult.intentDetectionConfidence
      }
    }
    return {}
  }

  _extractEntities (response) {
    if (response.queryResult.parameters && response.queryResult.parameters.fields) {
      return this._extractEntitiesFromFields('', response.queryResult.parameters.fields)
    }
    return []
  }

  _extractEntitiesFromFields (keyPrefix, fields) {
    return Object.keys(fields).reduce((entities, key) => {
      return entities.concat(this._extractEntityValues(`${keyPrefix ? keyPrefix + '.' : ''}${key}`, fields[key]))
    }, [])
  }

  _extractEntityValues (key, field) {
    if (['numberValue', 'stringValue', 'boolValue', 'nullValue'].indexOf(field.kind) >= 0) {
      return [{
        name: key,
        value: `${field[field.kind]}`
      }]
    }
    if (field.kind === 'structValue') {
      return this._extractEntitiesFromFields(key, field.structValue.fields)
    }
    if (field.kind === 'listValue') {
      if (field.listValue.values && field.listValue.values.length > 0) {
        return field.listValue.values.reduce((entities, lv, i) => {
          return entities.concat(this._extractEntityValues(`${key}.${i}`, lv))
        }, [])
      } else {
        return [{
          name: key,
          value: ''
        }]
      }
    }
    debug(`Unsupported entity kind ${field.kind}, skipping entity.`)
    return []
  }
}

module.exports = {
  PluginVersion: 1,
  PluginClass: BotiumConnectorDialogflow,
  Utils: {
    importDialogflowIntents,
    importDialogflowConversations
  }
}
