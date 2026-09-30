// Isolated visual fixture: no authentication bypass, backend, cookies or secrets.
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { createServer } from 'vite'
const root = path.resolve(import.meta.dirname, '../..')
const server = await createServer({
  root,
  configFile: false,
  plugins: [react()],
  resolve: { alias: { '@': path.join(root, 'src') } },
  server: { host: '127.0.0.1', port: 3018, strictPort: true },
})
await server.listen()
console.log('Synthetic component preview: http://127.0.0.1:3018/tools/agent-experience/index.html')
