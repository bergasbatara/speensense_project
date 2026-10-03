import type { CollectionSchema } from 'deepspace/schema'
import { CATEGORIES } from '../lib/transactions'

export const transactionsSchema: CollectionSchema = {
  name: 'transactions',
  ownerField: 'userId',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
    { name: 'date', storage: 'text', interpretation: { kind: 'date' }, required: true },
    { name: 'merchant', storage: 'text', interpretation: 'plain', required: true },
    { name: 'amountMinor', storage: 'number', interpretation: 'plain', required: true },
    { name: 'currency', storage: 'text', interpretation: { kind: 'select', options: ['USD'] }, required: true },
    { name: 'direction', storage: 'text', interpretation: { kind: 'select', options: ['expense', 'income'] }, required: true },
    { name: 'category', storage: 'text', interpretation: { kind: 'select', options: [...CATEGORIES] }, required: true },
    { name: 'source', storage: 'text', interpretation: { kind: 'select', options: ['manual', 'csv', 'pdf', 'image'] }, required: true, immutable: true },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['pending', 'confirmed'] }, required: true },
  ],
  // Writes must pass the app's validated server actions. No admin bypass.
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
    viewer: { read: 'own', create: false, update: false, delete: false },
    member: { read: 'own', create: false, update: false, delete: false },
    admin: { read: 'own', create: false, update: false, delete: false },
  },
}
