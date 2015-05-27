import extend = require('xtend')
import invariant = require('invariant')
import stripBom = require('strip-bom')
import arrify = require('arrify')
import Promise = require('native-or-bluebird')
import zipObject = require('zip-object')
import partial = require('util-partial')
import { resolve as resolveUrl } from 'url'
import { resolve, dirname, join } from 'path'
import { readJson } from '../utils/fs'
import parseDependency from '../utils/parse'
import cachePath from '../utils/cache-path'
import { resolve as findUp } from '../utils/resolve'
import { isDefinition, isHttp } from '../utils/path'

import {
  Dependency,
  Dependencies,
  DependencyBranch,
  DependencyTree,
  TsdJson,
  Typings
} from '../interfaces/tsd'

/**
 * Default dependency config options.
 */
const DEFAULT_DEPENDENCY: DependencyTree = {
  type: undefined,
  ambient: false,
  missing: false,
  src: undefined,
  typings: {},
  dependencies: {},
  devDependencies: {},
  ambientDependencies: {}
}

/**
 * Default configuration for a missing dependency.
 */
const MISSING_DEPENDENCY = extend(DEFAULT_DEPENDENCY, {
  missing: true
})

/**
 * Extract the typings from a `package.json`-like object.
 */
function getTypings (filename: string, packageJson: any): Typings {
  const typings: Typings = {}

  if (typeof packageJson.typings === 'string') {
    typings.main = packageJson.typings
  }

  if (typeof packageJson.typings === 'object') {
    typings.main = packageJson.typings.main
    typings.browser = packageJson.typings.browser
  }

  return typings
}

/**
 * Options for resolving dependencies.
 */
export interface Options {
  dev?: boolean
  cachePath: string
}

/**
 * Resolve all dependencies at the current path.
 */
export default function resolveDependencies (path: string, options: Options): Promise<DependencyTree> {
  return Promise.all([
    resolveBowerDependencies(path, options),
    resolveNpmDependencies(path, options),
    resolveTsdDependencies(path, options)
  ])
    .then(mergeDependencies)
}

/**
 * Resolve a single dependency object.
 */
export function resolveDependency (path: string, dependency: Dependency, options: Options, parent?: DependencyTree): Promise<DependencyTree> {
  if (dependency.type === 'npm') {
    return resolveNpmDependency(path, dependency.location, options, parent)
  }

  if (dependency.type === 'bower') {
    return resolveBowerDependency(path, dependency.location, options, parent)
  }

  return resolveFileDependency(path, dependency.location, options, parent)
}

/**
 * Resolve a dependency in NPM.
 */
function resolveNpmDependency (path: string, name: string, options: Options, parent?: DependencyTree) {
  return findUp(path, join('node_modules', name))
    .then(function (modulePath: string) {
      return resolveNpmDependencyFrom(modulePath, options, parent)
    })
}

/**
 * Resolve a dependency in Bower.
 */
function resolveBowerDependency (path: string, name: string, options: Options, parent?: DependencyTree) {
  return resolveBowerComponentPath(path)
    .then(function (componentPath: string) {
      const modulePath = resolve(componentPath, name)

      return resolveBowerDependencyFrom(modulePath, componentPath, options, parent)
    })
}

/**
 * Resolve a local file dependency.
 */
function resolveFileDependency (path: string, location: string, options: Options, parent?: DependencyTree): Promise<DependencyTree> {
  let src: string

  if (isHttp(location)) {
    src = location
  } else if (parent && isHttp(parent.src)) {
    src = resolveUrl(parent.src, location)
  } else {
    src = resolve(path, location)
  }

  // TODO: Resolve from HTTP.
  // TODO: Should I stat files?

  if (!isDefinition(src)) {
    return resolveTsdDependencyFrom(src, options, parent)
  }

  return Promise.resolve(extend(DEFAULT_DEPENDENCY, {
    type: 'tsd',
    typings: { main: src },
    src,
    parent
  }))
}

/**
 * Follow and resolve bower dependencies.
 */
function resolveBowerDependencies (path: string, options: Options): Promise<DependencyTree> {
  return findUp(path, 'bower.json')
    .then(
      function (bowerJsonPath: string) {
        return resolveBowerComponentPath(dirname(bowerJsonPath))
          .then(function (componentPath: string) {
            return resolveBowerDependencyFrom(bowerJsonPath, componentPath, options)
          })
      },
      function () {
        return extend(MISSING_DEPENDENCY)
      }
    )
}

