import * as net from 'net'
import { Adapter } from './adapter'

function isUpperCaseAscii (byte: number) {
  return byte > 0x40 && byte < 0x5B
}

export function HttpAdapter (mainServerPort: number): Adapter {
  return {
    name: 'http',
    matchProtocol (data) {
      return data.slice(0, 3).every(isUpperCaseAscii)
    },
    handler (session, server) {
      session.protocol = session.protocol === 'tls' ? 'https' : 'http'

      const httpSocket = net.connect(mainServerPort, 'localhost', function httpClientConnected () {
        server.sessions.link(session.socket, httpSocket)

        httpSocket.pipe(session.socket)
        session.socket.pipe(httpSocket)
      })
    }
  }
}
