import * as fs from 'fs'
import * as net from 'net'
import * as url from 'url'
import * as tls from 'tls'
import * as http from 'http'
import * as https from 'https'
import getPort from 'get-port'

const MAIN_SERVER_PORT = 8888
const portsConfigStore: Record<number, any> = {}

const server = http.createServer((req, res) => {
  console.log(req.method, req.url)

  const config = portsConfigStore[req.socket.remotePort!]
  let destinationUrl: string = req.url || ''
  if (config) {
    destinationUrl = `${config.protocol}://${config.request.url}${destinationUrl}`
  }

  if (!destinationUrl) {
    console.error('ERROR: Bad destination')
    res.writeHead(500)
    res.end()
  }

  const parsedUrl = url.parse(destinationUrl)

  let dispatcher: any = http
  if (parsedUrl.protocol!.startsWith('https')) {
    dispatcher = https
  }

  const forwardedReq: http.ClientRequest = dispatcher.request({
    method: req.method,
    host: parsedUrl.hostname,
    port: parsedUrl.port,
    path: parsedUrl.path,
    headers: req.headers,
    rejectUnauthorized: false
  }, (fwres: http.IncomingMessage) => {
    res.writeHead(fwres.statusCode!, fwres.headers)
    fwres.pipe(res)
  })

  forwardedReq.on('error', err => {
    console.error('ERROR:', err.message)
    res.writeHead(500)
    res.end()
  })

  forwardedReq.end()
}).listen(MAIN_SERVER_PORT)

function isChar (char: number) {
  return char >= 0x20 && char < 0x7F
}

const tlsServer = tls.createServer({
  key: fs.readFileSync('ssl/domain.key'),
  cert: fs.readFileSync('ssl/domain.crt')
})

tlsServer.on('secureConnection', tlsSocket => {
  const config = portsConfigStore[tlsSocket.remotePort!]

  function http () {
    const srvSocket = net.connect(MAIN_SERVER_PORT, 'localhost', () => {
      const { localPort } = srvSocket
      portsConfigStore[localPort] = {
        protocol: 'https',
        httpConnector: srvSocket,
        ...config
      }

      srvSocket.on('end', () => {
        delete portsConfigStore[localPort]
      })

      srvSocket.pipe(tlsSocket)
      tlsSocket.pipe(srvSocket)
    })

    srvSocket.on('error', err => {
      console.error('ERROR:', err.message)
      tlsSocket.end()
    })
  }

  tlsSocket.once('readable', () => {
    const data: Buffer = tlsSocket.read()
    if (isChar(data[0]) && isChar(data[1]) && isChar(data[2])) {
      http()
    } else {
      return tlsSocket.end()
    }

    tlsSocket.unshift(data)
  })
})

getPort().then(tlsPort => {
  tlsServer.listen(tlsPort)
  server.on('connect', (req: http.IncomingMessage, resSocket: net.Socket, head: Buffer) => {
    console.log('CONNECT', req.url)

    const srvSocket = net.connect(tlsPort, 'localhost', () => {
      resSocket.write(
        'HTTP/1.1 200 Connection Established\r\n' +
        'Proxy-agent: Node.js-Proxy\r\n' +
        '\r\n'
      )

      const { localPort } = srvSocket
      portsConfigStore[localPort] = {
        request: req,
        response: resSocket,
        tlsConnector: srvSocket
      }

      srvSocket.on('end', () => {
        delete portsConfigStore[localPort]
      })

      srvSocket.write(head)
      srvSocket.pipe(resSocket)
      resSocket.pipe(srvSocket)
    })

    srvSocket.on('error', err => {
      console.error('ERROR:', err.message)
      resSocket.end()
    })
  })
})
