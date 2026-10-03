// Guarded wrapper around the demo seed (prisma/seed.ts). The seed content is
// idempotent (upserts); this wrapper only decides whether it may run.
//
//   dev:   npx prisma db seed            (tsx scripts/seed-demo.ts)
//   prod:  ALLOW_DEMO_SEED=true SEED_ADMIN_PASSWORD='...' \
//            docker compose run --rm -e ALLOW_DEMO_SEED -e SEED_ADMIN_PASSWORD vastraa-api node dist-tools/scripts/seed-demo.js
//
// Normal container start never runs this.
if (process.env.NODE_ENV === 'production') {
  if (process.env.ALLOW_DEMO_SEED !== 'true') {
    console.error('Refusing to seed: NODE_ENV=production and ALLOW_DEMO_SEED is not "true".')
    console.error('Production databases are not seeded. Use `npm run admin:create` for the owner account.')
    process.exit(1)
  }
  const pw = process.env.SEED_ADMIN_PASSWORD
  if (!pw || pw === 'ChangeMe123!' || pw.length < 12) {
    console.error('Refusing to seed in production: set SEED_ADMIN_PASSWORD to a unique value of at least 12 characters (the built-in default password is public).')
    process.exit(1)
  }
  console.warn('WARNING: running the DEMO seed against a production database (ALLOW_DEMO_SEED=true).')
}
await import('../prisma/seed.js')
