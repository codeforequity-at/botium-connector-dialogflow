const { v4: uuidv4 } = require('uuid')
const slug = require('slug')
const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const AdmZip = require('adm-zip')

const jsonBuffer = (obj) => {
  return Buffer.from(JSON.stringify(obj, null, 2), 'utf-8')
}
module.exports.jsonBuffer = jsonBuffer

module.exports.writeConvosExcel = (compiler, convos, outputDir, filenamePrefix) => {
  const filename = path.resolve(outputDir, slug(filenamePrefix) + '.xlsx')

  mkdirp.sync(outputDir)

  const scriptData = compiler.Decompile(convos, 'SCRIPTING_FORMAT_XSLX')

  fs.writeFileSync(filename, scriptData)
  return filename
}

module.exports.writeIntentsExcel = (buffer, outputDir, filenamePrefix) => {
  const filename = path.resolve(outputDir, slug(filenamePrefix) + '.xlsx')

  mkdirp.sync(outputDir)

  fs.writeFileSync(filename, buffer)
  return filename
}

module.exports.writeConvo = (compiler, convo, outputDir) => {
  const filename = path.resolve(outputDir, slug(convo.header.name) + '.convo.txt')

  mkdirp.sync(outputDir)

  const scriptData = compiler.Decompile([convo], 'SCRIPTING_FORMAT_TXT')

  fs.writeFileSync(filename, scriptData)
  return filename
}

module.exports.writeUtterances = (compiler, utterance, samples, outputDir) => {
  const filename = path.resolve(outputDir, slug(utterance) + '.utterances.txt')

  mkdirp.sync(outputDir)

  const scriptData = [utterance, ...samples].join('\n')

  fs.writeFileSync(filename, scriptData)
  return filename
}

module.exports.convertToDialogflowUtterance = (utterance, language) => {
  return {
    utterance: {
      id: uuidv4(),
      name: utterance.name,
      auto: true,
      contexts: [],
      responses: [
        {
          resetContexts: false,
          action: utterance.name,
          affectedContexts: [],
          parameters: [],
          messages: [
            {
              type: 0,
              lang: language,
              condition: '',
              speech: []
            }
          ],
          defaultResponsePlatforms: {},
          speech: []
        }
      ],
      priority: 500000,
      webhookUsed: false,
      webhookForSlotFilling: false,
      fallbackIntent: false,
      events: [],
      conditionalResponses: [],
      condition: '',
      conditionalFollowupEvents: []
    },
    userSays: utterance.utterances.map(utt => {
      return {
        id: uuidv4(),
        data: [
          {
            text: utt,
            userDefined: false
          }
        ],
        isTemplate: false,
        count: 0,
        updated: 0
      }
    })
  }
}

module.exports.loadAgentZip = async (agentsClient, projectPath) => {
  const agentResponses = await agentsClient.getAgent({ parent: projectPath })
  const agentInfo = agentResponses[0]
  const exportResponses = await agentsClient.exportAgent({ parent: projectPath })
  const waitResponses = await exportResponses[0].promise()
  try {
    const buf = Buffer.from(waitResponses[0].agentContent, 'base64')
    const unzip = new AdmZip(buf)

    return {
      unzip,
      zipEntries: unzip.getEntries(),
      agentInfo
    }
  } catch (err) {
    throw new Error(`Dialogflow agent unpack failed: ${err.message}`)
  }
}
