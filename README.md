# Botium Connector for Google Dialogflow

[![NPM](https://nodei.co/npm/botium-connector-dialogflow.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/botium-connector-dialogflow/)

[ ![Codeship Status for codeforequity-at/botium-connector-dialogflow](https://app.codeship.com/projects/1c935480-633f-0136-f02a-52b5f01093c8/status?branch=master)](https://app.codeship.com/projects/296958)
[![npm version](https://badge.fury.io/js/botium-connector-dialogflow.svg)](https://badge.fury.io/js/botium-connector-dialogflow)
[![license](https://img.shields.io/github/license/mashape/apistatus.svg)]()

This is a [Botium](https://github.com/codeforequity-at/botium-core) connector for testing your Dialogflow Agents.

__Did you read the [Botium in a Nutshell](https://medium.com/@floriantreml/botium-in-a-nutshell-part-1-overview-f8d0ceaf8fb4) articles ? Be warned, without prior knowledge of Botium you won't be able to properly use this library!__

## How it works ?
Botium runs your conversations against the Dialogflow API.

It can be used as any other Botium connector with all Botium Stack components:
  * [Botium CLI](https://github.com/codeforequity-at/botium-cli/)
  * [Botium Bindings](https://github.com/codeforequity-at/botium-bindings/)
  * [Botium Box](https://www.botium.at)

This connector processes info about NLP. So Intent/Entity asserters can be used.

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

Open the file _botium.json_ in your working directory and add the Google credentials for accessing your Dialogflow agent. [This article](https://chatbotsmagazine.com/3-steps-setup-automated-testing-for-google-assistant-and-dialogflow-de42937e57c6) shows how to retrieve all those settings.

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

Botium setup is ready, you can begin to write your [BotiumScript](https://github.com/codeforequity-at/botium-core/wiki/Botium-Scripting) files.

## Supported Capabilities

Set the capability __CONTAINERMODE__ to __dialogflow__ to activate this connector.

### DIALOGFLOW_PROJECT_ID

Google project id. See [This article](https://chatbotsmagazine.com/3-steps-setup-automated-testing-for-google-assistant-and-dialogflow-de42937e57c6)

### DIALOGFLOW_CLIENT_EMAIL

Google client email. See [This article](https://chatbotsmagazine.com/3-steps-setup-automated-testing-for-google-assistant-and-dialogflow-de42937e57c6)

### DIALOGFLOW_PRIVATE_KEY

Google private key. See [This article](https://chatbotsmagazine.com/3-steps-setup-automated-testing-for-google-assistant-and-dialogflow-de42937e57c6)

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

### DIALOGFLOW_INPUT_CONTEXT_NAME(_X)

You can use [Contexts](https://dialogflow.com/docs/contexts). They can be useful if you dont want to start the conversation from beginning, 
or you can set a context parameter “testmode” to make the web api behind the fulfillment react in a different way than in normal mode.

If you are using more context parameters then you have to use more Capabilities. Use a name, or number as suffix to distinguish them. (Like DIALOGFLOW_INPUT_CONTEXT_NAME_EMAIL).  

This Capability contains the name of the parameter.

See also the [Sample botium.json](./samples/RoomReservation/botium-contexts.json)

 
### DIALOGFLOW_INPUT_CONTEXT_LIFESPAN(_X)

The number of queries this parameter will remain active after being invoked.

Mandatory Capability. 

### DIALOGFLOW_INPUT_CONTEXT_PARAMETERS(_X)

This Capability contains the values of the parameter. It is a JSON structure. See [Sample botium.json](./samples/RoomReservation/botium-contexts.json)

Optional Capability.

## Open Issues and Restrictions
* Account Linking is not supported (Consider using [Botium Connector for Google Assistant](https://github.com/codeforequity-at/botium-connector-google-assistant) if you want to test it)
* Not [all](https://cloud.google.com/dialogflow-enterprise/docs/reference/rest/v2/projects.agent.intents#Message) dialogflow response is supported, just
  * Text,
  * Image
  * Quick replies
  * Cards (You see cards as texts, images, and buttons)
