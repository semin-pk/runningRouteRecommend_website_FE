import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { AmplifyClient, GetAppCommand, UpdateAppCommand } from '@aws-sdk/client-amplify'

const TARGET_APP_ID = 'd26hsuzbpwq4zg'
export const agentRules = [
  { source: '/agent', target: '/agent/index.html', status: '200' },
  { source: '/agent/', target: '/agent/index.html', status: '200' },
]

export function mergeAgentRules(existing = []) {
  return [
    ...agentRules.map(rule => ({ ...rule })),
    ...existing.filter(rule => !agentRules.some(agent => agent.source === rule.source)),
  ]
}

function comparable(rules) {
  return JSON.stringify(rules.map(rule => ({
    source: rule.source, target: rule.target, status: rule.status, condition: rule.condition || null,
  })))
}

export async function applyAgentRules(client, appId) {
  const { app } = await client.send(new GetAppCommand({ appId }), { abortSignal: AbortSignal.timeout(15000) })
  if (!app) throw new Error('AmplifyAppNotFound')
  const existing = app.customRules || []
  const customRules = mergeAgentRules(existing)
  if (comparable(existing) === comparable(customRules)) return { status: 'unchanged', applied: true }
  await client.send(new UpdateAppCommand({ appId, customRules }), { abortSignal: AbortSignal.timeout(15000) })
  const verified = await client.send(new GetAppCommand({ appId }), { abortSignal: AbortSignal.timeout(15000) })
  if (comparable(verified.app?.customRules || []) !== comparable(customRules)) {
    throw new Error('AmplifyRewriteVerificationFailed')
  }
  return { status: 'updated', applied: true }
}

export async function configureAmplifyAgent(env = process.env) {
  const appId = env.ROUTE_AGENT_AMPLIFY_APP_ID || TARGET_APP_ID
  const region = env.AWS_REGION || env.AWS_DEFAULT_REGION || 'ap-northeast-2'
  let rewrites = { status: 'not-amplify', applied: false }
  if (env.AWS_APP_ID && env.AWS_APP_ID !== appId) {
    rewrites.status = 'different-app'
  } else if (env.AWS_BRANCH && env.AWS_BRANCH !== 'main') {
    rewrites.status = 'preview-branch'
  } else if (env.AWS_APP_ID || env.ROUTE_AGENT_APPLY_AMPLIFY_RULES === '1') {
    const client = new AmplifyClient({ region, maxAttempts: 2 })
    try {
      rewrites = await applyAgentRules(client, appId)
    } catch (error) {
      rewrites = { status: 'needs-aws-permission', applied: false, error_code: error.name || 'UnknownError' }
      console.warn(`Route Agent rewrites were not applied (${rewrites.error_code}). The Amplify build role needs amplify:GetApp and amplify:UpdateApp for ${appId}.`)
    } finally {
      client.destroy()
    }
  }
  const projectRoot = fileURLToPath(new URL('../', import.meta.url))
  const file = resolve(projectRoot, 'dist/agent/deployment-info.json')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({
    commit: env.AWS_COMMIT_ID || env.CODEBUILD_RESOLVED_SOURCE_VERSION || null,
    branch: env.AWS_BRANCH || null,
    built_at: new Date().toISOString(),
    rewrites,
  }, null, 2))
  console.log(`Route Agent rewrite status: ${rewrites.status}`)
  return rewrites
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await configureAmplifyAgent()
}
