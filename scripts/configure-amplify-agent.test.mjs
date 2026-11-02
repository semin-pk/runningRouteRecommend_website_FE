import assert from 'node:assert/strict'
import test from 'node:test'
import { agentRules, applyAgentRules, mergeAgentRules } from './configure-amplify-agent.mjs'

test('agent rules precede SPA fallback and preserve other rule content/order', () => {
  const previous = [
    { source: '/login/success', target: '/index.html', status: '200' },
    { source: '/<*>', target: '/index.html', status: '404-200' },
  ]
  const merged = mergeAgentRules(previous)
  assert.deepEqual(merged.slice(0, 2), agentRules)
  assert.deepEqual(merged.slice(2), previous)
  assert.equal(merged.some(rule => rule.source === '/agent/assets/<*>'), false)
})

test('old exact agent rules are replaced without duplicates', () => {
  const merged = mergeAgentRules([{ source: '/agent', target: '/index.html', status: '301' }])
  assert.deepEqual(merged, agentRules)
  assert.deepEqual(mergeAgentRules(merged), merged)
})

test('AWS update is verified by reading the actual app rules back', async () => {
  let rules = [{ source: '/<*>', target: '/index.html', status: '404-200' }]
  const calls = []
  const client = {
    async send(command) {
      calls.push(command)
      if (command.constructor.name === 'UpdateAppCommand') {
        rules = command.input.customRules
        return { app: { customRules: rules } }
      }
      return { app: { customRules: rules } }
    },
  }
  assert.deepEqual(await applyAgentRules(client, 'test-app'), { status: 'updated', applied: true })
  assert.deepEqual(calls.map(call => call.constructor.name), ['GetAppCommand', 'UpdateAppCommand', 'GetAppCommand'])
  assert.equal(calls[1].input.appId, 'test-app')
  assert.equal(rules.length, 3)
})

test('repeated builds do not issue an unnecessary AWS update', async () => {
  const calls = []
  const client = {
    async send(command) {
      calls.push(command)
      return { app: { customRules: agentRules.map(rule => ({ status: rule.status, target: rule.target, source: rule.source, condition: null })) } }
    },
  }
  assert.deepEqual(await applyAgentRules(client, 'test-app'), { status: 'unchanged', applied: true })
  assert.equal(calls.length, 1)
})
