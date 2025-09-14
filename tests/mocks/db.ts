type Player = { id: number; sleeperId?: string | null; name: string; position?: string | null; team?: string | null }
type Source = { id: number; name: string }
type Valuation = { id: number; playerId: number; sourceId: number; value: number; capturedAt: Date }

const state = {
  players: [] as Player[],
  sources: [] as Source[],
  valuations: [] as Valuation[],
}
let ids = { player: 1, source: 1, valuation: 1 }

export const prisma = {
  player: {
    createMany: async ({ data }: any) => {
      let count = 0
      for (const d of data as any[]) {
        if (!state.players.find(p => p.sleeperId && d.sleeperId && p.sleeperId === d.sleeperId)) {
          state.players.push({ id: ids.player++, name: d.name, sleeperId: d.sleeperId ?? null, position: d.position ?? null, team: d.team ?? null })
          count++
        }
      }
      return { count }
    },
    upsert: async ({ where, update, create }: any) => {
      let p = state.players.find(pl => pl.sleeperId === where.sleeperId)
      if (p) {
        p = Object.assign(p, update)
        return p
      }
      const np = { id: ids.player++, sleeperId: create.sleeperId ?? null, name: create.name, position: create.position ?? null, team: create.team ?? null }
      state.players.push(np)
      return np
    },
    findMany: async ({ where, take, orderBy }: any) => {
      let arr = [...state.players]
      if (where?.name?.contains) arr = arr.filter(p => p.name.toLowerCase().includes(where.name.contains.toLowerCase()))
      if (where?.position) arr = arr.filter(p => p.position === where.position)
      arr.sort((a, b) => a.name.localeCompare(b.name))
      return arr.slice(0, take || 50)
    },
    findFirst: async ({ where }: any) => state.players.find(p => p.name === where.name) || null,
    create: async ({ data }: any) => { const np = { id: ids.player++, name: data.name, sleeperId: null, position: null, team: null }; state.players.push(np); return np },
  },
  source: {
    upsert: async ({ where, create }: any) => {
      let s = state.sources.find(x => x.name === where.name)
      if (s) return s
      const ns = { id: ids.source++, name: create.name }
      state.sources.push(ns)
      return ns
    },
    findUnique: async ({ where }: any) => state.sources.find(s => s.name === where.name) || null,
  },
  valuation: {
    create: async ({ data }: any) => {
      const v = { id: ids.valuation++, playerId: data.playerId, sourceId: data.sourceId, value: data.value, capturedAt: data.capturedAt }
      state.valuations.push(v)
      return v
    },
    findMany: async ({ where, orderBy, take, include }: any) => {
      let arr = [...state.valuations]
      if (where?.sourceId) arr = arr.filter(v => v.sourceId === where.sourceId)
      arr.sort((a, b) => +b.capturedAt - +a.capturedAt)
      arr = arr.slice(0, take || 1000)
      if (include?.player || include?.source) {
        return arr.map(v => ({
          ...v,
          player: include?.player ? state.players.find(p => p.id === v.playerId)! : undefined,
          source: include?.source ? state.sources.find(s => s.id === v.sourceId)! : undefined,
        }))
      }
      return arr
    },
  },
  __state: state,
}

