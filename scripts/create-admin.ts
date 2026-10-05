// Create or update the OWNER account for a business. Never prints the password.
//
// Env:
//   ADMIN_EMAIL      required
//   ADMIN_NAME       required when creating a user (defaults to existing name on update)
//   ADMIN_PASSWORD   optional if stdin is a TTY (hidden prompt); otherwise required. Min 12 chars.
//   BUSINESS_SLUG    optional. Business lookup: slug if given -> else the only business ->
//                    else (no business exists) create one using BUSINESS_NAME (default
//                    "Subh Laxmi Collection") and BUSINESS_SLUG (default "vastraa-wholesale").
//                    If several businesses exist and no slug is given, the script aborts.
import 'dotenv/config'
import argon2 from 'argon2'
import { PrismaClient, Role } from '@prisma/client'

const MIN_LENGTH = 12
function fail(msg: string): never { console.error(`error: ${msg}`); process.exit(1) }

function promptHidden(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    process.stdout.write(label)
    let value = ''
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8')
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n' || c === '\u0004') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); return resolve(value) }
        if (c === '\u0003') { stdin.setRawMode(false); process.stdout.write('\n'); return reject(new Error('cancelled')) }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1)
        else value += c
      }
    }
    stdin.on('data', onData)
  })
}

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('ADMIN_EMAIL is required and must be a valid email address.')
  let password = process.env.ADMIN_PASSWORD
  if (!password) {
    if (!process.stdin.isTTY) fail('ADMIN_PASSWORD is not set and there is no TTY for a prompt.')
    password = await promptHidden('Owner password (hidden): ')
    const again = await promptHidden('Repeat password: ')
    if (password !== again) fail('Passwords do not match.')
  }
  if (!password || password.length < MIN_LENGTH) fail(`Password must be at least ${MIN_LENGTH} characters.`)
  if (!process.env.DATABASE_URL) fail('DATABASE_URL is not set.')

  const db = new PrismaClient()
  try {
    const slug = process.env.BUSINESS_SLUG?.trim()
    let business = slug ? await db.business.findUnique({ where: { slug } }) : null
    if (!business && !slug) {
      const all = await db.business.findMany({ take: 2 })
      if (all.length > 1) fail('Multiple businesses exist; set BUSINESS_SLUG.')
      business = all[0] ?? null
    }
    let createdBusiness = false
    if (!business) {
      business = await db.business.create({ data: { name: process.env.BUSINESS_NAME?.trim() || 'Subh Laxmi Collection', slug: slug || 'vastraa-wholesale' } })
      createdBusiness = true
    }

    // Same argon2 call as backend/src/auth.ts verifies against (argon2 default
    // options = argon2id; matches prisma/seed.ts which sets { type: argon2id }).
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
    const existing = await db.user.findUnique({ where: { businessId_email: { businessId: business.id, email } } })
    if (existing) {
      await db.user.update({ where: { id: existing.id }, data: { passwordHash, role: Role.OWNER, active: true, ...(process.env.ADMIN_NAME?.trim() ? { name: process.env.ADMIN_NAME.trim() } : {}) } })
      const { count } = await db.session.deleteMany({ where: { userId: existing.id } })
      console.log(`Updated OWNER ${email} in business "${business.slug}"; revoked ${count} session(s).`)
    } else {
      const name = process.env.ADMIN_NAME?.trim()
      if (!name) fail('ADMIN_NAME is required when creating a new user.')
      await db.user.create({ data: { businessId: business.id, name, email, passwordHash, role: Role.OWNER } })
      console.log(`Created OWNER ${email} in business "${business.slug}"${createdBusiness ? ' (new business created)' : ''}.`)
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => { console.error('error:', e instanceof Error ? e.message : e); process.exit(1) })
