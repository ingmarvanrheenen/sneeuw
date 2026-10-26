// Klein los moduletje zodat repo.ts niet afhankelijk is van Supabase.
let currentUserId: string | null = null

export function getCurrentUserId() {
  return currentUserId
}

export function setCurrentUserId(id: string | null) {
  currentUserId = id
}
