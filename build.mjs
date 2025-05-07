import esbuild from 'esbuild';

// Use esbuild's built-in alias feature instead of importMap plugin
esbuild.build({
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  outfile: './dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  minify: true,
  logLevel: 'info',
  // Use alias to replace npm: imports
  alias: {
    // Map npm:@bufbuild/protobuf to node_modules path
    'npm:@bufbuild/protobuf': '@bufbuild/protobuf',
    // Map npm:@bufbuild/protobuf/codegenv1 to node_modules path
    'npm:@bufbuild/protobuf/codegenv1': '@bufbuild/protobuf/codegenv1'
  },
  // Ensure all dependencies are properly resolved
  resolveExtensions: ['.ts', '.js', '.json'],
  // Make sure node modules are properly bundled
  nodePaths: ['./node_modules'],
}).catch(() => process.exit(1));
