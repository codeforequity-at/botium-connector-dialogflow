import buble from 'rollup-plugin-buble'
import commonjs from 'rollup-plugin-commonjs'
import json from 'rollup-plugin-json'

export default {
  input: 'index.js',
  output: [
    {
      file: 'dist/botium-connector-dialogflow-es.js',
      format: 'es',
      sourcemap: true
    },
    {
      file: 'dist/botium-connector-dialogflow-cjs.js',
      format: 'cjs',
      sourcemap: true
    }
  ],
  plugins: [
    commonjs({
      exclude: 'node_modules/**'
    }),
    buble(),
    json()
  ]
}
