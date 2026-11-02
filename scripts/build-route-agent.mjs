import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const settings = { ...loadEnv('production', projectRoot, 'VITE_'), ...process.env }
const apiUrl = settings.VITE_ROUTE_AGENT_API_BASE_URL?.trim()

if (!apiUrl) {
  console.log('Route Agent build skipped: set VITE_ROUTE_AGENT_API_BASE_URL to enable /agent/.')
  process.exit(0)
}

const result = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['--prefix', 'route-agent/frontend', 'run', 'build', '--', '--outDir', '../../dist/agent'],
  {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...settings,
      VITE_API_BASE_URL: apiUrl,
      VITE_KAKAO_MAP_KEY: settings.VITE_KAKAO_MAP_KEY || settings.VITE_KAKAO_JS_KEY || '',
    },
  },
)

if (result.error) throw result.error
process.exit(result.status ?? 1)
