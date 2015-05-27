import { join, dirname } from 'path'
import { isFile } from '../utils/fs'

/**
 * Resolve the current `tsd.json` project.
 */
export function resolveTypeScriptProject (dir: string): Promise<string> {
  return resolveTsconfig(dir).then(dirname)
}

/**
 * Resolve a `tsd.json` file.
 */
export function resolveTsconfig (dir: string): Promise<string> {
  return resolve(dir, 'tsconfig.json')
}

/**
 * Resolve a filename starting from the parent directory.
 */
export function resolveParent (dir: string, filename: string): Promise<string | void> {
  const parentDir = dirname(dir)

  if (dir === parentDir) {
    return Promise.reject(new Error(`Unable to resolve ${filename}`))
  }

  return resolve(parentDir, filename)
}

/**
 * Recursively resolve a filename from the current directory.
 */
export function resolve (dir: string, filename: string): Promise<string> {
  const path = join(dir, filename)

  return isFile(path)
    .then(function (exists) {
      return exists ? path : resolveParent(dir, filename)
    })
}
