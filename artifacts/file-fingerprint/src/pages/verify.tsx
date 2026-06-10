import React, { useState, useCallback, useRef, useEffect } from "react";
import { Link, useSearch } from "wouter";
import {
  Upload, Search, ShieldCheck, ShieldX, ExternalLink, RotateCcw,
  Loader2, Lock, Globe, Users, EyeOff, ArrowRight, FileCheck, History,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/** Convert a raw Hedera consensus timestamp ("1725123456.789000000") to a JS Date. */
function hederaTsToDate(ts: string): Date {
  const [secs, nanos] = ts.split(".");
  return new Date(parseInt(secs, 10) * 1000 + Math.floor(parseInt((nanos ?? "0").padEnd(9, "0"), 10) / 1_000_000));
}

type Visibility = "private" | "semi-public" | "public";

interface VerifyResult {
  verified: boolean;
  hash: string;
  topicId: string;
  network: string;
  explorerUrl?: string;
  filename?: string;
  fileSize?: number;
  originalTimestamp?: string;
  registeredAt?: string;
  consensusTimestamp?: string;
  visibility?: Visibility;
  ownerAccountId?: string;
}

interface HistoryEvent {
  eventType: "registration" | "visibility-update";
  consensusTimestamp: string;
  visibility: Visibility;
  ownerAccountId?: string;
  registeredAt: string;
  filename?: string;
  fileSize?: number;
}

interface HistoryResponse {
  found: boolean;
  hash: string;
  topicId: string;
  events: HistoryEvent[];
  currentVisibility?: Visibility;
}

type InputMode = "file" | "hash";

// ─── Visibility badge ─────────────────────────────────────────────────────────
function VisBadge({ v }: { v: Visibility }) {
  if (v === "private")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
        <EyeOff className="w-3 h-3" /> Private
      </span>
    );
  if (v === "semi-public")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
        <Users className="w-3 h-3" /> Semi-Public
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
      <Globe className="w-3 h-3" /> Public
    </span>
  );
}

