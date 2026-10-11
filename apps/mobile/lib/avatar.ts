export function avatarUrl(name: string, existing?: string | null) {
  return existing || `https://api.dicebear.com/9.x/avataaars/png?seed=${encodeURIComponent(name)}&size=256&backgroundColor=f8eedd`;
}
