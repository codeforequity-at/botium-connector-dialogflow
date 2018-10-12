const BotDriver = require('botium-core').BotDriver

const driver = new BotDriver()

driver.BuildFluent()
  .Start()
  .UserSaysText('hello')
  .WaitBotSaysText(console.log)
  .UserSaysText('book a meeting room for 90 people for about 2 hours in San Francisco on July 25 at 5pm')
  .WaitBotSaysText(console.log)
  .WaitBotSays(console.log)
  .Stop()
  .Clean()
  .Exec()
  .then(() => {
    console.log('READY')
  })
  .catch((err) => {
    console.log('ERROR: ', err)
  })
