import invariant = require('invariant')
import { parse, format } from 'url'
import { normalize, basename } from 'path'
import { Dependency } from '../interfaces/tsd'

/**
 * Return default git options from the pathname.
 */
function gitFromPathname (pathname: string) {
  const segments = pathname.substr(1).split('/')
  const repo = segments.shift()
  let path = segments.join('/')

  if (segments.length === 0) {
    path = 'tsconfig.json'
  } else if (!/\.d\.ts$|(?:^|\/)tsconfig.json$/.test(path)) {
    path += '/tsconfig.json'
  }

  return { repo, path }
}

/**
 * Extract the sha or default to `master`.
 */
function shaFromHash (hash: string): string {
  return hash ? hash.substr(1) : 'master'
}

/**
 * Parse a `tsd.json` dependency field.
 */
export default function parseDependency (raw: string): Dependency {
  const parsedurl = parse(raw)
  const { protocol, auth, hostname, pathname, hash } = parsedurl

  if (protocol === 'file:') {
    const location = normalize(pathname)
    const filename = basename(location)

    invariant(
      /\.d\.ts$|^tsconfig\.json$/.test(filename),
      'Only `.d.ts` files and `tsconfig.json` are supported'
    )

    return {
      raw,
      type: 'file',
      location
    }
  }

  if (protocol === 'github:') {
    const sha = shaFromHash(hash)
    const { repo, path } = gitFromPathname(pathname)

    return {
      raw,
      type: 'hosted',
      location: `https://raw.githubusercontent.com/${hostname}/${repo}/${sha}/${path}`
    }
  }

  if (protocol === 'bitbucket:') {
    const sha = shaFromHash(hash)
    const { repo, path } = gitFromPathname(pathname)

    return {
      raw,
      type: 'hosted',
      location: `https://bitbucket.org/${hostname}/${repo}/raw/${sha}/${path}`
    }
  }

  if (protocol === 'npm:') {
    const scoped = auth === ''
    const parts = pathname ? pathname.substr(1).split('/') : []
    let name = hostname

    // Handle scoped packages.
    if (scoped) {
      name = `@${hostname}/${parts.shift()}`
    }

    return {
      raw,
      type: 'npm',
      location: normalize(name + '/' + (parts.length ? parts.join('/') : 'package.json'))
    }
  }

  if (protocol === 'bower:') {
    return {
      raw,
      type: 'bower',
      location: normalize(hostname + (pathname || '/bower.json'))
    }
  }

  if (protocol === 'http:' || protocol === 'https:') {
    return {
      raw,
      type: 'hosted',
      location: format(parsedurl)
    }
  }

  throw new TypeError(`Unsupported dependency: ${raw}`)
}
