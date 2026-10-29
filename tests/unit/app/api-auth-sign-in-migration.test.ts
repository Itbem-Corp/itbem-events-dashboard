import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({send:vi.fn()}))
vi.mock('@/lib/cognito-direct',()=>({authRequestIsSameOrigin:()=>true,getCognitoClient:()=>({send:mocks.send})}))
vi.mock('@/lib/auth-rate-limit',()=>({consumeAuthAttempt:()=>null,clearAuthAttempts:vi.fn()}))
vi.mock('@/lib/application-access',()=>({verifyApplicationAccess:vi.fn()}))
import {POST} from '@/app/api/auth/sign-in/route'
import {NextRequest} from 'next/server'
describe('pending invitation migration',()=>{
 beforeEach(()=>{vi.stubEnv('COGNITO_EVENTIAPP_CLIENT_ID','dedicated-client');vi.stubEnv('NODE_ENV','production');mocks.send.mockReset()})
 afterEach(()=>vi.unstubAllEnvs())
 it('offers recovery without treating a required reset as an outage',async()=>{
  mocks.send.mockRejectedValue(Object.assign(new Error('reset'),{name:'PasswordResetRequiredException'}))
  const result=await POST(new NextRequest('https://dashboard.eventiapp.com.mx/api/auth/sign-in',{method:'POST',headers:{Host:'dashboard.eventiapp.com.mx','Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.com',password:'test-only-password'})}))
  expect(result.status).toBe(409)
  expect(await result.json()).toEqual({code:'PASSWORD_RESET_REQUIRED',error:expect.stringContaining('Olvidé mi contraseña')})
  expect(result.headers.get('cache-control')).toContain('no-store')
  expect(result.cookies.get('session')).toBeUndefined()
 })
})
