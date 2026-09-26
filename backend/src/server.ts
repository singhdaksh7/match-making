import { app } from './app.js'
import { config } from './config.js'
app.listen(config.port,()=>console.log(`Vastraa API listening on ${config.port}`))
