#!/usr/bin/env node

import program = require('commander')
import { install } from '../tsd'

program
  .option('-S, --save', 'save as a dependency')
  .option('-D, --save-dev', 'save as a development dependency')
  .option('-D, --save-ambient', 'save as a ambient dependency')
  .option('-n, --name [name]', 'save the dependency with a name')
  .parse(process.argv)

const opts = program.opts()

console.log(opts)
