export default defineConfig({
  plugins: [react()],

  build:{
    chunkSizeWarningLimit: 2000
  }
})