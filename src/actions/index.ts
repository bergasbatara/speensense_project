import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { transactionActions } from './transactions'
import { commitCsvImport, commitPdfImport, getCsvImportReview } from './imports'
import { proposalActions } from './proposals'

export const actions: Record<string, ActionHandler<Env>> = { ...transactionActions, ...proposalActions, commitCsvImport, commitPdfImport, getCsvImportReview }
