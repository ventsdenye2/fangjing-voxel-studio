import {defineConfig} from 'vite';
import {resolve} from 'node:path';
export default defineConfig({root:'tutorial',base:'./',server:{host:'127.0.0.1'},build:{outDir:'../dist-tutorial',emptyOutDir:true,chunkSizeWarningLimit:1500,rollupOptions:{input:{home:resolve('tutorial/index.html'),learn:resolve('tutorial/learn.html')}}}});
