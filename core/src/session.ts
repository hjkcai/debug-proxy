import * as net from 'net'
import * as url from 'url'
import * as http from 'http'

/** Data across multiple socket connections */
export interface Session {
  [key: string]: any

  /** A unique auto-increment session id */
  id: number

  request: http.IncomingMessage
  response: http.ServerResponse
  socket: net.Socket

  url: url.UrlWithStringQuery
}

export interface CreateSessionData {
  request: http.IncomingMessage,
  response?: http.ServerResponse,
  socket?: net.Socket,
  url?: string
}

export class SessionManager {
  private autoIncrement = 0
  private sessions = new Map<string, Session>()

  public create (data: CreateSessionData): Session {
    const session: Session = {
      id: ++this.autoIncrement,
      request: data.request,
      response: data.response!,
      socket: data.socket || data.request.socket,
      url: url.parse(data.url || data.request.url || '', false)
    }

    const { socket } = session
    if (!socket) throw new TypeError('No socket found')

    return this.createSession(socket, this.getSessionKey(socket), session)
  }

  public get (socket: net.Socket): Session | null {
    return this.sessions.get(this.getSessionKey(socket)) || null
  }

  public getLinked (socket: net.Socket): Session | null {
    return this.sessions.get(this.getLinkedSessionKey(socket)) || null
  }

  public link (originalSocket: net.Socket, newSocket: net.Socket): Session {
    if (newSocket.remoteAddress !== newSocket.localAddress) {
      throw new Error('The socket to link must have the same remoteAddress and localAddress')
    }

    const session = this.get(originalSocket)
    if (session == null) throw new TypeError('The original session is not exist')

    const newSessionKey = this.getLinkedSessionKey(newSocket)
    return this.createSession(newSocket, newSessionKey, session)
  }

  private getSessionKey (socket: net.Socket) {
    if (!socket.remotePort) {
      throw new TypeError('Unix Domain Socket is not supported')
    }

    return socket.remotePort.toString()
  }

  private getLinkedSessionKey (socket: net.Socket) {
    return socket.localPort.toString()
  }

  private createSession (socket: net.Socket, sessionKey: string, session: Session) {
    if (this.sessions.has(sessionKey)) throw new TypeError('Session already exists')

    const cleanSession = () => {
      // Automatically remove the session when the socket ends or is closed
      this.sessions.delete(sessionKey)
    }

    socket.on('end', cleanSession)
    socket.on('close', cleanSession)

    this.sessions.set(sessionKey, session)
    return session
  }
}
