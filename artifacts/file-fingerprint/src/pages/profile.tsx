import React, { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "wouter";
import {
  Lock, Globe, Users, ExternalLink, Search, FileText, ShieldCheck,
  Settings, EyeOff, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PrivacyModal } from "@/components/PrivacyModal";

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

type Visibility = "public" | "semi-public" | "private";

interface ProfileRecord {
  consensusTimestamp: string;
  sha256: string;
  filename: string;
  fileSize: number;
  registeredAt: string;
  visibility: Visibility;
  ownerAccountId?: string;
}

interface ProfileResponse {
  accountId: string;
  topicId: string;
  network: string;
  explorerUrl: string;
  records: ProfileRecord[];
}

function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  if (visibility === "private")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
        <EyeOff className="w-3 h-3" /> Private
      </span>
    );
  if (visibility === "semi-public")
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

export default function Profile() {
  const { accountId } = useParams<{ accountId: string }>();
  const { toast } = useToast();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Owner detection: compare the URL account with what was stored at registration time
  const myAccountId = localStorage.getItem("fp_my_account_id") ?? null;
  const isOwner = !!myAccountId && !!accountId && myAccountId === accountId;

  // Visibility settings panel
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [privacyTarget, setPrivacyTarget] = useState<ProfileRecord | null>(null);

  const fetchProfile = useCallback(() => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/profile/${encodeURIComponent(accountId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Server error ${r.status}`);
        return r.json() as Promise<ProfileResponse>;
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [accountId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  function handleVisibilitySuccess(record: ProfileRecord, newVis: Visibility) {
    setPrivacyTarget(null);
    toast({ title: "Visibility updated", description: `"${record.filename}" is now ${newVis}.` });
    // If the record became private it will disappear from the public list; refresh
    if (newVis === "private") {
      setData(prev => prev ? { ...prev, records: prev.records.filter(r => r.sha256 !== record.sha256) } : prev);
    } else {
      setData(prev => prev ? {
        ...prev,
        records: prev.records.map(r => r.sha256 === record.sha256 ? { ...r, visibility: newVis } : r),
      } : prev);
    }
  }

  const publicCount = data?.records.filter((r) => r.visibility === "public").length ?? 0;
  const semiPublicCount = data?.records.filter((r) => r.visibility === "semi-public").length ?? 0;

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center p-6 md:p-12">
      {/* Nav */}
      <div className="w-full max-w-3xl flex items-center justify-between mb-8">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors font-medium">
          <Lock className="w-4 h-4" /> Fingerprint a file
        </Link>
        <Link href="/verify" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors font-medium">
          <Search className="w-4 h-4" /> Verify a fingerprint
        </Link>
      </div>

      <div className="max-w-3xl w-full mx-auto space-y-10">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif tracking-tight text-foreground">
            {isOwner ? "My Profile" : "Public Profile"}
          </h1>
          <p className="font-mono text-sm text-muted-foreground break-all">{accountId}</p>
          <p className="text-base text-muted-foreground max-w-xl mx-auto">
            {isOwner
              ? "Your public and semi-public fingerprint registrations. Use the Visibility Settings panel below to change visibility for any record."
              : "Public and semi-public fingerprint registrations by this account. Private registrations are not shown."}
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24 text-muted-foreground gap-3">
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>Scanning Hedera registry…</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <Card>
            <CardContent className="p-8 text-center space-y-2">
              <p className="text-destructive font-medium">Failed to load profile</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        {data && !loading && (
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-6 text-center space-y-1">
                <p className="text-3xl font-bold text-foreground">{publicCount}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" /> Public
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center space-y-1">
                <p className="text-3xl font-bold text-foreground">{semiPublicCount}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Semi-Public
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Owner-only: Visibility Settings ─────────────────────────────── */}
        {isOwner && data && !loading && data.records.length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setSettingsOpen(v => !v)}
              className="w-full flex items-center justify-between px-6 py-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Settings className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm">Visibility Settings</p>
                  <p className="text-xs text-muted-foreground">
                    Change who can see each of your registered fingerprints. Requires identity verification.
                  </p>
                </div>
              </div>
              {settingsOpen
                ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
            </button>

            {settingsOpen && (
              <div className="border-t p-6 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Select a fingerprint to change its visibility. You will be asked to verify your identity with a PIN or biometric before any change is applied.
                </p>
                {data.records.map(record => (
                  <div
                    key={record.consensusTimestamp}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-background p-4"
                  >
                    <div className="min-w-0 space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <VisibilityBadge visibility={record.visibility} />
                        <span className="font-medium text-sm truncate" title={record.filename}>{record.filename}</span>
                        <span className="text-xs text-muted-foreground">{formatBytes(record.fileSize)}</span>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground truncate">{record.sha256}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5"
                      onClick={() => setPrivacyTarget(record)}
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Change
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty */}
        {data && !loading && data.records.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center space-y-3">
              <ShieldCheck className="w-10 h-10 text-muted-foreground/40 mx-auto" />
              <p className="font-medium text-muted-foreground">No public registrations yet</p>
              <p className="text-sm text-muted-foreground">
                Files registered as Public or Semi-Public will appear here.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Records list */}
        {data && !loading && data.records.length > 0 && (
          <div className="space-y-3">
            {data.records.map((record) => (
              <Card key={record.consensusTimestamp} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-5 flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <VisibilityBadge visibility={record.visibility} />
                        <span className="font-medium truncate" title={record.filename}>
                          {record.filename}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatBytes(record.fileSize)}
                        </span>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground break-all">
                        {record.sha256}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Registered {new Date(record.registeredAt).toLocaleString()}
                      </p>
                    </div>
                    <Link
                      href={`/verify?hash=${record.sha256}`}
                      className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors border rounded-md px-2.5 py-1.5 hover:border-primary/50"
                    >
                      Verify
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                  {record.visibility === "semi-public" && record.ownerAccountId && (
                    <div className="border-t bg-blue-50/60 px-5 py-2.5">
                      <p className="text-xs text-blue-700">
                        <span className="font-medium">Owner:</span>{" "}
                        <span className="font-mono">{record.ownerAccountId}</span>
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Footer */}
        {data && !loading && (
          <div className="flex items-center justify-center pt-4">
            <a
              href={data.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              View registry on HashScan
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      {/* ── Privacy Modal (owner only, triggered from settings panel) ────── */}
      {privacyTarget && (
        <PrivacyModal
          hash={privacyTarget.sha256}
          filename={privacyTarget.filename}
          currentVisibility={privacyTarget.visibility}
          onSuccess={(newVis) => handleVisibilitySuccess(privacyTarget, newVis)}
          onClose={() => setPrivacyTarget(null)}
        />
      )}
    </div>
  );
}
