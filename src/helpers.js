const { v4: uuidv4 } = require('uuid')
const JSZip = require('jszip')

const jsonBuffer = (obj) => {
  return Buffer.from(JSON.stringify(obj, null, 2), 'utf-8')
}

const convertToDialogflowUtterance = (examples, language) => {
  return examples.map(utt => {
    return {
      id: uuidv4(),
      data: [
        {
          text: utt,
          userDefined: false
        }
      ],
      isTemplate: false,
      lang: language,
      count: 0,
      updated: 0
    }
  })
}

const loadAgentZip = async (agentsClient, projectPath) => {
  const agentResponses = await agentsClient.getAgent({ parent: projectPath })
  const agentInfo = agentResponses[0]
  const exportResponses = await agentsClient.exportAgent({ parent: projectPath })
  const waitResponses = await exportResponses[0].promise()
  try {
    const buf = Buffer.from(waitResponses[0].agentContent, 'base64')

    const unzip = await JSZip.loadAsync(buf)
    const zipEntries = []
    unzip.forEach((relativePath, zipEntry) => {
      zipEntries.push(zipEntry)
    })

    return {
      unzip,
      zipEntries,
      agentInfo
    }
  } catch (err) {
    throw new Error(`Dialogflow agent unpack failed: ${err.message}`)
  }
}

module.exports = {
  jsonBuffer,
  convertToDialogflowUtterance,
  loadAgentZip
}
