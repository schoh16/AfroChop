export function avatarUrl(name: string, existing?: string | null) {
  return existing || `https://api.dicebear.com/9.x/avataaars/png?seed=${encodeURIComponent(name)}&size=256&backgroundColor=f8eedd&skinColor=614335,ae5d29,d08b5b&hairColor=2c1b18&top=curly,dreads01,dreads02,fro,froBand,shortCurly,shortFlat,shortRound,bigHair,frizzle,bun&facialHairColor=2c1b18&clothing=blazerAndShirt,blazerAndSweater,collarAndSweater&clothesColor=262e33,3c4f5c,65c9ff&mouth=smile,twinkle&eyes=default,happy&eyebrows=default,defaultNatural,flatNatural&accessoriesProbability=0&facialHairProbability=20`;
}
