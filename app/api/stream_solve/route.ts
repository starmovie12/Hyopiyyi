import { NextResponse } from 'next/server';
import { solveHBLinks, solveHubCDN, solveHubDrive } from '@/lib/solvers';

const API_MAP = {
  "timer": "https://time-page-bay-pass-edhc.onrender.com/solve?url=",
  "hblinks": "https://hblinks-dad.onrender.com/solve?url=",
  "hubdrive": "https://hdhub4u-1.onrender.com/solve?url=",
  "hubcloud": "http://85.121.5.246:5000/solve?url=",
  "hubcdn_bypass": "https://hubcdn-bypass.onrender.com/extract?url="
};

// No global lock for maximum speed. Parallel processing is handled by Promise.all.
// If rate limiting occurs, we can implement a per-domain semaphore.

export async function POST(req: Request) {
  const { links } = await req.json();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: any) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
      };

      const processLink = async (linkData: any) => {
        const lid = linkData.id;
        let currentLink = linkData.link;

        const sendLog = (msg: string, type: string = "info") => {
          send({ id: lid, msg, type });
        };

        const fetchWithUA = (url: string, options: any = {}) => {
          return fetch(url, {
            ...options,
            headers: {
              ...options.headers,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
        };

        try {
          sendLog("🔍 Analyzing Link...", "info");

          // --- ✅ HUBCDN.FANS BYPASS ---
          if (currentLink.includes("hubcdn.fans")) {
            sendLog("⚡ HubCDN Detected! Processing Single-Step Bypass (Native)...", "info");
            try {
              const r = await solveHubCDN(currentLink);
              if (r.status === 'success') {
                sendLog("🎉 COMPLETED: Direct Link Found", "success");
                send({ id: lid, final: r.final_link, status: "done" });
                return;
              } else throw new Error(r.message || "HubCDN Native Failed");
            } catch (e: any) {
              sendLog(`❌ HubCDN Error: ${e.message}`, "error");
              return;
            }
          }

          // --- STEP 2: TIMER BYPASS (With Lock & Redirect Chain) ---
          const targetDomains = ["hblinks", "hubdrive", "hubcdn", "hubcloud"];
          let loopCount = 0;

          while (loopCount < 3 && !targetDomains.some(d => currentLink.includes(d))) {
            // Trigger: Known timer domains or intermediate pages
            const isTimerPage = ["gadgetsweb", "review-tech", "ngwin", "cryptoinsights"].some(x => currentLink.includes(x));
            if (!isTimerPage && loopCount === 0) break;

            if (loopCount > 0) {
              sendLog("🔄 Bypassing intermediate page: " + currentLink, "warn");
            } else {
              sendLog("⏳ Timer Detected. Processing...", "warn");
            }
            
            try {
              sendLog("⏳ Calling External Timer API...", "warn");
              const r = await fetchWithUA(API_MAP.timer + encodeURIComponent(currentLink)).then(res => res.json());

              if (r.status === 'success') {
                currentLink = r.extracted_link!;
                sendLog("✅ Step 2 Done", "success");
                sendLog('🔗 Link after Timer: ' + currentLink, 'info');
              } else {
                throw new Error(r.message || "External Timer API returned failure status");
              }
            } catch (e: any) {
              sendLog(`❌ Timer Error: ${e.message}`, "error");
              break; // Stop the loop on error
            }
            
            loopCount++;
          }

          // --- STEP 3: HBLINKS ---
          if (currentLink.includes("hblinks")) {
            sendLog("🔗 Step 3: Solving HBLinks (Native)...", "info");
            try {
              const r = await solveHBLinks(currentLink);
              if (r.status === 'success') {
                currentLink = r.link!;
                sendLog("✅ Step 3 Done", "success");
              } else throw new Error(r.message || "HBLinks Native Failed");
            } catch (e: any) {
              sendLog(`❌ HBLinks Error: ${e.message}`, "error");
              return;
            }
          }

          // --- STEP 4: HUBDRIVE ---
          if (currentLink.includes("hubdrive")) {
            sendLog("☁️ Step 4: Solving HubDrive (Native)...", "info");
            try {
              const r = await solveHubDrive(currentLink);
              if (r.status === 'success') {
                currentLink = r.link!;
                sendLog("✅ Step 4 Done", "success");
                sendLog('🔗 Link after HubDrive: ' + currentLink, 'info');
              } else throw new Error(r.message || "HubDrive Native Failed");
            } catch (e: any) {
              sendLog(`❌ HubDrive Error: ${e.message}`, "error");
              return;
            }
          }

          // --- STEP 5: HUBCLOUD (FINAL) ---
          let finalFound = false;
          if (currentLink.includes("hubcloud") || currentLink.includes("hubcdn")) {
            sendLog("⚡ Step 5: Getting Direct Link...", "info");
            try {
              const r = await fetchWithUA(API_MAP.hubcloud + encodeURIComponent(currentLink)).then(res => res.json());
              if (r.status === 'success') {
                sendLog("🎉 COMPLETED", "success");
                send({ id: lid, final: r.link, status: "done" });
                finalFound = true;
              } else throw new Error("HubCloud API Failed");
            } catch (e: any) {
              sendLog(`❌ HubCloud Error: ${e.message}`, "error");
            }
          }

          // --- FINAL FALLBACK ---
          if (!finalFound) {
            sendLog('❌ Unrecognized link format or stuck', 'error');
            send({ id: lid, status: "error", msg: "Process ended without final link" });
          }

        } catch (e: any) {
          sendLog(`⚠️ Critical Error: ${e.message}`, "error");
        } finally {
          send({ id: lid, status: "finished" });
        }
      };

      // Process all links concurrently
      await Promise.all(links.map((link: any) => processLink(link)));
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
