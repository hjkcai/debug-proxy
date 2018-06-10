import * as net from 'net'
import * as url from 'url'
import * as http from 'http'
import * as https from 'https'

import { Session, SessionManager } from './session'
import { Adapter, ADAPTER_INITIALIZED } from './adapter'

export interface ServerConfig {
  adapters?: Adapter[]
}

export class DebugProxyServer {
  public readonly sessions = new SessionManager()
  private server = http.createServer()

  private config: ServerConfig = {}
  private adapters: Adapter[] = []

  public constructor () {
    this.server.on('connect', this.handleTunnel.bind(this))
    this.server.on('request', this.handleRequest.bind(this))
  }

  public getConfig () {
    return this.config
  }

  public async setConfig (value?: ServerConfig) {
    this.config = value || {}
    this.adapters = this.config.adapters || []

    for (const adapter of this.adapters) {
      if (!adapter[ADAPTER_INITIALIZED] && adapter.initialize) {
        await adapter.initialize(this)
      }
    }
  }

  public listen (port: number, hostname?: string): Promise<void> {
    return new Promise(resolve => {
      this.server.listen(port, hostname, resolve)
    })
  }

  public async handleRawRequest (session: Session) {
    const adapter = await this.matchAdapter(session.socket)
    if (adapter) {
      adapter.handler(session, this)
    } else {
      // TODO: connect to upstream
    }
  }

  private matchAdapter (socket: net.Socket) {
    return new Promise<Adapter | null>((resolve, reject) => {
      // TODO: error handling
      socket.once('readable', () => {
        const data: Buffer = socket.read()
        if (Buffer.isBuffer(data)) {
          for (const adapter of this.adapters) {
            if (adapter.matchProtocol(data)) {
              resolve(adapter)
              break
            }
          }
        }

        resolve(null)
        socket.unshift(data)
      })
    })
  }

  private handleTunnel (req: http.IncomingMessage, socket: net.Socket, head: Buffer) {
    const session = this.sessions.create({ request: req })
    socket.write(
      'HTTP/1.1 200 Connection Established\r\n' +
      'Proxy-agent: Node.js-Proxy\r\n' +
      '\r\n'
    )

    console.log(`${session.id}\tTunnel to ${req.url}`)
    this.handleRawRequest(session)
  }

  private handleRequest (req: http.IncomingMessage, res: http.ServerResponse) {
    let session = this.sessions.get(req.socket)
    if (session != null && session.protocol === 'https') {
      session.socket = req.socket
      session.originalRequest = session.request
      session.socketChain.push(req.socket)

      session.request = req
      session.response = res
    } else {
      session = this.sessions.create({ request: req, response: res })
      session.protocol = 'http'
    }

    let destinationUrl: string = req.url || ''
    if (session && session.protocol !== 'http') {
      destinationUrl = `${session.protocol}://${session.hostname}${req.url}`
    }

    if (!destinationUrl) {
      console.error('ERROR: Bad destination')
      res.writeHead(500)
      res.end()
    }

    console.log(`${session.id}\t${req.method} ${destinationUrl}`)
    const parsedUrl = url.parse(destinationUrl)

    let dispatcher: any = http
    if (session.protocol === 'https') {
      dispatcher = https
    }

    const forwardedReq: http.ClientRequest = dispatcher.request({
      method: req.method,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.path,
      headers: req.headers,
      rejectUnauthorized: false
    }, (fwres: http.IncomingMessage) => {
      res.writeHead(fwres.statusCode!, fwres.headers)
      fwres.pipe(res)
    })

    forwardedReq.on('error', err => {
      console.error(session!.id, '\tERROR:', err.message)
      res.writeHead(500)
      res.end()
    })

    req.pipe(forwardedReq)
  }
}
