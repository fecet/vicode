import esbuild from 'esbuild';
import * as importMap from 'esbuild-plugin-import-map';

// importMap.load({
//   imports: {
//     'npm:@bufbuild/protobuf': '@bufbuild/protobuf'
//   }
// });
importMap.load({
  imports: {
    // 'npm:@bufbuild/protobuf': 'https://cdn.skypack.dev/@bufbuild/protobuf'
    'npm:@bufbuild/protobuf': './node_modules/@bufbuild/protobuf',
    "npm:@bufbuild/protobuf/codegenv1": './node_modules/@bufbuild/protobuf/dist/codegenv1',
  }
});

esbuild.build({
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  outfile: './dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  minify: true,
  plugins: [importMap.plugin()],
  logLevel: 'info',
}).catch(() => process.exit(1));
