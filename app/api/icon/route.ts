import { readFile } from "node:fs/promises"

// ============================================================
// FAVICON (ICO) — serves public/favicon (1).ico as the browser favicon.
//
// `.ico` IS supported by Next.js icon convention, but we serve it
// explicitly via this route and reference it from metadata.icons
// in app/layout.tsx so the favicon source can be controlled here.
// ============================================================

export async function GET() {
  try {
    const file = new URL("../../../public/favicon (1).ico", import.meta.url)

    const bytes = await readFile(file)

    return new Response(bytes, {
      headers: {
        "Content-Type": "image/x-icon",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (error) {
    console.error("GET ICON ERROR:", error)

    return new Response("Not Found", { status: 404 })
  }
}
