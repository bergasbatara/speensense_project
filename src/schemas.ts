/**
 * Collection Schemas
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 *
 * Add schemas by creating a file in src/schemas/ and importing it here.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { aiChatSchemas } from './schemas/ai-chat-schema'
import { transactionsSchema } from './schemas/transactions-schema'
import { importsSchema } from './schemas/imports-schema'
import { proposalsSchema } from './schemas/proposals-schema'

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  transactionsSchema,
  importsSchema,
  proposalsSchema,
  ...aiChatSchemas,
]
