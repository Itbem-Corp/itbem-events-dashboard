import path from 'path'
import { cleanupEphemeralAuthState } from './local-auth'

export default function teardown() {
  cleanupEphemeralAuthState(
    process.env.E2E_ID_TOKEN,
    path.join(process.cwd(), 'tests/e2e/.auth/session.json'),
  )
}
