const BotDriver = require('botium-core').BotDriver

process.env.BOTIUM_CONFIG = './botium-contexts.json'
const driver = new BotDriver()

driver.BuildFluent()
  .Start()
  .UserSaysText('hello')
  .WaitBotSaysText(console.log)
  .UserSaysText('book a room')
  .WaitBotSaysText(console.log)
  .Stop()
  .Clean()
  .Exec()
  .then(() => {
    console.log('READY')
  })
  .catch((err) => {
    console.log('ERROR: ', err)
  })
