import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const projectRoot = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@": projectRoot,
    },
  },
  test: {
    environment: "node",
    include: [
      "app/api/store/schedule/route.test.ts",
      "app/api/kontribusi-omset/target/route.test.ts",
      "components/pages/buat-jadwal.test.tsx",
      "components/pages/dashboard-shift-notes.test.tsx",
      "lib/pdf-shift.test.ts",
      "lib/kontribusi-omset/periode.test.ts",
      "lib/kontribusi-omset/parse-rupiah.test.ts",
      "lib/kontribusi-omset/target-harian.test.ts",
      "lib/kontribusi-omset/cabang.test.ts",
    ],
    clearMocks: true,
    restoreMocks: true,
    isolate: true,
    fileParallelism: false,
  },
})
