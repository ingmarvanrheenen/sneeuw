// Nep-Supabase voor unit tests: legt elke query vast en geeft terug wat de test opgeeft.
// Gebruik: const sb = fakeSupabase(); vi.mock('../lib/supabase', () => ({ supabase: sb.client, hasBackend: true }))
export interface Call {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | 'upload' | 'rpc'
  payload?: unknown
  filters: [string, string, unknown][]
  single: boolean
}

type Responder = (call: Call) => { data?: unknown; error?: unknown }

export function fakeSupabase() {
  const calls: Call[] = []
  let respond: Responder = () => ({ data: [] })

  function from(table: string) {
    const call: Call = { table, op: 'select', filters: [], single: false }
    let recorded = false
    const record = () => {
      if (!recorded) calls.push(call)
      recorded = true
    }
    const b = {
      select: () => b,
      insert: (payload: unknown) => ((call.op = 'insert'), (call.payload = payload), b),
      update: (payload: unknown) => ((call.op = 'update'), (call.payload = payload), b),
      upsert: (payload: unknown) => ((call.op = 'upsert'), (call.payload = payload), b),
      delete: () => ((call.op = 'delete'), b),
      eq: (col: string, v: unknown) => (call.filters.push(['eq', col, v]), b),
      neq: (col: string, v: unknown) => (call.filters.push(['neq', col, v]), b),
      gt: (col: string, v: unknown) => (call.filters.push(['gt', col, v]), b),
      not: (col: string, o: string, v: unknown) => (call.filters.push([`not.${o}`, col, v]), b),
      in: (col: string, v: unknown) => (call.filters.push(['in', col, v]), b),
      order: () => b,
      limit: () => b,
      single: () => ((call.single = true), b),
      maybeSingle: () => ((call.single = true), b),
      then: (res: (v: { data: unknown; error: unknown }) => unknown, rej?: (e: unknown) => unknown) => {
        record()
        const r = respond(call)
        return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(res, rej)
      },
    }
    return b
  }

  // Storage: upload(path, blob) wordt vastgelegd als op 'upload' met table = bucket
  const storage = {
    from: (bucket: string) => ({
      upload: async (path: string, body: Blob) => {
        const call: Call = { table: bucket, op: 'upload', payload: { path, body }, filters: [], single: false }
        calls.push(call)
        const r = respond(call)
        return { data: r.data ?? { path }, error: r.error ?? null }
      },
      createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://fake/${path}` }, error: null }),
    }),
  }

  // rpc(naam, args) wordt vastgelegd als op 'rpc' met table = functienaam
  async function rpc(fn: string, args: unknown) {
    const call: Call = { table: fn, op: 'rpc', payload: args, filters: [], single: false }
    calls.push(call)
    const r = respond(call)
    return { data: r.data ?? null, error: r.error ?? null }
  }

  const auth = { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) }

  return {
    client: { from, storage, rpc, auth } as unknown,
    calls,
    respond(fn: Responder) {
      respond = fn
    },
    reset() {
      calls.length = 0
      respond = () => ({ data: [] })
    },
  }
}
