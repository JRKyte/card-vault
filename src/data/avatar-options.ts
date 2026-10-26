// Avatar choices on the Settings screen. Each `cardId` was resolved from pokemontcg.io
// (`!name:<name>`, newest set first). Set one to null and the app looks it up at runtime.
export const AVATAR_OPTIONS: { name: string; cardId: string | null }[] = [
  { name: 'Charizard', cardId: 'me55c-4' },
  { name: 'Pikachu', cardId: 'me55c-58' },
  { name: 'Gengar', cardId: 'me55c-94' },
  { name: 'Squirtle', cardId: 'sv7-148' },
  { name: 'Bulbasaur', cardId: 'me1-133' },
  { name: 'Eevee', cardId: 'me55-116' },
  { name: 'Snorlax', cardId: 'me55-119' },
  { name: 'Mewtwo', cardId: 'me55-63' },
  { name: 'Lucario', cardId: 'me55-83' },
]
