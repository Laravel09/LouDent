// Packages the clean LouDent Supabase project into a verified downloadable ZIP,
// excluding node_modules, dist, .git, .env*, and temporary outputs.
// Usage: node scripts/package-zip.mjs

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const parentDir = path.resolve(root, '..')
const stageRoot = path.join(parentDir, '_loudent_zip_stage')
const stageProject = path.join(stageRoot, 'LouDent')
const zipPath = path.join(parentDir, 'LouDent_Supabase_Ready.zip')

const EXCLUDE_NAMES = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.vite',
  '.cache',
  'coverage',
  'playwright-report',
  'test-results',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'output',
  'reports',
])

function shouldCopy(src) {
  const rel = path.relative(root, src)
  if (!rel) return true
  const parts = rel.split(path.sep)
  const base = parts[parts.length - 1]
  if (EXCLUDE_NAMES.has(base)) return false
  if (base.startsWith('.env') && !base.endsWith('.example')) return false
  if (base.endsWith('.log') || base.endsWith('.tsbuildinfo')) return false
  return true
}

rmSync(stageRoot, { recursive: true, force: true })
rmSync(zipPath, { force: true })
mkdirSync(stageProject, { recursive: true })

cpSync(root, stageProject, {
  recursive: true,
  filter: shouldCopy,
})

execFileSync(
  'powershell',
  [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${stageProject}' -DestinationPath '${zipPath}' -Force`,
  ],
  { stdio: 'inherit' }
)

rmSync(stageRoot, { recursive: true, force: true })

if (!existsSync(zipPath)) {
  throw new Error('ZIP archive was not created.')
}
const sizeKb = (statSync(zipPath).size / 1024).toFixed(1)

// Verify ZIP integrity by reading archive entries via .NET ZipFile
const verifyOut = execFileSync(
  'powershell',
  [
    '-NoProfile',
    '-Command',
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z = [System.IO.Compression.ZipFile]::OpenRead('${zipPath}'); $count = $z.Entries.Count; $bad = $z.Entries | Where-Object { $_.FullName -match 'node_modules|\\.git/|(?<!example)$' -and $_.FullName -match '\\.env' }; $z.Dispose(); Write-Output "ENTRIES=$count"; if ($bad) { Write-Error "Forbidden entry in zip"; exit 1 }`,
  ],
  { encoding: 'utf8' }
).trim()

console.log(`Created and verified ${zipPath} (${sizeKb} KB, ${verifyOut})`)
