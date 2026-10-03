import { app } from './app.js'
import { config } from './config.js'
import { initStorage } from './storage/index.js'
initStorage()
app.listen(config.port,()=>console.log(`Vastraa API listening on ${config.port}`))
