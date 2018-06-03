import * as net from 'net'
import * as url from 'url'
import * as http from 'http'

const server = http.createServer((req, res) => {
  console.log(req.method, req.url)

  const parsedUrl = url.parse(req.url || '')
  const forwardedReq = http.request({
    method: req.method,
    host: parsedUrl.host,
    port: parsedUrl.port,
    path: parsedUrl.path,
    headers: req.headers
  }, fwres => {
    res.writeHead(fwres.statusCode!, fwres.headers)
    fwres.pipe(res)
  })

  forwardedReq.on('error', err => {
    console.error('ERROR:', err.message)
    res.end()
  })

  forwardedReq.end()
}).listen(8888)

server.on('connect', (req: http.IncomingMessage, resSocket: net.Socket, head: Buffer) => {
  console.log('CONNECT', req.url)
  const srvUrl = url.parse(`http://${req.url}`)
  const srvSocket = net.connect(Number(srvUrl.port!), srvUrl.hostname, () => {
    resSocket.write('HTTP/1.1 200 Connection Established\r\n' +
                    'Proxy-agent: Node.js-Proxy\r\n' +
                    '\r\n')
    srvSocket.write(head)
    srvSocket.pipe(resSocket)
    resSocket.pipe(srvSocket)
  })

  srvSocket.on('error', err => {
    console.error('ERROR:', err.message)
    resSocket.end()
  })
})
