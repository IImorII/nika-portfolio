import { build, preview } from 'vite'

// Vite's dependency prebundler can be blocked by restricted Windows sandboxes.
// Rollup's watch build serves the same app without that prebundle step.
await build()
const watcher = await build({ build: { watch: {} } })
const server = await preview({ preview: { host: '127.0.0.1', port: 5173 } })

console.log(`\nNIKA development preview: ${server.resolvedUrls.local[0]}`)
console.log('Changes rebuild automatically; refresh the browser to see them.\n')

watcher.on('event', event => {
  if (event.code === 'ERROR') console.error(event.error)
})

const stop = async () => {
  await watcher.close()
  await new Promise(resolve => server.httpServer.close(resolve))
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