/**
 * Resolve bower dependencies from a path.
 */
function resolveBowerDependencyFrom (src: string, componentPath: string, options: Options, parent?: DependencyTree): Promise<DependencyTree> {
  checkCircularDependency(parent, src)

  return readJson(src)
    .then(
      function (bowerJson: any = {}) {
        const tree = extend(DEFAULT_DEPENDENCY, {
          name: bowerJson.name,
          version: bowerJson.version,
          main: bowerJson.main,
          browser: bowerJson.browser,
          typings: getTypings(src, bowerJson),
          type: 'bower',
          src,
          parent
        })

        const dependencyMap = extend(bowerJson.dependencies)
        const devDependencyMap = extend(options.dev ? bowerJson.devDependencies : {})

        return Promise.all([
          resolveBowerDependencyMap(componentPath, dependencyMap, options, tree),
          resolveBowerDependencyMap(componentPath, devDependencyMap, options, tree),
          resolveTsdDependencyFrom(join(src, '..', 'tsconfig.json'), options, tree)
        ])
          .then(function ([dependencies, devDependencies, tsdPackage]) {
            tree.dependencies = extend(dependencies, tsdPackage.dependencies)
            tree.devDependencies = extend(devDependencies, tsdPackage.devDependencies)

            return tree
          })
      },
      function () {
        return extend(MISSING_DEPENDENCY, {
          type: 'bower',
          src,
          parent
        })
      }
    )
}

/**
 * Resolve the path to bower components.
 */
function resolveBowerComponentPath (path: string): Promise<string> {
  return readJson(resolve(path, '.bowerrc'))
    .then(function (bowerrc: any = {}) {
      return resolve(path, bowerrc.directory || 'bower_components')
    })
    .catch(function () {
      return resolve(path, 'bower_components')
    })
}

/**
 * Recursively resolve dependencies from a list and component path.
 */
function resolveBowerDependencyMap (componentPath: string, dependencies: any, options: Options, parent: DependencyTree): Promise<DependencyBranch> {
  const keys = Object.keys(dependencies)

  return Promise.all(keys.map(function (name) {
    const modulePath = resolve(componentPath, name, 'bower.json')

    return resolveBowerDependencyFrom(modulePath, componentPath, extend(options, { dev: false }), parent)
  }))
    .then(partial(zipObject, keys))
}

/**
 * Follow and resolve npm dependencies.
 */
function resolveNpmDependencies (path: string, options: Options): Promise<DependencyTree> {
  return findUp(path, 'package.json')
    .then(
      function (packgeJsonPath: string) {
        return resolveNpmDependencyFrom(packgeJsonPath, options)
      },
      function () {
        return extend(MISSING_DEPENDENCY)
      }
    )
}

/**
 * Resolve NPM dependencies from `package.json`.
 */
function resolveNpmDependencyFrom (src: string, options: Options, parent?: DependencyTree): Promise<DependencyTree> {
  checkCircularDependency(parent, src)

  return readJson(src)
    .then(
      function (packageJson: any = {}) {
        const tree = extend(DEFAULT_DEPENDENCY, {
          name: packageJson.name,
          version: packageJson.version,
          main: packageJson.main,
          browser: packageJson.browser,
          typings: getTypings(src, packageJson),
          type: 'npm',
          src,
          parent
        })

        const dependencyMap = extend(
          packageJson.dependencies,
          packageJson.peerDependencies,
          packageJson.optionalDependencies
        )

        const devDependencyMap = extend(options.dev ? packageJson.devDependencies : {})

        return Promise.all([
          resolveNpmDependencyMap(src, dependencyMap, options, tree),
          resolveNpmDependencyMap(src, devDependencyMap, options, tree),
          resolveTsdDependencyFrom(join(src, '..', 'tsconfig.json'), options, tree)
        ])
          .then(function ([dependencies, devDependencies, tsdPackage]) {
            tree.dependencies = extend(dependencies, tsdPackage.dependencies)
            tree.devDependencies = extend(devDependencies, tsdPackage.devDependencies)

            return tree
          })
      },
      function () {
        return extend(MISSING_DEPENDENCY, {
          type: 'npm',
          src,
          parent
        })
      }
    )
}

/**
 * Recursively resolve dependencies from a list and component path.
 */
function resolveNpmDependencyMap (src: string, dependencies: any, options: Options, parent: DependencyTree) {
  const path = dirname(src)
  const keys = Object.keys(dependencies)

  return Promise.all(keys.map(function (name) {
    return resolveNpmDependency(path, join(name, 'package.json'), extend(options, { dev: false }), parent)
  }))
    .then(partial(zipObject, keys))
}

