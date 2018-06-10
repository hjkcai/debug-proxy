import { Session } from './session'
import { DebugProxyServer } from './server'

export const ADAPTER_INITIALIZED = Symbol('adapterInitialized')

/** Adapter to a specific protocol */
export interface Adapter {
  name: string
  [ADAPTER_INITIALIZED]?: boolean

  /**
   * One-time initialization before the main proxy server is listening
   * 
   * @param server The main proxy server
   */
  initialize? (server: DebugProxyServer): void | Promise<void>

  /**
   * Check if the stream matches the protocol.  
   * This function *must* be a pure function.
   * 
   * @param data The first data chunk from the user
   */
  matchProtocol (data: Buffer): boolean

  /**
   * Handler for the protocol
   */
  handler (session: Session, server: DebugProxyServer): void
}
