// What she can find while you're away, and the sets they make on her shelf.
// Its own module so the economy (sets count toward the clover rate) and the
// simulation (finds) can both use it without importing each other.

/** Event finds turn up mostly while their event runs (world.ts EVENTS). */
/** Keepsakes only come from wild visitors (wildlife.ts), never from finds. */
export interface Collectible { id: string; name: string; rarity: 'common' | 'rare' | 'event' | 'keepsake' }
export const COLLECTIBLES: Collectible[] = [
  { id: 'pebble', name: 'Shiny pebble', rarity: 'common' },
  { id: 'feather', name: 'Blue feather', rarity: 'common' },
  { id: 'acorn', name: 'Acorn', rarity: 'common' },
  { id: 'flower', name: 'Pressed flower', rarity: 'common' },
  { id: 'seaglass', name: 'Sea glass', rarity: 'common' },
  { id: 'shell', name: 'Snail shell', rarity: 'common' },
  { id: 'pinecone', name: 'Pine cone', rarity: 'common' },
  { id: 'button', name: 'Lost button', rarity: 'common' },
  { id: 'marble', name: 'Marble', rarity: 'rare' },
  { id: 'lucky', name: 'Four-leaf clover', rarity: 'rare' },
  { id: 'key', name: 'Tiny key', rarity: 'rare' },
  { id: 'star', name: 'Star stone', rarity: 'rare' },
  // seasonal: four per event
  { id: 'snowflake', name: 'Snowflake charm', rarity: 'event' },
  { id: 'mitten', name: 'Lost mitten', rarity: 'event' },
  { id: 'icicle', name: 'Glass icicle', rarity: 'event' },
  { id: 'snowball', name: 'Snowball', rarity: 'event' },
  { id: 'petal', name: 'Pink petal', rarity: 'event' },
  { id: 'bee', name: 'Sleepy bee', rarity: 'event' },
  { id: 'robinegg', name: 'Robin eggshell', rarity: 'event' },
  { id: 'ladybug', name: 'Ladybug', rarity: 'event' },
  { id: 'firefly', name: 'Firefly jar', rarity: 'event' },
  { id: 'cherry', name: 'Cherries', rarity: 'event' },
  { id: 'butterfly', name: 'Paper butterfly', rarity: 'event' },
  { id: 'daisy', name: 'Daisy', rarity: 'event' },
  { id: 'maple', name: 'Maple leaf', rarity: 'event' },
  { id: 'conker', name: 'Conker', rarity: 'event' },
  { id: 'chestnut', name: 'Chestnut', rarity: 'event' },
  { id: 'wheat', name: 'Wheat sheaf', rarity: 'event' },
  { id: 'candy', name: 'Wrapped candy', rarity: 'event' },
  { id: 'bat', name: 'Felt bat', rarity: 'event' },
  { id: 'cobweb', name: 'Cobweb', rarity: 'event' },
  { id: 'owlfeather', name: 'Owl feather', rarity: 'event' },
  { id: 'jingle', name: 'Jingle bell', rarity: 'event' },
  { id: 'candycane', name: 'Candy cane', rarity: 'event' },
  { id: 'gingerbread', name: 'Gingerbread rabbit', rarity: 'event' },
  { id: 'holly', name: 'Holly sprig', rarity: 'event' },
  // keepsakes: one per wild visitor
  { id: 'quill', name: 'Hedgehog quill', rarity: 'keepsake' },
  { id: 'rowan', name: 'Rowan berries', rarity: 'keepsake' },
  { id: 'thimble', name: 'Tiny thimble', rarity: 'keepsake' },
  { id: 'lilypad', name: 'Lily pad', rarity: 'keepsake' },
  { id: 'dewdrop', name: 'Dewdrop bead', rarity: 'keepsake' },
  { id: 'hazelnut', name: 'Hazelnut', rarity: 'keepsake' },
  { id: 'moonstone', name: 'Moonstone', rarity: 'keepsake' },
  { id: 'goldleaf', name: 'Golden leaf', rarity: 'keepsake' },
];
/** Share of finds, while an event runs, that are that event's. */
export const EVENT_SHARE = 0.7;
/** Share of finds that are one of the rare ones. */
export const RARE_SHARE = 0.12;

/** Sets on the shelf. Completing one raises the clover rate (economy.ts). */
export interface CollectionSet { id: string; name: string; items: string[]; kind: 'permanent' | 'event' }
export const COLLECTION_SETS: CollectionSet[] = [
  { id: 'commons', name: 'Everyday finds', items: COLLECTIBLES.filter((c) => c.rarity === 'common').map((c) => c.id), kind: 'permanent' },
  { id: 'rares', name: 'Rare finds', items: COLLECTIBLES.filter((c) => c.rarity === 'rare').map((c) => c.id), kind: 'permanent' },
  { id: 'woodland', name: 'Woodland keepsakes', items: COLLECTIBLES.filter((c) => c.rarity === 'keepsake').map((c) => c.id), kind: 'permanent' },
  { id: 'snowday', name: 'Snow day', items: ['snowflake', 'mitten', 'icicle', 'snowball'], kind: 'event' },
  { id: 'bloom', name: 'Spring bloom', items: ['petal', 'bee', 'robinegg', 'ladybug'], kind: 'event' },
  { id: 'summer', name: 'Summer fair', items: ['firefly', 'cherry', 'butterfly', 'daisy'], kind: 'event' },
  { id: 'harvest', name: 'Harvest moon', items: ['maple', 'conker', 'chestnut', 'wheat'], kind: 'event' },
  { id: 'spooky', name: 'Spooky week', items: ['candy', 'bat', 'cobweb', 'owlfeather'], kind: 'event' },
  { id: 'winterfest', name: 'Winterfest', items: ['jingle', 'candycane', 'gingerbread', 'holly'], kind: 'event' },
];

export function setComplete(collection: Record<string, number> | undefined, set: CollectionSet): boolean {
  return set.items.every((id) => (collection?.[id] ?? 0) > 0);
}
