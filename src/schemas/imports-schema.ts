import type { CollectionSchema } from 'deepspace/schema'

export const importsSchema: CollectionSchema = {
  name: 'imports', ownerField: 'userId', uniqueOn: ['userId', 'fileDigest'],
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
    { name: 'fileDigest', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'fileName', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'rows', storage: 'text', interpretation: { kind: 'json' }, required: true, immutable: true },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['saving', 'completed'] }, required: true },
  ],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: 'own', create: false, update: false, delete: false },
    member: { read: 'own', create: false, update: false, delete: false },
    admin: { read: 'own', create: false, update: false, delete: false },
  },
}
