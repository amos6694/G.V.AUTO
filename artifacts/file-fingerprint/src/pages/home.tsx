import React, { useState, useCallback, useRef } from "react";
import { Link } from "wouter";
import {
  Upload, File, Copy, Check, RefreshCw, Lock, UserPlus, Shield,
  ExternalLink, Loader2, Search, Link2, Globe, EyeOff, Users,
  Settings, ChevronDown, ChevronUp, Fingerprint,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PrivacyModal } from "@/components/PrivacyModal";

type Visibility = "private" | "semi-public" | "public";

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

interface HederaRecord {
  transactionId: string;
  topicId: string;
  network: string;
  explorerUrl: string;
  alreadyRegistered: boolean;
  originalTimestamp?: string;
  ownerAccountId?: string;
}

interface Permission {
  id: string;
  grantee: string;
  grantedAt: string;
}

function VisibilityBadge({ v }: { v: Visibility }) {
  if (v === "private")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
        <EyeOff className="w-3 h-3" /> Private
      </span>
    );
  if (v === "semi-public")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
        <Users className="w-3 h-3" /> Semi-Public
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
      <Globe className="w-3 h-3" /> Public
    </span>
  );
}

// ─── Drop zone (reusable) ─────────────────────────────────────────────────────
interface DropZoneProps {
  id: string;
  label: string;
  sub: string;
  onFile: (f: File) => void;
}
function DropZone({ id, label, sub, onFile }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`border-2 border-dashed rounded-xl p-12 transition-all duration-200 ease-in-out cursor-pointer flex flex-col items-center justify-center text-center
        ${dragging ? "border-primary bg-primary/5 scale-[1.02]" : "border-border hover:border-primary/50 hover:bg-muted/50"}`}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={e => { e.preventDefault(); setDragging(false); }}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
      }}
      onClick={() => ref.current?.click()}
    >
      <input id={id} type="file" className="hidden" ref={ref}
        onChange={e => { if (e.target.files?.[0]) { onFile(e.target.files[0]); e.target.value = ""; } }} />
      <div className="w-16 h-16 rounded-full bg-background border shadow-sm flex items-center justify-center mb-6">
        <Upload className="w-6 h-6 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-medium mb-2">{label}</h3>
      <p className="text-muted-foreground max-w-sm">{sub}</p>
    </div>
  );
}

