import startServer from './api.js'
import { startBot } from './bot.js'

const promise = startBot()
startServer()
await promise
console.log("started server")
