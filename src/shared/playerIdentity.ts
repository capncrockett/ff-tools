export function playerIdentityKey(name: string, position: string, removeSuffix = false) {
  const base = removeSuffix ? name.replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/i, '') : name
  const normalized = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  return `${normalized}:${position}`
}
