import type { CollectionSchema } from 'deepspace/schema'

export const proposalsSchema: CollectionSchema = {
  name: 'proposals', ownerField: 'userId',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
    { name: 'category', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'rows', storage: 'text', interpretation: { kind: 'json' }, required: true, immutable: true },
    { name: 'status', storage: 'text', interpretation: 'plain', required: true },
    { name: 'appliedIds', storage: 'text', interpretation: { kind: 'json' }, required: true },
    { name: 'createdAt', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'expiresAt', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'resolvedAt', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: 'own', create: false, update: false, delete: false },
    member: { read: 'own', create: false, update: false, delete: false },
    admin: { read: 'own', create: false, update: false, delete: false },
  },
}
