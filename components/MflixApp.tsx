'use client';

import { useState, useEffect } from 'react';
import { Bolt, Link as LinkIcon, Rocket, Loader2, RotateCcw, AlertTriangle, CircleCheck, History, ExternalLink, ChevronRight, ChevronDown, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import LinkCard from '@/components/LinkCard';

interface Task {
  id: string;
  url: string;
  status: 'processing' | 'completed' | 'failed';
  createdAt: string;
  links: any[];
  error?: string;
  metadata?: {
    quality: string;
    languages: string;
    audioLabel: string;
  };
}

export default function MflixApp() {
  const [url, setUrl] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 10000); // Poll every 10s to avoid rate limits
    return () => clearInterval(interval);
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      
      // Handle non-OK responses (like Rate Limits)
      if (!res.ok) {
        const text = await res.text();
        if (text.includes("Rate exceeded")) {
          console.warn("Rate limit hit, skipping this poll.");
          return;
        }
        throw new Error(`Server error: ${res.status}`);
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.warn("Received non-JSON response from tasks API");
        return;
      }

      const data = await res.json();
      if (Array.isArray(data)) {
        setTasks(data);
      }
    } catch (e) {
      console.error('Failed to fetch tasks:', e);
    }
  };

const startProcess = async () => {
    if (!url.trim()) {
      if (navigator.vibrate) navigator.vibrate(50);
      return;
    }

    setIsConnecting(true);
    setError(null);
    setIsDone(false);

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      });

      if (!response.ok) {
        const text = await response.text();
        if (text.includes("Rate exceeded")) {
          throw new Error("Server is busy (Rate Limit). Please wait a few seconds and try again.");
        }
        throw new Error(`Server error: ${response.status}`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Received unexpected response format from server.");
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      // Immediately show that it's processing
      setIsConnecting(false);
      setIsProcessing(true);
      
      // We can wait a bit or just let the polling handle it
      // For better UX, we'll wait for the first update
      fetchTasks();
      
      setUrl(''); // Clear input
      setIsProcessing(false);
      setIsDone(true);
      
      setTimeout(() => setIsDone(false), 3000);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred');
      setIsConnecting(false);
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <header className="flex justify-between items-center mb-8">
        <div className="text-2xl font-bold bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent flex items-center gap-2">
          <Bolt className="text-indigo-500 fill-indigo-500" />
          MFLIX PRO
        </div>
      </header>

      <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-6 mb-8 shadow-2xl">
        <div className="relative mb-4">
          <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste Movie URL here..."
            className="w-full bg-black/40 border border-white/10 text-white pl-12 pr-4 py-4 rounded-2xl outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 transition-all font-outfit"
          />
        </div>

        <button
          onClick={startProcess}
          disabled={isConnecting || isProcessing || isDone}
          className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all duration-300 shadow-lg active:scale-95 ${
            isDone 
              ? 'bg-emerald-500 text-white' 
              : error 
                ? 'bg-rose-500 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-slate-800 disabled:opacity-70'
          }`}
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              CONNECTING...
            </>
          ) : isProcessing ? (
            <>
              <RotateCcw className="w-5 h-5 animate-spin" />
              PROCESSING LIVE...
            </>
          ) : isDone ? (
            <>
              <CircleCheck className="w-5 h-5" />
              ALL DONE ✅
            </>
          ) : error ? (
            <>
              <AlertTriangle className="w-5 h-5" />
              ERROR - RETRY
            </>
          ) : (
            <>
              START ENGINE
              <Rocket className="w-5 h-5" />
            </>
          )}
        </button>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm flex items-center gap-3"
          >
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p className="flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-xs font-bold uppercase hover:text-rose-300">Dismiss</button>
          </motion.div>
        )}
      </section>

      <div className="mb-6 flex items-center gap-2 text-slate-400">
        <History className="w-5 h-5" />
        <h3 className="font-bold uppercase tracking-wider text-sm">Recent Tasks</h3>
      </div>

      <div className="space-y-4">
        {tasks.map((task) => (
          <div key={task.id} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all hover:bg-white/10">
            <div 
              className="p-4 flex items-center gap-4 cursor-pointer"
              onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
            >
              <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center flex-shrink-0">
                <Video className="w-5 h-5 text-indigo-400" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h4 className="font-mono text-[11px] text-slate-400 truncate">{task.url}</h4>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                    task.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                    task.status === 'failed' ? 'bg-rose-500/20 text-rose-400' :
                    'bg-indigo-500/20 text-indigo-400 animate-pulse'
                  }`}>
                    {task.status}
                  </span>
                  <span className="text-slate-500 text-[10px]">{new Date(task.createdAt).toLocaleString()}</span>
                </div>
              </div>

              {expandedTask === task.id ? <ChevronDown className="w-5 h-5 text-slate-500" /> : <ChevronRight className="w-5 h-5 text-slate-500" />}
            </div>

            <AnimatePresence>
              {expandedTask === task.id && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-white/5 bg-black/20 p-4"
                >
                  {task.metadata && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                      <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                        <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Highest Quality</label>
                        <input 
                          type="text" 
                          readOnly 
                          value={task.metadata.quality} 
                          className="w-full bg-transparent text-sm font-bold text-indigo-400 outline-none"
                        />
                      </div>
                      <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                        <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Languages</label>
                        <input 
                          type="text" 
                          readOnly 
                          value={task.metadata.languages} 
                          className="w-full bg-transparent text-sm font-bold text-emerald-400 outline-none"
                        />
                      </div>
                      <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                        <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Audio Label</label>
                        <input 
                          type="text" 
                          readOnly 
                          value={task.metadata.audioLabel} 
                          className="w-full bg-transparent text-sm font-bold text-amber-400 outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {task.status === 'processing' && (
                    <div className="flex flex-col items-center py-8 text-slate-400">
                      <Loader2 className="w-8 h-8 animate-spin mb-2" />
                      <p className="text-sm">Scraping in progress...</p>
                      <p className="text-xs opacity-50">You can close this window and return later.</p>
                    </div>
                  )}

                  {task.status === 'failed' && (
                    <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
                      <AlertTriangle className="w-5 h-5 mb-2" />
                      {task.error || 'Task failed unexpectedly.'}
                    </div>
                  )}

                  {task.status === 'completed' && (
                    <div className="space-y-3">
                      {task.links.map((link: any, idx: number) => (
                        <LinkCard
                          key={idx}
                          id={idx}
                          name={link.name}
                          logs={link.logs || []}
                          finalLink={link.finalLink || null}
                          status={link.status || 'done'}
                        />
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}

        {tasks.length === 0 && (
          <div className="text-center py-12 text-slate-500 border-2 border-dashed border-white/5 rounded-3xl">
            <Rocket className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>No tasks yet. Submit a URL to start!</p>
          </div>
        )}
      </div>
    </div>
  );
}
