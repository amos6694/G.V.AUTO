import React, { useState, useCallback, useRef } from "react";
import { Link } from "wouter";
import { Upload, File, Copy, Check, RefreshCw, Lock, UserPlus, Shield, ExternalLink, Loader2, Search, Link2, Globe, EyeOff, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

interface Permission {
  id: string;
  grantee: string;
  grantedAt: string;
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

export default function Home() {
  const [isDragging, setIsDragging] = useState(false);
  const [isComputing, setIsComputing] = useState(false);
  const [fileData, setFileData] = useState<{ name: string; size: number; lastModified: number } | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [granteeInput, setGranteeInput] = useState("");
  const [hederaRecord, setHederaRecord] = useState<HederaRecord | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const registerOnHedera = async (hashHex: string, file: { name: string; size: number }, ts: string, vis: "public" | "private") => {
    setIsRegistering(true);
    setRegistrationError(null);
    try {
      const res = await fetch("/api/fingerprint/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hash: hashHex,
          filename: file.name,
          fileSize: file.size,
          timestamp: ts,
          visibility: vis,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Server error ${res.status}`);
      }
      const data = await res.json() as HederaRecord;
      setHederaRecord(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setRegistrationError(msg);
      toast({
        title: "Blockchain registration failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsRegistering(false);
    }
  };

  const computeHash = async (file: File) => {
    setIsComputing(true);
    setFileData({ name: file.name, size: file.size, lastModified: file.lastModified });
    setHash(null);
    setTimestamp(null);
    setCopied(false);
    setPermissions([]);
    setGranteeInput("");
    setHederaRecord(null);
    setRegistrationError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      const ts = new Date().toISOString();

      setHash(hashHex);
      setTimestamp(ts);
      setIsComputing(false);

      await registerOnHedera(hashHex, { name: file.name, size: file.size }, ts, visibility);
    } catch (error) {
      setIsComputing(false);
      toast({
        title: "Error computing fingerprint",
        description: "There was a problem reading or hashing the file.",
        variant: "destructive",
      });
    }
  };

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      computeHash(e.dataTransfer.files[0]);
    }
  }, []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      computeHash(e.target.files[0]);
    }
  }, []);

  const handleCopy = useCallback(async () => {
    if (hash) {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      toast({ title: "Fingerprint copied", description: "The SHA-256 hash has been copied to your clipboard." });
      setTimeout(() => setCopied(false), 2000);
    }
  }, [hash, toast]);

  const handleCopyLink = useCallback(async () => {
    if (!hash) return;
    const url = `${window.location.origin}/verify?hash=${hash}`;
    await navigator.clipboard.writeText(url);
    setLinkCopied(true);
    toast({ title: "Verification link copied", description: "Anyone with this link can verify the fingerprint on Hedera." });
    setTimeout(() => setLinkCopied(false), 2000);
  }, [hash, toast]);

  const handleReset = useCallback(() => {
    setFileData(null);
    setHash(null);
    setTimestamp(null);
    setPermissions([]);
    setGranteeInput("");
    setHederaRecord(null);
    setRegistrationError(null);
    setLinkCopied(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleGrantAccess = useCallback(() => {
    const trimmed = granteeInput.trim();
    if (!trimmed) return;
    setPermissions(prev => [...prev, { id: crypto.randomUUID(), grantee: trimmed, grantedAt: new Date().toISOString() }]);
    setGranteeInput("");
    toast({ title: "Access granted", description: `${trimmed} has been added to the permission record.` });
  }, [granteeInput, toast]);

  const handleGrantKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleGrantAccess();
  }, [handleGrantAccess]);

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center p-6 md:p-12">
      {/* Nav */}
      <div className="w-full max-w-3xl flex items-center justify-end mb-8">
        <Link href="/verify" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors font-medium">
          <Search className="w-4 h-4" />
          Verify a fingerprint
        </Link>
      </div>
      <div className="max-w-3xl w-full mx-auto space-y-10">

        {/* Header */}
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

        {/* Visibility toggle — shown before file is uploaded */}
        {!fileData && !isComputing && (
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => setVisibility("private")}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-l-lg border text-sm font-medium transition-colors
                ${visibility === "private"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted/60"}`}
            >
              <EyeOff className="w-4 h-4" />
              Private
            </button>
            <button
              type="button"
              onClick={() => setVisibility("semi-public")}
              className={`inline-flex items-center gap-1.5 px-4 py-2 border-y border-r text-sm font-medium transition-colors
                ${visibility === "semi-public"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted/60"}`}
            >
              <Users className="w-4 h-4" />
              Semi-Public
            </button>
            <button
              type="button"
              onClick={() => setVisibility("public")}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-r-lg border-y border-r text-sm font-medium transition-colors
                ${visibility === "public"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted/60"}`}
            >
              <Globe className="w-4 h-4" />
              Public
            </button>
          </div>
        )}
        {!fileData && !isComputing && (
          <p className="text-xs text-center text-muted-foreground -mt-6">
            {visibility === "private"
              ? "Only you can access this. Others uploading the same file start fresh with no trace of your record."
              : visibility === "semi-public"
              ? "Shareable by others, but your account ID and timestamp are permanently attached to every copy."
              : "Freely discoverable by anyone. Listed on your public profile."}
          </p>
        )}

        {/* Drop zone */}
        {!fileData && !isComputing && (
          <div
            data-testid="drop-zone"
            className={`border-2 border-dashed rounded-xl p-12 transition-all duration-200 ease-in-out cursor-pointer flex flex-col items-center justify-center text-center
              ${isDragging ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-border hover:border-primary/50 hover:bg-muted/50'}
            `}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input type="file" className="hidden" ref={fileInputRef} onChange={onFileChange} />
            <div className="w-16 h-16 rounded-full bg-background border shadow-sm flex items-center justify-center mb-6">
              <Upload className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-medium mb-2">Select a file to fingerprint</h3>
            <p className="text-muted-foreground max-w-sm">
              Drag and drop any file here, or click to browse. The file never leaves your computer.
            </p>
          </div>
        )}

        {/* Computing state */}
        {isComputing && (
          <Card className="w-full">
            <CardContent className="p-12 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              <div className="space-y-2">
                <h3 className="text-xl font-medium animate-pulse">Computing SHA-256 Hash</h3>
                <p className="text-muted-foreground">Reading file and generating cryptographic fingerprint...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Certificate */}
        {hash && fileData && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
            <Card className="overflow-hidden border-border/50 shadow-lg" data-testid="certificate-block">

              {/* Certificate header */}
              <div className="bg-muted px-8 py-6 border-b flex items-start justify-between">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Certificate of Fingerprint</h2>
                  <p className="text-2xl font-serif text-foreground">SHA-256 Integrity Record</p>
                </div>
                <File className="w-8 h-8 text-primary opacity-20" />
              </div>

              <CardContent className="p-0">
                <div className="divide-y">

                  {/* Hash */}
                  <div className="p-8 space-y-4">
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Digital Fingerprint</p>
                    <div
                      className="font-mono text-xl md:text-2xl lg:text-3xl text-foreground break-all leading-tight tracking-tight select-all"
                      data-testid="fingerprint-display"
                    >
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
                      <p className="font-mono text-sm">{timestamp ? new Date(timestamp).toLocaleString() : ''}</p>
                    </div>
                  </div>

                  {/* Hedera blockchain record */}
                  <div className="p-8 space-y-4" data-testid="hedera-record">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Blockchain Record</p>
                      <div className="flex items-center gap-2">
                        {visibility === "private" ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
                            <EyeOff className="w-3 h-3" />
                            Private
                          </span>
                        ) : visibility === "semi-public" ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
                            <Users className="w-3 h-3" />
                            Semi-Public
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                            <Globe className="w-3 h-3" />
                            Public
                          </span>
                        )}
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
                        <span className="text-sm">Checking blockchain for existing record...</span>
                      </div>
                    )}

                    {registrationError && !isRegistering && (
                      <div className="space-y-3">
                        <p className="text-sm text-destructive">{registrationError}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => registerOnHedera(hash, fileData, timestamp!, visibility)}
                          data-testid="retry-hedera-button"
                        >
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
                            <p className="font-mono text-xs text-foreground" data-testid="hedera-topic-id">
                              {hederaRecord.topicId}
                            </p>
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
                                View public profile
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/8 px-2.5 py-1 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span>
                            Hedera Testnet
                          </span>
                          <a
                            href={hederaRecord.explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                            data-testid="hedera-explorer-link"
                          >
                            View registry on HashScan
                            <ExternalLink className="w-3 h-3" />
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
                        {permissions.map((p) => (
                          <div
                            key={p.id}
                            data-testid={`permission-record-${p.id}`}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-3 border-b border-border/40 last:border-0"
                          >
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
                  Enter a name or email address. The record will appear on the certificate above with the date access was granted.
                </p>
              </div>
              <div className="flex gap-3">
                <Input
                  data-testid="grantee-input"
                  type="text"
                  placeholder="Name or email address"
                  value={granteeInput}
                  onChange={(e) => setGranteeInput(e.target.value)}
                  onKeyDown={handleGrantKeyDown}
                  className="flex-1"
                />
                <Button
                  data-testid="grant-button"
                  onClick={handleGrantAccess}
                  disabled={!granteeInput.trim()}
                  className="shrink-0"
                >
                  Grant Access
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                className="w-full sm:w-auto text-base gap-2 font-medium"
                onClick={handleCopy}
                data-testid="copy-button"
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                {copied ? "Copied to clipboard" : "Copy fingerprint"}
              </Button>
              {visibility !== "private" && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto text-base gap-2"
                  onClick={handleCopyLink}
                >
                  {linkCopied ? <Check className="w-5 h-5" /> : <Link2 className="w-5 h-5" />}
                  {linkCopied ? "Link copied!" : "Copy verification link"}
                </Button>
              )}
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto text-base gap-2"
                onClick={handleReset}
                data-testid="reset-button"
              >
                <RefreshCw className="w-5 h-5" />
                Fingerprint another file
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