// ─── Inline certificate ───────────────────────────────────────────────────────
interface CertProps {
  fileData: { name: string; size: number };
  hash: string;
  timestamp: string;
  visibility: Visibility;
  hederaRecord: HederaRecord | null;
  isRegistering: boolean;
  registrationError: string | null;
  copied: boolean;
  linkCopied: boolean;
  permissions: Permission[];
  granteeInput: string;
  onCopyHash: () => void;
  onCopyLink: () => void;
  onReset: () => void;
  onRetry: () => void;
  onGrant: () => void;
  onGrantKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onGranteeChange: (v: string) => void;
  onPrivacySettings: () => void;
  showPrivacySettings: boolean;
}
function Certificate({
  fileData, hash, timestamp, visibility, hederaRecord, isRegistering,
  registrationError, copied, linkCopied, permissions, granteeInput,
  onCopyHash, onCopyLink, onReset, onRetry, onGrant, onGrantKeyDown,
  onGranteeChange, onPrivacySettings, showPrivacySettings,
}: CertProps) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
      <Card className="overflow-hidden border-border/50 shadow-lg" data-testid="certificate-block">
        {/* Header */}
        <div className="bg-muted px-8 py-6 border-b flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Certificate of Fingerprint</h2>
            <p className="text-2xl font-serif text-foreground">SHA-256 Integrity Record</p>
          </div>
          <div className="flex items-center gap-2">
            {showPrivacySettings && hederaRecord && (
              <button
                onClick={onPrivacySettings}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors border border-border rounded-lg px-3 py-1.5 hover:border-primary/40"
                title="Change visibility"
              >
                <Settings className="w-3.5 h-3.5" />
                Privacy Settings
              </button>
            )}
            <File className="w-8 h-8 text-primary opacity-20" />
          </div>
        </div>

        <CardContent className="p-0">
          <div className="divide-y">
            {/* Hash */}
            <div className="p-8 space-y-4">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Digital Fingerprint</p>
              <div className="font-mono text-xl md:text-2xl lg:text-3xl text-foreground break-all leading-tight tracking-tight select-all" data-testid="fingerprint-display">
                {hash}
              </div>
            </div>

            {/* File metadata */}
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x bg-muted/30">
              <div className="p-6 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">File Name</p>
                <p className="font-medium truncate" title={fileData.name}>{fileData.name}</p>
              </div>
              <div className="p-6 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">File Size</p>
                <p className="font-mono text-sm">{formatBytes(fileData.size)}</p>
              </div>
              <div className="p-6 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Generated At</p>
                <p className="font-mono text-sm">{new Date(timestamp).toLocaleString()}</p>
              </div>
            </div>

            {/* Blockchain record */}
            <div className="p-8 space-y-4" data-testid="hedera-record">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Blockchain Record</p>
                <div className="flex items-center gap-2">
                  <VisibilityBadge v={visibility} />
                  {hederaRecord?.alreadyRegistered && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full" data-testid="already-registered-badge">
                      Previously registered
                    </span>
                  )}
                </div>
              </div>

              {isRegistering && (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span className="text-sm">Writing to Hedera Testnet…</span>
                </div>
              )}

              {registrationError && !isRegistering && (
                <div className="space-y-3">
                  <p className="text-sm text-destructive">{registrationError}</p>
                  <Button variant="outline" size="sm" onClick={onRetry} data-testid="retry-hedera-button">
                    Retry registration
                  </Button>
                </div>
              )}

              {hederaRecord && !isRegistering && (
                <div className="space-y-4">
                  {hederaRecord.alreadyRegistered && hederaRecord.originalTimestamp && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                      This fingerprint was first registered on{" "}
                      <span className="font-medium">{new Date(hederaRecord.originalTimestamp).toLocaleString()}</span>.
                      No new blockchain record was created.
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {hederaRecord.alreadyRegistered ? "Original Record Reference" : "Transaction ID"}
                      </p>
                      <p className="font-mono text-xs break-all text-foreground leading-relaxed" data-testid="hedera-transaction-id">
                        {hederaRecord.transactionId}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Registry Topic ID</p>
                      <p className="font-mono text-xs text-foreground" data-testid="hedera-topic-id">{hederaRecord.topicId}</p>
                    </div>
                  </div>
                  {hederaRecord.ownerAccountId && visibility !== "private" && (
                    <div className="rounded-lg bg-muted/40 border px-4 py-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {visibility === "semi-public" ? "Owner Account (always attached)" : "Owner Account"}
                      </p>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="font-mono text-sm text-foreground">{hederaRecord.ownerAccountId}</p>
                        <Link
                          href={`/profile/${hederaRecord.ownerAccountId}`}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                          View public profile <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/8 px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                      Hedera Testnet
                    </span>
                    <a href={hederaRecord.explorerUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors" data-testid="hedera-explorer-link">
                      View registry on HashScan <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Authorized viewers */}
            {permissions.length > 0 && (
              <div className="p-8 space-y-4" data-testid="permissions-list">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Authorized Viewers</p>
                </div>
                <div className="space-y-3">
                  {permissions.map(p => (
                    <div key={p.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-3 border-b border-border/40 last:border-0">
                      <span className="font-medium text-foreground">{p.grantee}</span>
                      <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        Granted {new Date(p.grantedAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Grant access */}
      <div className="rounded-xl border border-border bg-muted/20 p-6 space-y-4" data-testid="grant-access-section">
        <div className="space-y-1">
          <h3 className="font-medium text-foreground flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            Grant access to this fingerprint
          </h3>
          <p className="text-sm text-muted-foreground">
            Enter a name or email address. The record will appear on the certificate with the date access was granted.
          </p>
        </div>
        <div className="flex gap-3">
          <Input
            data-testid="grantee-input"
            type="text"
            placeholder="Name or email address"
            value={granteeInput}
            onChange={e => onGranteeChange(e.target.value)}
            onKeyDown={onGrantKeyDown}
            className="flex-1"
          />
          <Button data-testid="grant-button" onClick={onGrant} disabled={!granteeInput.trim()} className="shrink-0">
            Grant Access
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <Button size="lg" className="w-full sm:w-auto text-base gap-2 font-medium" onClick={onCopyHash} data-testid="copy-button">
          {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
          {copied ? "Copied!" : "Copy fingerprint"}
        </Button>
        {visibility !== "private" && (
          <Button variant="outline" size="lg" className="w-full sm:w-auto text-base gap-2" onClick={onCopyLink}>
            {linkCopied ? <Check className="w-5 h-5" /> : <Link2 className="w-5 h-5" />}
            {linkCopied ? "Link copied!" : "Copy verification link"}
          </Button>
        )}
        <Button variant="outline" size="lg" className="w-full sm:w-auto text-base gap-2" onClick={onReset} data-testid="reset-button">
          <RefreshCw className="w-5 h-5" /> Fingerprint another file
        </Button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Home() {
  const { toast } = useToast();

  // ── Main (public) flow ────────────────────────────────────────────────────
  const [isComputing, setIsComputing] = useState(false);
  const [fileData, setFileData] = useState<{ name: string; size: number } | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const [hederaRecord, setHederaRecord] = useState<HederaRecord | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [currentVisibility, setCurrentVisibility] = useState<Visibility>("public");
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [granteeInput, setGranteeInput] = useState("");

  // ── Private flow ──────────────────────────────────────────────────────────
  const [showPrivate, setShowPrivate] = useState(false);
  const [isComputingPrivate, setIsComputingPrivate] = useState(false);
  const [privateFileData, setPrivateFileData] = useState<{ name: string; size: number } | null>(null);
  const [privateHash, setPrivateHash] = useState<string | null>(null);
  const [privateTimestamp, setPrivateTimestamp] = useState<string | null>(null);
  const [privateHederaRecord, setPrivateHederaRecord] = useState<HederaRecord | null>(null);
  const [isRegisteringPrivate, setIsRegisteringPrivate] = useState(false);
  const [privateError, setPrivateError] = useState<string | null>(null);
  const [privateCopied, setPrivateCopied] = useState(false);

  // ── Privacy modal ─────────────────────────────────────────────────────────
  const [privacyModal, setPrivacyModal] = useState(false);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  async function doHash(file: File): Promise<{ hashHex: string; ts: string }> {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, "0")).join("");
    return { hashHex, ts: new Date().toISOString() };
  }

  async function registerOnHedera(
    hashHex: string, file: { name: string; size: number }, ts: string, vis: Visibility
  ): Promise<HederaRecord> {
    const res = await fetch("/api/fingerprint/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hash: hashHex, filename: file.name, fileSize: file.size, timestamp: ts, visibility: vis }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `Server error ${res.status}`);
    }
    return res.json() as Promise<HederaRecord>;
  }

  // ─── Main flow handlers ────────────────────────────────────────────────────
  const handleMainFile = useCallback(async (file: File) => {
    setIsComputing(true);
    setFileData({ name: file.name, size: file.size });
    setHash(null);
    setTimestamp(null);
    setHederaRecord(null);
    setRegistrationError(null);
    setCurrentVisibility("public");
    setCopied(false);
    setLinkCopied(false);
    setPermissions([]);
    setGranteeInput("");
    try {
      const { hashHex, ts } = await doHash(file);
      setHash(hashHex);
      setTimestamp(ts);
    } catch {
      toast({ title: "Error reading file", description: "Could not compute fingerprint.", variant: "destructive" });
    } finally {
      setIsComputing(false);
    }
  }, [toast]);

  const handleRegisterChoice = useCallback(async (vis: "public" | "semi-public") => {
    if (!hash || !fileData || !timestamp) return;
    setIsRegistering(true);
    setCurrentVisibility(vis);
    setRegistrationError(null);
    try {
      const rec = await registerOnHedera(hash, fileData, timestamp, vis);
      setHederaRecord(rec);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setRegistrationError(msg);
      toast({ title: "Blockchain registration failed", description: msg, variant: "destructive" });
    } finally {
      setIsRegistering(false);
    }
  }, [hash, fileData, timestamp, toast]);

  const handleMainReset = useCallback(() => {
    setFileData(null);
    setHash(null);
    setTimestamp(null);
    setHederaRecord(null);
    setRegistrationError(null);
    setCurrentVisibility("public");
    setCopied(false);
    setLinkCopied(false);
    setPermissions([]);
    setGranteeInput("");
  }, []);

  const handleCopyHash = useCallback(async () => {
    if (!hash) return;
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    toast({ title: "Fingerprint copied" });
    setTimeout(() => setCopied(false), 2000);
  }, [hash, toast]);

  const handleCopyLink = useCallback(async () => {
    if (!hash) return;
    await navigator.clipboard.writeText(`${window.location.origin}/verify?hash=${hash}`);
    setLinkCopied(true);
    toast({ title: "Verification link copied" });
    setTimeout(() => setLinkCopied(false), 2000);
  }, [hash, toast]);

  const handleGrant = useCallback(() => {
    const t = granteeInput.trim();
    if (!t) return;
    setPermissions(prev => [...prev, { id: crypto.randomUUID(), grantee: t, grantedAt: new Date().toISOString() }]);
    setGranteeInput("");
    toast({ title: "Access granted", description: `${t} added.` });
  }, [granteeInput, toast]);

  const handleGrantKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleGrant();
  }, [handleGrant]);

  const handleRetryMain = useCallback(() => {
    if (hash && fileData && timestamp) handleRegisterChoice(currentVisibility as "public" | "semi-public");
  }, [hash, fileData, timestamp, currentVisibility, handleRegisterChoice]);

  // ─── Private flow handlers ─────────────────────────────────────────────────
  const handlePrivateFile = useCallback(async (file: File) => {
    setIsComputingPrivate(true);
    setPrivateFileData({ name: file.name, size: file.size });
    setPrivateHash(null);
    setPrivateTimestamp(null);
    setPrivateHederaRecord(null);
    setPrivateError(null);
    setPrivateCopied(false);
    try {
      const { hashHex, ts } = await doHash(file);
      setPrivateHash(hashHex);
      setPrivateTimestamp(ts);
      setIsComputingPrivate(false);
      setIsRegisteringPrivate(true);
      const rec = await registerOnHedera(hashHex, { name: file.name, size: file.size }, ts, "private");
      setPrivateHederaRecord(rec);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setPrivateError(msg);
      toast({ title: "Private registration failed", description: msg, variant: "destructive" });
    } finally {
      setIsComputingPrivate(false);
      setIsRegisteringPrivate(false);
    }
  }, [toast]);

  const handlePrivateReset = useCallback(() => {
    setPrivateFileData(null);
    setPrivateHash(null);
    setPrivateTimestamp(null);
    setPrivateHederaRecord(null);
    setPrivateError(null);
    setPrivateCopied(false);
  }, []);

  const handlePrivateCopy = useCallback(async () => {
    if (!privateHash) return;
    await navigator.clipboard.writeText(privateHash);
    setPrivateCopied(true);
    toast({ title: "Private fingerprint copied" });
    setTimeout(() => setPrivateCopied(false), 2000);
  }, [privateHash, toast]);

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center p-6 md:p-12">

      {/* Nav */}
      <div className="w-full max-w-3xl flex items-center justify-end mb-8">
        <Link href="/verify" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors font-medium">
          <Search className="w-4 h-4" /> Verify a fingerprint
        </Link>
      </div>

      <div className="max-w-3xl w-full mx-auto space-y-12">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif tracking-tight text-foreground">File Fingerprint</h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto font-sans leading-relaxed">
            Establish proof of a file's existence and integrity at a specific moment.
            Cryptographic hashing is performed entirely on your device and registered to the Hedera testnet blockchain.
          </p>
        </div>

        {/* ── Main (public) upload area ────────────────────────────────────── */}
        {!fileData && !isComputing && (
          <DropZone
            id="main-file"
            label="Select a file to fingerprint"
            sub="Drag and drop any file here, or click to browse. The file never leaves your computer."
            onFile={handleMainFile}
          />
        )}

        {isComputing && (
          <Card className="w-full">
            <CardContent className="p-12 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              <div className="space-y-2">
                <h3 className="text-xl font-medium animate-pulse">Computing SHA-256 Hash</h3>
                <p className="text-muted-foreground">Reading file and generating cryptographic fingerprint…</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Post-hash visibility choice (before registration) ─────────────── */}
        {hash && fileData && timestamp && !hederaRecord && !isRegistering && !registrationError && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Mini certificate preview — just hash + file info */}
            <Card className="overflow-hidden border-border/50 shadow-lg">
              <div className="bg-muted px-8 py-6 border-b flex items-start justify-between">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Fingerprint Ready</h2>
                  <p className="text-2xl font-serif text-foreground">{fileData.name}</p>
                </div>
                <File className="w-8 h-8 text-primary opacity-20" />
              </div>
              <CardContent className="p-0">
                <div className="p-8 space-y-4">
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Digital Fingerprint</p>
                  <div className="font-mono text-base md:text-lg text-foreground break-all leading-tight tracking-tight select-all">
                    {hash}
                  </div>
                </div>
                <div className="grid grid-cols-2 divide-x bg-muted/30 border-t">
                  <div className="p-4 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">File Size</p>
                    <p className="font-mono text-sm">{formatBytes(fileData.size)}</p>
                  </div>
                  <div className="p-4 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Hashed At</p>
                    <p className="font-mono text-sm">{new Date(timestamp).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Visibility choice */}
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="font-semibold text-foreground">How should this be registered?</h3>
                <p className="text-sm text-muted-foreground">Choose how this fingerprint appears on Hedera. You can change this later at any time.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => handleRegisterChoice("public")}
                  className="text-left rounded-lg border border-border hover:border-emerald-400 hover:bg-emerald-50/50 p-4 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      <Globe className="w-3 h-3" /> Public
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Freely discoverable. Anyone can verify this fingerprint. Listed on your public profile.</p>
                </button>
                <button
                  onClick={() => handleRegisterChoice("semi-public")}
                  className="text-left rounded-lg border border-border hover:border-blue-400 hover:bg-blue-50/50 p-4 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                      <Users className="w-3 h-3" /> Semi-Public
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Shareable by others, but your account ID and timestamp are permanently attached to every copy.</p>
                </button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Want full privacy?{" "}
                <button
                  onClick={() => { handleMainReset(); setShowPrivate(true); }}
                  className="text-primary hover:underline font-medium"
                >
                  Use the private registration section below.
                </button>
              </p>
            </div>

            <div className="flex justify-center">
              <Button variant="ghost" size="sm" onClick={handleMainReset} className="text-muted-foreground gap-2">
                <RefreshCw className="w-4 h-4" /> Choose a different file
              </Button>
            </div>
          </div>
        )}

        {/* Registering spinner (between choice and full certificate) */}
        {hash && fileData && (isRegistering || (registrationError && !hederaRecord)) && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <Card className="w-full">
              <CardContent className="p-12 flex flex-col items-center justify-center text-center space-y-6">
                {isRegistering ? (
                  <>
                    <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <div className="space-y-2">
                      <h3 className="text-xl font-medium">Registering on Hedera Testnet…</h3>
                      <p className="text-muted-foreground">Submitting your fingerprint to the blockchain.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-destructive">{registrationError}</p>
                    <Button variant="outline" onClick={handleRetryMain}>Retry registration</Button>
                    <Button variant="ghost" size="sm" onClick={handleMainReset}>Choose a different file</Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Full certificate — shown after successful registration */}
        {hash && fileData && timestamp && hederaRecord && (
          <Certificate
            fileData={fileData}
            hash={hash}
            timestamp={timestamp}
            visibility={currentVisibility}
            hederaRecord={hederaRecord}
            isRegistering={isRegistering}
            registrationError={registrationError}
            copied={copied}
            linkCopied={linkCopied}
            permissions={permissions}
            granteeInput={granteeInput}
            onCopyHash={handleCopyHash}
            onCopyLink={handleCopyLink}
            onReset={handleMainReset}
            onRetry={handleRetryMain}
            onGrant={handleGrant}
            onGrantKeyDown={handleGrantKeyDown}
            onGranteeChange={setGranteeInput}
            onPrivacySettings={() => setPrivacyModal(true)}
            showPrivacySettings
          />
        )}

        {/* ── Private Registration section ─────────────────────────────────── */}
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <button
            onClick={() => setShowPrivate(v => !v)}
            className="w-full flex items-center justify-between px-6 py-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <EyeOff className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">Private Registration</p>
                <p className="text-xs text-muted-foreground">
                  Register without any public trace — your record is hidden from all verifications and profiles.
                </p>
              </div>
            </div>
            {showPrivate ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
          </button>

          {showPrivate && (
            <div className="p-6 space-y-6 border-t">
              {/* Callout */}
              <div className="flex gap-3 text-sm bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                <EyeOff className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <p className="text-slate-700">
                  Private registrations are written to the public Hedera ledger but are invisible to all verify lookups and public profiles.
                  Others uploading the same file see no trace of your record.
                </p>
              </div>

              {/* Private drop zone */}
              {!privateFileData && !isComputingPrivate && (
                <DropZone
                  id="private-file"
                  label="Select a file for private registration"
                  sub="The file never leaves your computer. Registration is always private — no choice required."
                  onFile={handlePrivateFile}
                />
              )}

              {/* Private computing */}
              {isComputingPrivate && (
                <Card>
                  <CardContent className="p-10 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <p className="font-medium animate-pulse">Computing hash…</p>
                  </CardContent>
                </Card>
              )}

              {/* Private registering */}
              {isRegisteringPrivate && !isComputingPrivate && (
                <Card>
                  <CardContent className="p-10 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <p className="font-medium">Registering privately on Hedera Testnet…</p>
                  </CardContent>
                </Card>
              )}

              {/* Private error */}
              {privateError && !isComputingPrivate && !isRegisteringPrivate && (
                <div className="text-sm text-destructive text-center space-y-2">
                  <p>{privateError}</p>
                  <Button variant="outline" size="sm" onClick={handlePrivateReset}>Try again</Button>
                </div>
              )}

              {/* Private certificate */}
              {privateHash && privateFileData && privateTimestamp && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <Card className="overflow-hidden border-slate-200 shadow">
                    <div className="bg-slate-50 px-8 py-6 border-b flex items-start justify-between">
                      <div className="space-y-1">
                        <h2 className="text-sm font-semibold tracking-wider text-slate-500 uppercase">Private Certificate</h2>
                        <p className="text-xl font-serif text-foreground">{privateFileData.name}</p>
                      </div>
                      <VisibilityBadge v="private" />
                    </div>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        <div className="p-8 space-y-3">
                          <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Digital Fingerprint</p>
                          <div className="font-mono text-sm md:text-base text-foreground break-all leading-tight tracking-tight select-all">
                            {privateHash}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 divide-x bg-muted/30">
                          <div className="p-4 space-y-1">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Size</p>
                            <p className="font-mono text-xs">{formatBytes(privateFileData.size)}</p>
                          </div>
                          <div className="p-4 space-y-1">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Hashed At</p>
                            <p className="font-mono text-xs">{new Date(privateTimestamp).toLocaleString()}</p>
                          </div>
                          <div className="p-4 space-y-1">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Blockchain</p>
                            <p className="font-mono text-xs">
                              {isRegisteringPrivate ? (
                                <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Writing…</span>
                              ) : privateHederaRecord ? (
                                <a href={privateHederaRecord.explorerUrl} target="_blank" rel="noopener noreferrer"
                                  className="text-primary hover:underline">HashScan ↗</a>
                              ) : "—"}
                            </p>
                          </div>
                        </div>
                        {privateHederaRecord && (
                          <div className="px-8 py-4">
                            <p className="font-mono text-xs text-muted-foreground break-all">{privateHederaRecord.transactionId}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  {/* Private actions */}
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Button size="sm" variant="outline" className="gap-2" onClick={handlePrivateCopy}>
                      {privateCopied ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy fingerprint</>}
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-2 text-muted-foreground" onClick={handlePrivateReset}>
                      <RefreshCw className="w-4 h-4" /> Register another privately
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* ── Privacy Settings Modal ──────────────────────────────────────────── */}
      {privacyModal && hash && fileData && hederaRecord && (
        <PrivacyModal
          hash={hash}
          filename={fileData.name}
          currentVisibility={currentVisibility}
          onSuccess={newVis => {
            setCurrentVisibility(newVis);
            setPrivacyModal(false);
            toast({ title: "Visibility updated", description: `This registration is now ${newVis}.` });
          }}
          onClose={() => setPrivacyModal(false)}
        />
      )}
    </div>
  );
}
