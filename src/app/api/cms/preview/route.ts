import { NextRequest, NextResponse } from "next/server";
import { getSession, hasRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !hasRole(session, "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const path = request.nextUrl.searchParams.get("path") || "/";
  const baseUrl = request.nextUrl.origin;

  // Fetch the page HTML WITHOUT session cookie — renders public website mode
  // Pass Vercel deployment protection bypass headers so the fetch works on
  // password-protected deployments (preview/production pre-launch)
  const fetchHeaders: Record<string, string> = {};
  const bypassCookie = request.cookies.get("_vercel_jwt")?.value;
  if (bypassCookie) {
    fetchHeaders.cookie = `_vercel_jwt=${bypassCookie}`;
  }
  const res = await fetch(`${baseUrl}${path}`, { headers: fetchHeaders });

  let html = await res.text();

  // Inject preview script that listens for postMessage updates
  const previewScript = `
    <script>
      window.addEventListener('message', (e) => {
        if (e.data?.type === 'cms-update') {
          const blocks = e.data.blocks;
          for (const [key, value] of Object.entries(blocks)) {
            const els = document.querySelectorAll('[data-cms-block="' + key + '"]');
            els.forEach(el => { el.textContent = value; });
          }
        }
        if (e.data?.type === 'cms-active') {
          document.querySelectorAll('.cms-active').forEach(el => el.classList.remove('cms-active'));
          if (e.data.block) {
            const els = document.querySelectorAll('[data-cms-block="' + e.data.block + '"]');
            els.forEach(el => {
              el.classList.add('cms-active');
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
          }
        }
      });
    </script>
    <style>
      [data-cms-block] { outline: 1px dashed transparent; transition: outline-color 0.2s; }
      [data-cms-block]:hover { outline-color: rgba(196,160,53,0.4); }
      .cms-active { outline: 2px solid #c4a035 !important; }
    </style>
  `;

  html = html.replace("</body>", `${previewScript}</body>`);

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
