import getPort from 'get-port'
import * as net from 'net'
import * as tls from 'tls'
import { Adapter } from './adapter'

let tlsPort: number
let tlsServer: tls.Server

export function TlsAdapter (tlsOptions: tls.TlsOptions): Adapter {
  return {
    name: 'tls',
    async initialize (server) {
      tlsPort = await getPort()
      tlsServer = tls.createServer(tlsOptions).listen(tlsPort)
      tlsServer.on('secureConnection', function tlsServerConnection (tlsSocket) {
        const session = server.sessions.get(tlsSocket)
        if (session == null) {
          // TODO: handle error
          console.error('Session not found')
          return tlsSocket.end()
        }

        session.socket = tlsSocket
        session.socketChain.push(tlsSocket)
        server.handleRawRequest(session)
      })
    },
    matchProtocol (data) {
      // https://stackoverflow.com/questions/3897883/how-to-detect-an-incoming-ssl-https-handshake-ssl-wire-format
      return data[0] === 0x16 && data[1] === 0x03 && data[5] === 0x01
    },
    handler (session, server) {
      session.protocol = 'tls'

      const tlsSocket = net.connect(tlsPort, 'localhost', function tlsClientConnected () {
        server.sessions.link(session.socket, tlsSocket)

        tlsSocket.pipe(session.socket)
        session.socket.pipe(tlsSocket)
      })
    }
  }
}
