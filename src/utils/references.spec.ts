import test = require('blue-tape')
import * as references from './references'

test('references', t => {
  t.test('parse references from string', t => {
    const actual = references.extractReferences([
      '/// <reference path="foobar.d.ts" />',
      '',
      '///\t<reference\t path="example.d.ts"/>'
    ].join('\n'))

    const expected = [
      {
        start: 0,
        end: 37,
        path: 'foobar.d.ts'
      },
      {
        start: 38,
        end: 75,
        path: 'example.d.ts'
      }
    ]

    t.deepEqual(actual, expected)
    t.end()
  })

  t.test('compile a path to reference string', t => {
    const actual = references.toReference('foobar.d.ts')
    const expected = '/// <reference path="foobar.d.ts" />'

    t.equal(actual, expected)
    t.end()
  })

  t.test('remove reference', t => {
    const actual = references.removeReference([
      '  ///<reference\tpath="foobar.d.ts" />  ',
      '/// <reference path="example.d.ts" />'
    ].join('\n'), 'foobar.d.ts')

    const expected = '/// <reference path="example.d.ts" />'

    t.equal(actual, expected)
    t.end()
  })

  t.test('append reference', t => {
    const actual = references.appendReference(
      '/// <reference path="foobar.d.ts" />\n',
      'example.d.ts'
    )

    const expected = '/// <reference path="foobar.d.ts" />\n/// <reference path="example.d.ts" />\n'

    t.equal(actual, expected)
    t.end()
  })

  t.test('append reference without EOF new line', t => {
    const actual = references.appendReference(
      '/// <reference path="foobar.d.ts" />',
      'example.d.ts'
    )

    const expected = '/// <reference path="foobar.d.ts" />\n/// <reference path="example.d.ts" />'

    t.equal(actual, expected)
    t.end()
  })
})