// ─── Timeline entry ───────────────────────────────────────────────────────────
function TimelineEvent({
  event,
  prev,
  isLast,
  index,
}: {
  event: HistoryEvent;
  prev: HistoryEvent | null;
  isLast: boolean;
  index: number;
}) {
  const date = hederaTsToDate(event.consensusTimestamp);
  const isRegistration = event.eventType === "registration";

  const dotColor = isRegistration
    ? "bg-emerald-500 border-emerald-200"
    : event.visibility === "private"
    ? "bg-slate-400 border-slate-200"
    : event.visibility === "semi-public"
    ? "bg-blue-500 border-blue-200"
    : "bg-emerald-500 border-emerald-200";

  const cardBg = isRegistration
    ? "bg-emerald-50/50 border-emerald-100"
    : event.visibility === "private"
    ? "bg-slate-50 border-slate-100"
    : event.visibility === "semi-public"
    ? "bg-blue-50/50 border-blue-100"
    : "bg-emerald-50/50 border-emerald-100";

  return (
    <div className="flex gap-4">
      {/* Spine */}
      <div className="flex flex-col items-center">
        <div className={`w-3 h-3 rounded-full border-2 shrink-0 mt-4 z-10 ${dotColor}`} />
        {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
      </div>

      {/* Card */}
      <div className={`flex-1 rounded-xl border p-4 mb-4 space-y-2 ${cardBg}`}>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {isRegistration
              ? <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              : <History className="w-4 h-4 text-muted-foreground shrink-0" />}
            <span className="text-sm font-semibold text-foreground">
              {isRegistration ? "Original Registration" : "Visibility Changed"}
            </span>
            {index === 0 && (
              <span className="text-xs text-muted-foreground bg-muted border rounded-full px-2 py-0.5">
                First record
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isRegistration && prev && (
              <>
                <VisBadge v={prev.visibility} />
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
              </>
            )}
            <VisBadge v={event.visibility} />
          </div>
        </div>

        {/* File info on registration event */}
        {isRegistration && event.filename && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground truncate max-w-[200px]" title={event.filename}>
              {event.filename}
            </span>
            {event.fileSize != null && <span>{formatBytes(event.fileSize)}</span>}
          </div>
        )}

        {/* Owner */}
        {event.ownerAccountId && event.visibility !== "private" && (
          <div className="text-xs text-muted-foreground">
            Owner:{" "}
            <Link
              href={`/profile/${event.ownerAccountId}`}
              className="font-mono text-foreground hover:text-primary transition-colors"
            >
              {event.ownerAccountId}
            </Link>
          </div>
        )}

        {/* Timestamps */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs text-muted-foreground pt-1 border-t border-black/5">
          <span>
            <span className="font-medium text-foreground">{date.toLocaleString()}</span>
          </span>
          <span className="font-mono opacity-60">
            Consensus: {event.consensusTimestamp}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Verify() {
  const search = useSearch();
  const [mode, setMode] = useState<InputMode>("file");
  const [isDragging, setIsDragging] = useState(false);
  const [isHashing, setIsHashing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [computedHash, setComputedHash] = useState<string | null>(null);
  const [pastedHash, setPastedHash] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [droppedFilename, setDroppedFilename] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // History state
  const [history, setHistory] = useState<HistoryEvent[] | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);

  const queryRegistry = useCallback(async (hash: string) => {
    setIsSearching(true);
    setResult(null);
    setHistory(null);
    try {
      const res = await fetch(`/api/fingerprint/verify?hash=${encodeURIComponent(hash)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Server error ${res.status}`);
      }
      const data = await res.json() as VerifyResult;
      setResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Lookup failed", description: msg, variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  }, [toast]);

  // Fetch history whenever a verified result arrives
  useEffect(() => {
    if (!result?.verified || !result.hash) return;
    let cancelled = false;
    setIsLoadingHistory(true);
    setHistory(null);
    fetch(`/api/fingerprint/history?hash=${encodeURIComponent(result.hash)}`)
      .then(r => r.json() as Promise<HistoryResponse>)
      .then(data => {
        if (!cancelled) setHistory(data.found ? data.events : []);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });
    return () => { cancelled = true; };
  }, [result]);

  // Auto-run lookup when ?hash= is present
  useEffect(() => {
    const params = new URLSearchParams(search);
    const hashParam = params.get("hash")?.toLowerCase().trim() ?? "";
    if (/^[0-9a-f]{64}$/.test(hashParam)) {
      setMode("hash");
      setPastedHash(hashParam);
      setComputedHash(hashParam);
      queryRegistry(hashParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hashAndVerify = useCallback(async (file: File) => {
    setIsHashing(true);
    setResult(null);
    setHistory(null);
    setComputedHash(null);
    setDroppedFilename(file.name);
    try {
      const buf = await file.arrayBuffer();
      const hashBuf = await crypto.subtle.digest("SHA-256", buf);
      const hex = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, "0")).join("");
      setComputedHash(hex);
      setIsHashing(false);
      await queryRegistry(hex);
    } catch {
      setIsHashing(false);
      toast({ title: "Error reading file", description: "Could not compute hash.", variant: "destructive" });
    }
  }, [queryRegistry, toast]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) hashAndVerify(file);
  }, [hashAndVerify]);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) hashAndVerify(file);
  }, [hashAndVerify]);

  const handleHashSubmit = useCallback(() => {
    const h = pastedHash.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(h)) {
      toast({ title: "Invalid hash", description: "Enter a 64-character hex SHA-256 digest.", variant: "destructive" });
      return;
    }
    setComputedHash(h);
    queryRegistry(h);
  }, [pastedHash, queryRegistry, toast]);

  const handleReset = useCallback(() => {
    setResult(null);
    setHistory(null);
    setComputedHash(null);
    setPastedHash("");
    setDroppedFilename(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const isLoading = isHashing || isSearching;

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center p-6 md:p-12">
      {/* Nav */}
      <div className="w-full max-w-3xl flex items-center justify-end mb-8">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors font-medium">
          <Lock className="w-4 h-4" /> Fingerprint a file
        </Link>
      </div>

      <div className="max-w-3xl w-full mx-auto space-y-10">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
            <Search className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif tracking-tight text-foreground">Verify Fingerprint</h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Check whether a file's SHA-256 fingerprint exists in the permanent Hedera registry.
            No account needed — the blockchain is public.
          </p>
        </div>

        {/* Mode toggle */}
        {!result && !isLoading && (
          <div className="flex items-center justify-center gap-1 p-1 bg-muted rounded-lg w-fit mx-auto">
            <button
              data-testid="mode-file"
              onClick={() => { setMode("file"); handleReset(); }}
              className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${mode === "file" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Drop a file
            </button>
            <button
              data-testid="mode-hash"
              onClick={() => { setMode("hash"); handleReset(); }}
              className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${mode === "hash" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Paste a hash
            </button>
          </div>
        )}

        {/* File drop mode */}
        {mode === "file" && !isLoading && !result && (
          <div
            data-testid="verify-drop-zone"
            className={`border-2 border-dashed rounded-xl p-12 transition-all duration-200 cursor-pointer flex flex-col items-center justify-center text-center
              ${isDragging ? "border-primary bg-primary/5 scale-[1.02]" : "border-border hover:border-primary/50 hover:bg-muted/50"}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input type="file" className="hidden" ref={fileInputRef} onChange={onFileChange} />
            <div className="w-16 h-16 rounded-full bg-background border shadow-sm flex items-center justify-center mb-6">
              <Upload className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-medium mb-2">Drop a file to verify</h3>
            <p className="text-muted-foreground max-w-sm">
              The file's SHA-256 hash will be computed locally, then checked against the Hedera registry. The file never leaves your device.
            </p>
          </div>
        )}

        {/* Hash paste mode */}
        {mode === "hash" && !isLoading && !result && (
          <div className="space-y-4" data-testid="hash-input-section">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">SHA-256 fingerprint</label>
              <div className="flex gap-3">
                <Input
                  data-testid="hash-input"
                  value={pastedHash}
                  onChange={e => setPastedHash(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleHashSubmit()}
                  placeholder="64-character hex digest"
                  className="font-mono text-sm flex-1"
                  spellCheck={false}
                />
                <Button
                  data-testid="verify-submit-button"
                  onClick={handleHashSubmit}
                  disabled={!pastedHash.trim()}
                  className="shrink-0"
                >
                  Verify
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Paste the SHA-256 hash from a File Fingerprint certificate.</p>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <Card>
            <CardContent className="p-12 flex flex-col items-center justify-center text-center space-y-6">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <div className="space-y-2">
                <h3 className="text-xl font-medium">
                  {isHashing ? "Computing SHA-256 hash…" : "Searching Hedera registry…"}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {isHashing
                    ? "Reading file on your device."
                    : "Querying all messages on the registry topic via the public Mirror Node."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Result ──────────────────────────────────────────────────────── */}
        {result && !isLoading && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">

            {/* Verification card */}
            <Card className={`overflow-hidden shadow-lg ${result.verified ? "border-green-200" : "border-red-200"}`} data-testid="verify-result">
              <div className={`px-8 py-6 border-b flex items-center gap-4 ${result.verified ? "bg-green-50" : "bg-red-50"}`}>
                {result.verified
                  ? <ShieldCheck className="w-8 h-8 text-green-600 shrink-0" />
                  : <ShieldX className="w-8 h-8 text-red-500 shrink-0" />}
                <div>
                  <p className={`text-sm font-semibold tracking-wider uppercase ${result.verified ? "text-green-700" : "text-red-600"}`}>
                    {result.verified ? "Verified" : "Not found"}
                  </p>
                  <p className="text-xl font-serif text-foreground mt-0.5">
                    {result.verified
                      ? "This fingerprint is registered on-chain"
                      : "No record found in the Hedera registry"}
                  </p>
                </div>
              </div>

              <CardContent className="p-0">
                <div className="divide-y">
                  {/* Hash */}
                  <div className="p-8 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">SHA-256 Fingerprint Checked</p>
                    <p className="font-mono text-sm md:text-base break-all text-foreground leading-relaxed select-all" data-testid="verified-hash">
                      {result.hash}
                    </p>
                    {droppedFilename && (
                      <p className="text-xs text-muted-foreground">
                        Computed from: <span className="font-medium text-foreground">{droppedFilename}</span>
                      </p>
                    )}
                  </div>

                  {/* On-chain details */}
                  {result.verified && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x bg-muted/30">
                        <div className="p-6 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Registered File</p>
                          <p className="font-medium truncate" title={result.filename}>{result.filename}</p>
                          {result.fileSize != null && (
                            <p className="text-xs text-muted-foreground">{formatBytes(result.fileSize)}</p>
                          )}
                        </div>
                        <div className="p-6 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Current Visibility</p>
                          <VisBadge v={result.visibility ?? "public"} />
                        </div>
                      </div>

                      {result.ownerAccountId && (
                        <div className="p-6 space-y-2 bg-muted/20">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Owner Account</p>
                          <div className="flex items-center gap-3 flex-wrap">
                            <p className="font-mono text-sm text-foreground">{result.ownerAccountId}</p>
                            <Link
                              href={`/profile/${result.ownerAccountId}`}
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                            >
                              View public profile <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        </div>
                      )}

                      <div className="p-8 space-y-4">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">On-Chain Record</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Registry Topic ID</p>
                            <p className="font-mono text-xs text-foreground" data-testid="verified-topic-id">{result.topicId}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">First Consensus Timestamp</p>
                            <p className="font-mono text-xs text-foreground" data-testid="verified-timestamp">{result.consensusTimestamp}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/8 px-2.5 py-1 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                            Hedera Testnet
                          </span>
                          {result.explorerUrl && (
                            <a href={result.explorerUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                              data-testid="verified-explorer-link">
                              View registry on HashScan <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Not found explanation */}
                  {!result.verified && (
                    <div className="p-8">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        This fingerprint does not exist in the Hedera registry topic{" "}
                        <span className="font-mono text-xs text-foreground">{result.topicId}</span>.
                        Either the file was never fingerprinted using this system, or a different file was altered to produce this hash.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── History timeline ─────────────────────────────────────────── */}
            {result.verified && (
              <div className="rounded-xl border border-border overflow-hidden">
                {/* Accordion header */}
                <button
                  onClick={() => setHistoryOpen(v => !v)}
                  className="w-full flex items-center justify-between px-6 py-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <History className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="font-medium text-foreground text-sm">
                        Registration History
                        {history && history.length > 0 && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {history.length} {history.length === 1 ? "event" : "events"}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Full timeline of on-chain events for this fingerprint — pulled directly from Hedera
                      </p>
                    </div>
                  </div>
                  {historyOpen
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>

                {historyOpen && (
                  <div className="border-t p-6">
                    {/* Loading skeleton */}
                    {isLoadingHistory && (
                      <div className="flex items-center gap-3 text-muted-foreground py-4">
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span className="text-sm">Loading history from Hedera Mirror Node…</span>
                      </div>
                    )}

                    {/* Empty */}
                    {!isLoadingHistory && history !== null && history.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No history events found — this may be a legacy record predating the event log.
                      </p>
                    )}

                    {/* Timeline */}
                    {!isLoadingHistory && history && history.length > 0 && (
                      <div className="space-y-0">
                        {history.map((event, i) => (
                          <TimelineEvent
                            key={event.consensusTimestamp}
                            event={event}
                            prev={i > 0 ? history[i - 1] : null}
                            isLast={i === history.length - 1}
                            index={i}
                          />
                        ))}

                        {/* Summary footer */}
                        <div className="mt-2 pt-4 border-t flex items-center justify-between flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>
                            {history.length} on-chain {history.length === 1 ? "event" : "events"} ·{" "}
                            First registered {hederaTsToDate(history[0].consensusTimestamp).toLocaleDateString()}
                            {history.length > 1 && (
                              <> · Last updated {hederaTsToDate(history[history.length - 1].consensusTimestamp).toLocaleDateString()}</>
                            )}
                          </span>
                          {result.explorerUrl && (
                            <a href={result.explorerUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 hover:text-primary transition-colors">
                              View all on HashScan <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-center">
              <Button variant="outline" size="lg" onClick={handleReset} data-testid="verify-reset-button" className="gap-2">
                <RotateCcw className="w-4 h-4" /> Verify another file
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
