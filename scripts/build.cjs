const path = require('path')
const esbuild = require('esbuild')

const clientFiles = [
  'index'
]

const configs = clientFiles.map(f => ({
  entryPoints: [ path.resolve(__dirname, '..', 'client', f+'.ts') ],
  bundle: true,
  minify: true,
  // FIXME: sourcemap:`true` does not work for now, because peertube does not serve static files.
  // See https://github.com/Chocobozzz/PeerTube/issues/5185
  sourcemap: false,
  format: 'esm',
  target: 'safari11',
  outfile: path.resolve(__dirname, '..', 'dist/client', f+'.js'),
}))

const promises = configs.map(c => esbuild.build(c))

Promise.all(promises)
  .catch(() => process.exit(1))