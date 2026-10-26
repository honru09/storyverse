import { firebaseProjectId } from './firebase-app.js'

const textValue = (value) => typeof value === 'string' && value.length < 512 && !/[\r\n]/.test(value) ? value.trim() : ''

/**
 * Which durable store backs login codes, site sessions and usage totals.
 * - 'firestore' in Cloud Run (K_SERVICE is always set there) once a project
 *   id is known, or when the operator explicitly sets DATA_STORE=firestore.
 * - 'memory' only when explicitly requested (local development; data is lost
 *   on restart and must never be the production choice).
 * - null everywhere else, which disables the features that need a store
 *   instead of silently keeping security state in process memory.
 */
export function dataStoreKind(env = {}) {
  const explicit = textValue(env.DATA_STORE).toLowerCase()
  if (explicit === 'memory') return 'memory'
  if (explicit === 'firestore') return firebaseProjectId(env) ? 'firestore' : null
  if (explicit) return null
  return env.K_SERVICE && firebaseProjectId(env) ? 'firestore' : null
}
