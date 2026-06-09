import React, { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import { Lock, Globe, Users, ExternalLink, Search, FileText, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

interface ProfileRecord {
  consensusTimestamp: string;
  sha256: string;
  filename: string;
  fileSize: number;
  registeredAt: string;
  visibility: "public" | "semi-public";
  ownerAccountId?: string;
}

interface ProfileResponse {
  accountId: string;
  topicId: string;
  network: string;
  explorerUrl: string;
  records: ProfileRecord[];
}

function VisibilityBadge({ visibility }: { visibility: "public" | "semi-public" }) {
  if (visibility === "semi-public") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
        <Users className="w-3 h-3" />
        Semi-Public
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
      <Globe className="w-3 h-3" />
      Public
    </span>
  );
}

export default function Profile() {
  const { accountId } = useParams<{ accountId: string }>();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  const publicCount = data?.records.filter((r) => r.visibility === "public").length ?? 0;
  const semiPublicCount = data?.records.filter((r) => r.visibility === "semi-public").length ?? 0;

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center p-6 md:p-12">
      {/* Nav */}
      <div className="w-full max-w-3xl flex items-center justify-between mb-8">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors font-medium">
          <Lock className="w-4 h-4" />
          Fingerprint a file
        </Link>
        <Link href="/verify" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors font-medium">
          <Search className="w-4 h-4" />
          Verify a fingerprint
        </Link>
      </div>

      <div className="max-w-3xl w-full mx-auto space-y-10">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif tracking-tight text-foreground">Public Profile</h1>
          <p className="font-mono text-sm text-muted-foreground break-all">{accountId}</p>
          <p className="text-base text-muted-foreground max-w-xl mx-auto">
            Public and semi-public fingerprint registrations by this account.
            Private registrations are not shown.
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

        {/* Records grid */}
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
    </div>
  );
}
