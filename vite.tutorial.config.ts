import {defineConfig} from 'vite';
export default defineConfig({root:'tutorial',base:'./',server:{host:'127.0.0.1'},build:{outDir:'../dist-tutorial',emptyOutDir:true,chunkSizeWarningLimit:1500}});
