declare module 'xtend/mutable' {
  function extend <T, U, V, W> (dest: T, a?: U, b?: V, c?: W): T & U & V & W

  export = extend
}

declare module 'xtend/immutable' {
  function extend <T, U, V, W> (dest: T, a?: U, b?: V, c?: W): T & U & V & W

  export = extend
}

declare module 'xtend' {
  import immutable = require('xtend/immutable')

  export = immutable
}
