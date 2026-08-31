import { readFile } from "node:fs/promises"

// ============================================================
// FAVICON (WEBP) — serves app/icon.webp as the browser favicon.
//
// Next.js only auto-discovers app icons for .ico/.jpg/.jpeg/
// .png/.svg via the `icon` file convention. `.webp` is NOT
// supported by the convention, so we serve it explicitly and
// reference it from metadata.icons in app/layout.tsx.
// ============================================================

export async function GET() {
  try {
    const file = new URL("../../icon.webp", import.meta.url)

    const bytes = await readFile(file)

    return new Response(bytes, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (error) {
    console.error("GET ICON ERROR:", error)

    return new Response("Not Found", { status: 404 })
  }
}
