import { resolve as resolveUrl } from 'url'
import { resolve, dirname } from 'path'

/**
 * Check if a string is a URL.
 */
export function isHttp (url: string) {
  return /^https?\:/i.test(url)
}

/**
 * Check if a file is a definition.
 */
export function isDefinition (filename: string): boolean {
  return /\.d\.ts$/.test(filename)
}

/**
 * Resolve a file from another file location.
 */
export function resolveFrom (from: string, to: string) {
  return isHttp(from) ? resolveUrl(from, to) : resolve(dirname(from), to)
}
