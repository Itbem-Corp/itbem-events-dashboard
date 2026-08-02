import assert from 'node:assert/strict'
import fs from 'node:fs'

const contract = JSON.parse(fs.readFileSync('.contracts/itbem-product-contract/contract/products.v1.json', 'utf8'))
const catalog = JSON.parse(fs.readFileSync('src/products/catalog.json', 'utf8'))
const requestContext = JSON.parse(fs.readFileSync('.contracts/itbem-product-contract/contract/request-context.v1.json', 'utf8'))
const localRequestContext = JSON.parse(fs.readFileSync('src/contracts/request-context.v1.json', 'utf8'))

assert.equal(contract.schemaVersion, 1)
const expected = Object.fromEntries(contract.products.map((product) => [product.code, {
  identity: product.identity,
  deployment: {
    organizationCode: product.code,
    hostname: product.deployment.dashboardHostname,
    hostnames: product.deployment.dashboardHostnames,
    localHostnames: product.deployment.localDashboardHostnames,
    apiHostname: product.deployment.apiHostname,
    clientIdEnv: product.deployment.cognitoClientEnv
  }
}]))
assert.deepEqual(catalog, expected, 'dashboard catalog must match the pinned product contract')
assert.deepEqual(localRequestContext, requestContext, 'dashboard request context must match the pinned product contract')
