import test = require('blue-tape')
import cachePath from './cache-path'

test('cache path', t => {
  const actual = cachePath('http://example.com/foo/bar.d.ts')
  const expected = 'example.com/foo/bar.d.ts'

  t.equal(actual, expected)

  t.end()
})
