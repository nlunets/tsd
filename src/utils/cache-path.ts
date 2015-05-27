import { parse } from 'url'
import { join } from 'path'

/**
 * Originally based on https://github.com/npm/npm-cache-filename.
 */
export default function cachePath (url: string): string {
  const parsedUrl = parse(url)
  const host = parsedUrl.host.replace(/:/g, '_')
  const parts = parsedUrl.path.split('/').slice(1).map(encodePart)

  return join.apply(null, [host].concat(parts))
}

/**
 * Encode each part of a file for the filesystem.
 */
function encodePart (part: string): string {
  return encodeURIComponent(part).replace(/%/g, '_')
}
