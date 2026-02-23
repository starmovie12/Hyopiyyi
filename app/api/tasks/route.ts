export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { extractMovieLinks, solveHBLinks, solveHubCDN, solveHubDrive } from '@/lib/solvers';

const API_MAP = {
  "timer": "https://time-page-bay-pass-edhc.onrender.com/solve?url=",
  "hblinks": "https://hblinks-dad.onrender.com/solve?url=",
  "hubdrive": "https://hdhub4u-1.onrender.com/solve?url=",
  "hubcloud": "http://85.121.5.246:5000/solve?url=",
  "hubcdn_bypass": "https://hubcdn-bypass.onrender.com/extract?url="
};

export async function GET() {
  try {
    const snapshot = await db.collection('scraping_tasks').orderBy('createdAt', 'desc').limit(20).get();
    const tasks = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json(tasks);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

    // Extract basic metadata and links immediately for fast UI feedback
    const listResult = await extractMovieLinks(url);
    
    const taskData: any = {
      url,
      status: 'processing',
      createdAt: new Date().toISOString(),
      metadata: listResult.status === 'success' ? listResult.metadata : null,
      links: (listResult.status === 'success' && listResult.links) ? listResult.links.map((l: any) => ({ ...l, status: 'processing', logs: [] })) : []
    };

    const taskRef = await db.collection('scraping_tasks').add(taskData);
    const taskId = taskRef.id;

    if (listResult.status === 'success' && listResult.links) {
      // Continue with link solving in background
      runBackgroundSolving(taskId, listResult.links).catch(console.error);
    } else if (listResult.status === 'success') {
      // Status is success but no links? Mark as failed.
      await taskRef.update({ status: 'failed', error: 'No links found on page' });
    } else {
      await taskRef.update({ status: 'failed', error: listResult.message || 'Extraction failed' });
    }

    return NextResponse.json({ taskId, metadata: taskData.metadata });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function runBackgroundSolving(taskId: string, links: any[]) {
  const taskRef = db.collection('scraping_tasks').doc(taskId);

  try {
    const solvedLinks = await Promise.all(links.map(async (linkData: any) => {
      let currentLink = linkData.link;
      
      const fetchWithUA = (url: string) => fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      });

      try {
        // HubCDN Bypass
        if (currentLink.includes("hubcdn.fans")) {
          const r = await solveHubCDN(currentLink);
          if (r.status === 'success') return { ...linkData, finalLink: r.final_link, status: 'done' };
        }

        // Timer Bypass
        const targetDomains = ["hblinks", "hubdrive", "hubcdn", "hubcloud"];
        let loopCount = 0;
        while (loopCount < 3 && !targetDomains.some((d: string) => currentLink.includes(d))) {
          const isTimerPage = ["gadgetsweb", "review-tech", "ngwin", "cryptoinsights"].some((x: string) => currentLink.includes(x));
          if (!isTimerPage && loopCount === 0) break;
          
          const r = await fetchWithUA(API_MAP.timer + encodeURIComponent(currentLink)).then(res => res.json());
          if (r.status === 'success') {
            currentLink = r.extracted_link!;
          } else break;
          loopCount++;
        }

        // HBLinks
        if (currentLink.includes("hblinks")) {
          const r = await solveHBLinks(currentLink);
          if (r.status === 'success') currentLink = r.link!;
        }

        // HubDrive
        if (currentLink.includes("hubdrive")) {
          const r = await solveHubDrive(currentLink);
          if (r.status === 'success') currentLink = r.link!;
        }

        // Final HubCloud
        if (currentLink.includes("hubcloud") || currentLink.includes("hubcdn")) {
          const r = await fetchWithUA(API_MAP.hubcloud + encodeURIComponent(currentLink)).then(res => res.json());
          if (r.status === 'success') {
            return { ...linkData, finalLink: r.link, status: 'done' };
          }
        }

        return { ...linkData, status: 'error', error: 'Could not solve' };
      } catch (e: any) {
        return { ...linkData, status: 'error', error: e.message };
      }
    }));

    await taskRef.update({ 
      status: 'completed',
      links: solvedLinks
    });

  } catch (e: any) {
    await taskRef.update({ status: 'failed', error: e.message });
  }
}
