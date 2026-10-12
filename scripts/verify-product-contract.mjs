import assert from 'node:assert/strict'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const CALLER_ACCESS_SCOPE = 'caller-access'

// The dashboard sends X-Workspace-Mode: organization without X-Organization-ID
// for the caller-access workspace (src/lib/request-context.ts; EventiApp members
// and event clients through manifest.shell.memberWorkspace). The pinned
// contract must declare that scope, or its rules contradict what the dashboard
// sends and invite a backend "fix" that would lock those users out.
const CALLER_ACCESS_MESSAGE = [
  'request context: the dashboard sends X-Workspace-Mode: organization without X-Organization-ID',
  '(the caller-access workspace), so the pinned contract must declare',
  "rules.organizationRequiresOrganizationId=false and rules.organizationWithoutIdScope='caller-access'.",
  'Merge that itbem-product-contract change on main, move .contracts/itbem-product-contract to the merged',
  'commit and copy contract/request-context.v1.json to src/contracts/request-context.v1.json.',
].join(' ')

function expectedCatalog(contract) {
  return Object.fromEntries(contract.products.map((product) => [product.code, {
    identity: product.identity,
    deployment: {
      organizationCode: product.code,
      hostname: product.deployment.dashboardHostname,
      hostnames: product.deployment.dashboardHostnames,
      localHostnames: product.deployment.localDashboardHostnames,
      apiHostname: product.deployment.apiHostname,
      clientIdEnv: product.deployment.cognitoClientEnv,
      ownedDomains: product.deployment.ownedDomains,
      publicExperience: product.deployment.publicExperience
    }
  }]))
}

export function verifyProductContract({ contract, catalog, requestContext, localRequestContext }) {
  assert.equal(contract.schemaVersion, 1)
  assert.deepEqual(catalog, expectedCatalog(contract), 'dashboard catalog must match the pinned product contract')
  assert.deepEqual(localRequestContext, requestContext, 'dashboard request context must match the pinned product contract')
  const rules = requestContext.rules ?? {}
  assert.ok(
    rules.organizationRequiresOrganizationId === false && rules.organizationWithoutIdScope === CALLER_ACCESS_SCOPE,
    CALLER_ACCESS_MESSAGE
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'))
  try {
    verifyProductContract({
      contract: readJson('.contracts/itbem-product-contract/contract/products.v1.json'),
      catalog: readJson('src/products/catalog.json'),
      requestContext: readJson('.contracts/itbem-product-contract/contract/request-context.v1.json'),
      localRequestContext: readJson('src/contracts/request-context.v1.json'),
    })
  } catch (error) {
    console.error(`contract:check failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
