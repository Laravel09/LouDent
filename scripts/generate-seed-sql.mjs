// Generates supabase/migrations/20261119000005_seed_catalogue.sql from the
// legacy server/src/seed-data.json (single source of truth, same category map
// as server/src/seed.js). Usage: node scripts/generate-seed-sql.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const seed = JSON.parse(readFileSync(path.join(root, 'server/src/seed-data.json'), 'utf8'))
const ORTHO = new Set(['braces-combo', 'braces-install', 'retainer'])

const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)
function sqlTime(s) {
  const m = s.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i)
  if (!m) throw new Error(`bad time ${s}`)
  const h = (Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

const out = []
out.push(`-- ============================================================================
-- LouDent migration 5/5 — clinic catalogue seed (GENERATED, do not hand-edit)
-- Source: server/src/seed-data.json via scripts/generate-seed-sql.mjs
-- Seeds ONLY public clinic content. Creates no user accounts and no
-- appointments. ON CONFLICT DO NOTHING: re-running never overwrites edits.
-- ============================================================================
`)
out.push('INSERT INTO public.dentists (id, name, title, specialty, experience_years, bio, photo_url) VALUES')
out.push(seed.dentists.map((d) => `  (${[d.id, d.name, d.title, d.specialty].map(q).join(', ')}, ${Number(d.experience)}, ${q(d.bio)}, ${q(d.photo)})`).join(',\n') + '\nON CONFLICT (id) DO NOTHING;\n')

out.push('INSERT INTO public.services (id, name, category, duration_minutes, price, icon, description, preparation, involves) VALUES')
out.push(seed.services.map((s) => `  (${q(s.id)}, ${q(s.name)}, ${q(ORTHO.has(s.id) ? 'Orthodontics' : 'General Dentistry')}, ${Number(s.duration)}, ${Number(s.price)}, ${q(s.icon)}, ${q(s.description)}, ${q(s.preparation)}, ${q(JSON.stringify(s.involves))}::jsonb)`).join(',\n') + '\nON CONFLICT (id) DO NOTHING;\n')

const links = []
for (const d of seed.dentists) for (const s of seed.services.filter((x) => d.services.includes(x.name))) links.push(`  (${q(d.id)}, ${q(s.id)})`)
out.push('INSERT INTO public.dentist_services (dentist_id, service_id) VALUES')
out.push(links.join(',\n') + '\nON CONFLICT DO NOTHING;\n')

const days = []
for (const [dentistId, list] of Object.entries(seed.availability))
  list.forEach((a, i) => days.push(`  (${q(dentistId)}, ${i}, ${a.available ? 'true' : 'false'}, '${sqlTime(a.start)}', '${sqlTime(a.end)}', ${a.breakStart ? `'${sqlTime(a.breakStart)}'` : 'NULL'}, ${a.breakEnd ? `'${sqlTime(a.breakEnd)}'` : 'NULL'})`))
out.push('INSERT INTO public.dentist_schedules (dentist_id, day_of_week, available, start_time, end_time, break_start, break_end) VALUES')
out.push(days.join(',\n') + '\nON CONFLICT DO NOTHING;\n')

const target = path.join(root, 'supabase/migrations/20261119000005_seed_catalogue.sql')
writeFileSync(target, out.join('\n'))
console.log(`wrote ${path.relative(root, target)}: ${seed.dentists.length} dentists, ${seed.services.length} services, ${links.length} links, ${days.length} schedule days`)
