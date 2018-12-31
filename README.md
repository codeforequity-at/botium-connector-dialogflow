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
### DIALOGFLOW_CLIENT_EMAIL
### DIALOGFLOW_PRIVATE_KEY
### DIALOGFLOW_LANGUAGE_CODE
### DIALOGFLOW_USE_INTENT
### DIALOGFLOW_INPUT_CONTEXT_NAME(_X)
### DIALOGFLOW_INPUT_CONTEXT_LIFESPAN(_X)
### DIALOGFLOW_INPUT_CONTEXT_PARAMETERS(_X)
### DIALOGFLOW_OUTPUT_PLATFORM

## Open Issues and Restrictions
* Account Linking not supported


