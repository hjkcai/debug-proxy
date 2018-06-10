import * as fs from 'fs'
import { TlsAdapter } from './tls'
import { HttpAdapter } from './http'
import { DebugProxyServer } from './server'

const MAIN_SERVER_PORT = 8888

const server = new DebugProxyServer()
server.setConfig({
  adapters: [
    TlsAdapter({
      key: fs.readFileSync('ssl/domain.key'),
      cert: fs.readFileSync('ssl/domain.crt')
    }),
    HttpAdapter(MAIN_SERVER_PORT)
  ]
}).then(() => {
  server.listen(MAIN_SERVER_PORT)
})
