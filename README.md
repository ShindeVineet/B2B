# LeadMap

B2B lead import, geographic store matching, and ground-rep assignment.

## Run locally

The configured PostgreSQL database must be running. This workspace already has
seeded demo data; do not reseed it just to start the app.

```sh
npm install
npm run dev
```

Open http://localhost:3000. The development and production build scripts use
Webpack to avoid the local Turbopack CSS-worker port failure.

Demo sign-in: `admin@leadmap.com` / `LeadMap@123`.
Other seeded roles include `manager.south@leadmap.com` and
`analyst@leadmap.com`, using the same demo password. These are local demo accounts.

## First-time database setup

Set `DATABASE_URL` to a PostgreSQL database and `JWT_SECRET` to a randomly generated
secret in `.env`. Then, on a new development database:

```sh
npx prisma generate
npx prisma db push
npm run seed
```

The seed loads the bundled PIN dataset, stores, leads, and demo users. It updates
existing seed records, so use it deliberately.

## Checks

```sh
npm run lint
npm test
npm run build
```

With the development server and database running, execute:

```sh
node scripts/smoke-test.mjs
```

The smoke test checks authentication for all roles, page responses, import and
deduplication, manual lead creation, assignment, store CRUD, and authorization.
It creates uniquely named records and removes them in a `finally` block.
Use `TEST_BASE_URL` and `TEST_PASSWORD` to override its local defaults.

For production locally: `npm run build` followed by `npm start`.
See `DEVELOPMENT-LOG.md` for verification history and remaining Phase 1 scope.

Additional workflow checks (development server running):

```sh
node scripts/workflow-test.mjs
```

This covers monthly plans, consultation submission, visit completion, and scoped
rep location edits with temporary records. `scripts/browser-check.mjs` additionally
checks rendered interactions against an isolated Chrome DevTools session on port
9223; it creates and cleans up one temporary assigned lead.

In the rep portal, use **Build My Route**, select leads, then preview/open the
route. Missing coordinates prompt for location input before route creation. Longer
routes offer sequential Google Maps leg links so mobile browsers keep every stop.
