import * as fs from 'graceful-fs'
import thenify = require('thenify')
import stripBom = require('strip-bom')
import parseJson = require('parse-json')

export let Stats: fs.Stats

export const stat = thenify(fs.stat)
export const readFile = thenify<string, string, string>(fs.readFile)
export const writeFile = thenify<string, any, void>(fs.writeFile)

/**
 * Check if a path exists as a file.
 */
export function isFile (path: string): Promise<boolean> {
  return stat(path).then(stat => stat.isFile(), () => false)
}

/**
 * Read a file as JSON and fail gracefully.
 */
export function readJson (path: string): any {
  return readFile(path, 'utf8')
    .then(stripBom)
    .then(contents => parseJson(contents, null, path))
}

/**
 * Write a file as JSON.
 */
export function writeJson (path: string, json: any, indent = 2) {
  return writeFile(path, JSON.stringify(json, null, indent))
}