/**
 * Follow and resolve TSD dependencies.
 */
function resolveTsdDependencies (path: string, options: Options): Promise<DependencyTree> {
  return findUp(path, 'tsconfig.json')
    .then(
      function (path: string) {
        return resolveTsdDependencyFrom(path, options)
      },
      function () {
        return extend(MISSING_DEPENDENCY)
      }
    )
}

/**
 * Resolve TSD dependencies from an exact path.
 */
function resolveTsdDependencyFrom (src: string, options: Options, parent?: DependencyTree) {
  checkCircularDependency(parent, src)

  // TODO: Resolve from a remote source using cached popsicle requests.

  return readJson(src)
    .then(function (tsconfig: { tsd?: TsdJson }) {
      invariant(
        typeof tsconfig === 'object' && typeof tsconfig.tsd === 'object',
        'File `tsconfig.json` does not contain a "tsd" section'
      )

      return tsconfig.tsd
    })
    .then(function (tsdJson: TsdJson) {
      const tree = extend(DEFAULT_DEPENDENCY, {
        name: tsdJson.name,
        ambient: !!tsdJson.ambient,
        typings: getTypings(src, tsdJson),
        type: 'tsd',
        src,
        parent
      })

      const dependencyMap = extend(tsdJson.dependencies)
      const devDependencyMap = extend(options.dev ? tsdJson.devDependencies : {})
      const ambientDependencyMap = extend(tsdJson.ambientDependencies)

      return Promise.all<any>([
        resolveTsdDependencyMap(src, dependencyMap, options, tree),
        resolveTsdDependencyMap(src, devDependencyMap, options, tree),
        resolveTsdDependencyMap(src, ambientDependencyMap, options, tree)
      ])
        .then(function ([dependencies, devDependencies, ambientDependencies]) {
          tree.dependencies = dependencies
          tree.devDependencies = devDependencies
          tree.ambientDependencies = ambientDependencies

          return tree
        })
    }, function () {
      return extend(MISSING_DEPENDENCY, {
        type: 'tsd',
        src,
        parent
      })
    })
}

/**
 * Resolve TSD dependency map from a cache directory.
 */
function resolveTsdDependencyMap (src: string, dependencies: any, options: Options, parent: DependencyTree) {
  const path = dirname(src)
  const keys = Object.keys(dependencies)

  return Promise.all(keys.map(function (name) {
    // Map over the dependency list and resolve to the first found dependency.
    return arrify(dependencies[name])
      .map((str) => parseDependency(str))
      .reduce(function (result: Promise<DependencyTree>, dependency: Dependency) {
        return result.then(function (tree) {
          // Continue trying to resolve when the dependency is missing.
          if (tree.missing) {
            return resolveDependency(path, dependency, extend(options, { dev: false }), parent)
          }

          return tree
        })
      }, Promise.resolve(MISSING_DEPENDENCY))
  }))
    .then(partial(zipObject, keys))
}

/**
 * Check whether the filename is a circular dependency.
 */
function checkCircularDependency (tree: DependencyTree, filename: string) {
  if (tree) {
    const currentSrc = tree.src

    do {
      invariant(tree.src !== filename, 'Circular dependency detected in %s', currentSrc)
    } while (tree = tree.parent)
  }
}

/**
 * Merge dependency trees together.
 */
function mergeDependencies (trees: DependencyTree[]): DependencyTree {
  const dependency = extend(DEFAULT_DEPENDENCY, { typings: {} })

  trees.forEach(function (dependencyTree) {
    overrideProperty('name', dependency, dependencyTree)
    overrideProperty('main', dependency, dependencyTree)
    overrideProperty('browser', dependency, dependencyTree)
    overrideProperty('main', dependency.typings, dependencyTree.typings)
    overrideProperty('browser', dependency.typings, dependencyTree.typings)

    dependency.dependencies = extend(dependency.dependencies, dependencyTree.dependencies)
    dependency.devDependencies = extend(dependency.devDependencies, dependencyTree.devDependencies)
    dependency.ambientDependencies = extend(dependency.ambientDependencies, dependencyTree.ambientDependencies)
  })

  return dependency
}

/**
 * Extend a single property from one object to another.
 */
function overrideProperty (property: string, to: any, from: any) {
  if (from.hasOwnProperty(property)) {
    to[property] = from[property]
  }
}
