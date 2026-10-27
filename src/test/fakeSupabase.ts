// Nep-Supabase voor unit tests: legt elke query vast en geeft terug wat de test opgeeft.
// Gebruik: const sb = fakeSupabase(); vi.mock('../lib/supabase', () => ({ supabase: sb.client, hasBackend: true }))
export interface Call {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete'
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
      delete: () => ((call.op = 'delete'), b),
      eq: (col: string, v: unknown) => (call.filters.push(['eq', col, v]), b),
      neq: (col: string, v: unknown) => (call.filters.push(['neq', col, v]), b),
      not: (col: string, o: string, v: unknown) => (call.filters.push([`not.${o}`, col, v]), b),
      in: (col: string, v: unknown) => (call.filters.push(['in', col, v]), b),
      order: () => b,
      limit: () => b,
      single: () => ((call.single = true), b),
      then: (res: (v: { data: unknown; error: unknown }) => unknown, rej?: (e: unknown) => unknown) => {
        record()
        const r = respond(call)
        return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(res, rej)
      },
    }
    return b
  }

  return {
    client: { from } as unknown,
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
