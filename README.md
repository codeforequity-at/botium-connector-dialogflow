# Botium Connector for Google Dialogflow

[![NPM](https://nodei.co/npm/botium-connector-dialogflow.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/botium-connector-dialogflow/)

[![npm version](https://badge.fury.io/js/botium-connector-dialogflow.svg)](https://badge.fury.io/js/botium-connector-dialogflow)
[![license](https://img.shields.io/github/license/mashape/apistatus.svg)]()

This is a [Botium](https://github.com/codeforequity-at/botium-core) connector for testing your Dialogflow Agents.

__Did you read the [Botium in a Nutshell](https://medium.com/@floriantreml/botium-in-a-nutshell-part-1-overview-f8d0ceaf8fb4) articles ? Be warned, without prior knowledge of Botium you won't be able to properly use this library!__

## How it works ?
Botium runs your conversations against the Dialogflow API.

It can be used as any other Botium connector with all Botium Stack components:
  * [Botium CLI](https://github.com/codeforequity-at/botium-cli/)
  * [Botium Bindings](https://github.com/codeforequity-at/botium-bindings/)
  * [Botium Box](https://www.botium.ai)

Extracts Button, Media, Card, and NLP information (intent, entities) from Chatbot API response. Accordingly it is possible to use a corresponding [Botium Asserter](https://botium-docs.readthedocs.io/en/latest/05_botiumscript/index.html#using-asserters).

## Requirements

* __Node.js and NPM__
* a __Dialogflow__ agent, and user account with administrative rights
* a __project directory__ on your workstation to hold test cases and Botium configuration

## Install Botium and Dialogflow Connector

When using __Botium CLI__:

```
> npm install -g botium-cli
> npm install -g botium-connector-dialogflow
> botium-cli init
> botium-cli run
```

When using __Botium Bindings__:

```
> npm install -g botium-bindings
> npm install -g botium-connector-dialogflow
> botium-bindings init mocha
> npm install && npm run mocha
```

When using __Botium Box__:

_Already integrated into Botium Box, no setup required_

## Connecting Dialogflow Agent to Botium

Open the file _botium.json_ in your working directory and add the Google credentials for accessing your Dialogflow agent. [This article](https://wiki.botiumbox.com/technical-reference/botium-connectors/supported-technologies/botium-connector-dialogflow/) shows how to retrieve all those settings.

```
{
  "botium": {
    "Capabilities": {
      "PROJECTNAME": "<whatever>",
      "CONTAINERMODE": "dialogflow",
      "DIALOGFLOW_PROJECT_ID": "<google project id>",
      "DIALOGFLOW_CLIENT_EMAIL": "<service credentials email>",
      "DIALOGFLOW_PRIVATE_KEY": "<service credentials private key>"
    }
  }
}
```

To check the configuration, run the emulator (Botium CLI required) to bring up a chat interface in your terminal window:

```
> botium-cli emulator
```

Botium setup is ready, you can begin to write your [BotiumScript](https://botium-docs.readthedocs.io/en/latest/05_botiumscript/index.html#) files.

## Using the botium-connector-dialogflow-cli

This connector provides a CLI interface for importing convos and utterances from your Dialogflow agent and convert it to BotiumScript.

* Intents and Utterances are converted to BotiumScript utterances files (using the _--buildconvos_ option)
* Conversations are reverse engineered and converted to BotiumScript convo files (using the _--buildmultistepconvos_ option)

You can either run the CLI with *[botium-cli](https://github.com/codeforequity-at/botium-cli) (recommended - it is integrated there)*, or directly from this connector (see samples/assistant directory for some examples):

    > botium-connector-dialogflow-cli import --buildconvos
    > botium-connector-dialogflow-cli import --buildmultistepconvos

_Please note that you will have to install the npm packages botium-core manually before using this CLI_

For getting help on the available CLI options and switches, run:

    > botium-connector-dialogflow-cli import --help

## Dialogflow Context Handling

When using BotiumScript, you can do assertions on and manipulation of the [Dialogflow context variables](https://cloud.google.com/dialogflow/docs/contexts-overview).

### Asserting context and context parameters

For asserting existance of context variables, you can use the [JSON_PATH asserter](https://botium-docs.readthedocs.io/en/latest/05_botiumscript/index.html#jsonpath-asserter):

**Assert output context name**

    #bot
    JSON_PATH $.outputContexts[0].name|*testsession*

_Use the ***** for wildcard matching_

**Assert context parameter "myparameter" for output context named "mycontext"**

    #bot
    JSON_PATH $.outputContexts[?(@.name.indexOf('mycontext') >= 0)].parameters.myparameter|somevalue

_Use the JSONPath filer for matching a context by name instead of index_

**Assert lifespan for output context named "mycontext"**

    #bot
    JSON_PATH $.outputContexts[?(@.name.indexOf('mycontext') >= 0 && @.lifespanCount > 2)]

### Adding context variables

For adding a context variable, you have to use the [UPDATE_CUSTOM logic hook](https://botium-docs.readthedocs.io/en/latest/05_botiumscript/index.html#update-custom). This example will set two context variables, one with some parameters:

    #me
    heyo
    UPDATE_CUSTOM SET_DIALOGFLOW_CONTEXT|mycontext1|7
    UPDATE_CUSTOM SET_DIALOGFLOW_CONTEXT|mycontext2|{"lifespan": 4, "parameters": { "test": "test1"}}

The parameters are:
1. SET_DIALOGFLOW_CONTEXT
2. The name of the context variable (if already existing, it will be overwritten)
3. The lifespan of the context variable (if scalar value), or the lifespan and the context parameters (if JSON formatted)

## Dialogflow Query Parameters

When using BotiumScript, you can do manipulation of the [Dialogflow query parameters](https://cloud.google.com/dialogflow/docs/reference/rest/v2beta1/QueryParameters).You have to use the [UPDATE_CUSTOM logic hook](https://botium-docs.readthedocs.io/en/latest/05_botiumscript/index.html#update-custom). This example will add a _payload_ field with some JSON content in the query parameters:

    #me
    heyo
    UPDATE_CUSTOM SET_DIALOGFLOW_QUERYPARAMS|payload|{"key": "value"}

## Supported Capabilities

Set the capability __CONTAINERMODE__ to __dialogflow__ to activate this connector.

### DIALOGFLOW_PROJECT_ID

Google project id. See [This article](https://chatbotsmagazine.com/3-steps-setup-automated-testing-for-google-assistant-and-dialogflow-de42937e57c6)

### DIALOGFLOW_ENVIRONMENT

Dialogflow publishing environment name. See [This article](https://cloud.google.com/dialogflow/docs/agents-versions)

### DIALOGFLOW_CLIENT_EMAIL
_Optional_

Google client email. See [This article](https://chatbotsmagazine.com/3-steps-setup-automated-testing-for-google-assistant-and-dialogflow-de42937e57c6)

If not given, [Google default authentication](https://cloud.google.com/docs/authentication/getting-started) will be used.

### DIALOGFLOW_PRIVATE_KEY
_Optional_

Google private key. See [This article](https://chatbotsmagazine.com/3-steps-setup-automated-testing-for-google-assistant-and-dialogflow-de42937e57c6)

If not given, [Google default authentication](https://cloud.google.com/docs/authentication/getting-started) will be used.

### DIALOGFLOW_LANGUAGE_CODE

The language of this conversational query. See [all languages](https://dialogflow.com/docs/reference/language).
A Dialogflow Agent is multilingiual, Connector is not. But you can use more botium.json for each language.
(Botium Box, or Botium CLI is recommended in this case. Botium Bindings does not support more botium.xml)

### DIALOGFLOW_OUTPUT_PLATFORM

Set the chat platform to get platform dependent response. See [all platforms](https://dialogflow.com/docs/reference/message-objects#text_response_2)
If you have multi platform dependent conversation, then it is the same situation as DIALOGFLOW_LANGUAGE_CODE

### DIALOGFLOW_FORCE_INTENT_RESOLUTION

Experimental capability.

From a Dialogflow response the Connector can extract zero, one, or more messages. Every message will got the NLP information like intent and entities from the Dialogflow response.
If Connector extracts zero messages, then creates a dummy one, to hold the NLP information. With this flag you can turn off this feature.

Default _true_

### DIALOGFLOW_BUTTON_EVENTS
Default _true_

Botium simulates button clicks by using [Dialogflow "Events"](https://dialogflow.com/docs/events). If the payload of the button click simulation is valid JSON, it should include a ["name" and a "parameters" attribute](https://cloud.google.com/dialogflow-enterprise/docs/reference/rpc/google.cloud.dialogflow.v2#google.cloud.dialogflow.v2.EventInput), otherwise the named event without parameters is triggered.

By setting this capability to _false_ this behaviour can be disabled and a button click is sent as text input to Dialogflow.

### DIALOGFLOW_QUERY_PARAMS

Setting the initial [Dialogflow query parameters](https://cloud.google.com/dialogflow/docs/reference/rest/v2beta1/QueryParameters).

Has to be a JSON-string or JSON-object.

### DIALOGFLOW_INPUT_CONTEXT_NAME(_X)

You can use [Contexts](https://dialogflow.com/docs/contexts). They can be useful if you dont want to start the conversation from beginning,
or you can set a context parameter “testmode” to make the web api behind the fulfillment react in a different way than in normal mode.

If you are using more context parameters then you have to use more Capabilities. Use a name, or number as suffix to distinguish them. (Like DIALOGFLOW_INPUT_CONTEXT_NAME_EMAIL).

This Capability contains the name of the parameter.

See also the [Sample botium.json](./samples/RoomReservation/botium.json)

### DIALOGFLOW_INPUT_CONTEXT_LIFESPAN(_X)

The number of queries this parameter will remain active after being invoked.

Mandatory Capability.

### DIALOGFLOW_INPUT_CONTEXT_PARAMETERS(_X)

This Capability contains the values of the parameter. It is a JSON structure. See [Sample botium.json](./samples/RoomReservation/botium.json)

Optional Capability.

### DIALOGFLOW_ENABLE_KNOWLEDGEBASE
_Default: false_

This Capability enables support for [Dialogflow Knowledge Connectors](https://cloud.google.com/dialogflow/docs/knowledge-connectors). If this is set to _true_, then all knowledge bases connected to your Dialogflow agent are included in the queries. You can select individual knowledge bases by using a JSON array with the full knowledge base names, including the google project id and the knowledge base id:

    ...
    "DIALOGFLOW_ENABLE_KNOWLEDGEBASE": [ "projects/project-id/knowledgeBases/knowledge-base-id" ]
    ...

### DIALOGFLOW_FALLBACK_INTENTS
_Default: ['Default Fallback Intent']_

As default the not recognized utterance will be categorized as _Default Fallback Intent_ by Dialogflow.
If you change this behavior, you can inform connector about it. Used just for analyzation.   

## Additional Capabilities for NLP Analytics

The recommendation is to separate the Dialogflow agent you are using for NLP analytics from the one used for training your chatbot. There is a separate set of capabilities for connecting to an additional Dialogflow agent.

### DIALOGFLOW_NLP_PROJECT_ID

Google project id.

### DIALOGFLOW_NLP_CLIENT_EMAIL

Google client email.

### DIALOGFLOW_NLP_PRIVATE_KEY

Google private key.

## Additional Capabilities for Audio Input (Speech Recognition)

For more details about audio configuration, go [here](https://cloud.google.com/speech-to-text/docs/encoding?hl=de).  

### DIALOGFLOW_AUDIOINPUT_ENCODING

Audio File Encoding

### DIALOGFLOW_AUDIOINPUT_SAMPLERATEHERTZ

Audio File Sample Rate in Hertz

### DIALOGFLOW_AUDIOINPUT_CHANNELS

Audio File - Count of Channels

### DIALOGFLOW_AUDIOINPUT_RECOGNITION_PER_CHANNEL

Audio File - Separate Recognition per Channel

### DIALOGFLOW_API_ENDPOINT

By default the Dialogflow connector only works with the US (Global) region of Dialogflow, however it can be configured to connect to a region specific version of Dialogflow. This requires setting the project ID to include the location AND setting a custom API Endpoint for the specific region dialogflow instance. In this example configuration, an example of the dialogflow region would be `australia-southeast1`. List of available regions: https://cloud.google.com/dialogflow/es/docs/how/region

```
{
  "botium": {
    "Capabilities": {
      "PROJECTNAME": "<whatever>",
      "CONTAINERMODE": "dialogflow",
      "DIALOGFLOW_PROJECT_ID": "<google project id>/locations/<dialogflow region>",
      "DIALOGFLOW_CLIENT_EMAIL": "<service credentials email>",
      "DIALOGFLOW_PRIVATE_KEY": "<service credentials private key>",
      "DIALOGFLOW_API_ENDPOINT": "<dialogflow region>-dialogflow.googleapis.com"
    }
  }
}
```

## Open Issues and Restrictions
* Account Linking is not supported (Consider using [Botium Connector for Google Assistant](https://github.com/codeforequity-at/botium-connector-google-assistant) if you want to test it)
* Not [all](https://cloud.google.com/dialogflow-enterprise/docs/reference/rest/v2/projects.agent.intents#Message) dialogflow response is supported, just
  * Text,
  * Image
  * Quick replies
  * Cards (You see cards as texts, images, and buttons)
