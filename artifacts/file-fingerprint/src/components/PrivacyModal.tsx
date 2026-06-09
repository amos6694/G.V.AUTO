import React, { useState } from "react";
import { EyeOff, Users, Globe, KeyRound, Fingerprint, X, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type Visibility = "private" | "semi-public" | "public";
type Step = "choose" | "verify" | "applying" | "done";
type VerifyMethod = "password" | "biometric";

const STORAGE_PIN_KEY = "fp_owner_pin";
const STORAGE_BIO_KEY = "fp_biometric_cred";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function b64encode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

const VISIBILITY_OPTIONS: Array<{
  value: Visibility;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}> = [
  {
    value: "private",
    label: "Private",
    description: "Only you. Others uploading the same file start fresh with no trace of your record.",
    icon: <EyeOff className="w-4 h-4" />,
    color: "text-slate-600 bg-slate-50 border-slate-200",
  },
  {
    value: "semi-public",
    label: "Semi-Public",
    description: "Shareable, but your account ID and original timestamp are always attached to every copy.",
    icon: <Users className="w-4 h-4" />,
    color: "text-blue-700 bg-blue-50 border-blue-200",
  },
  {
    value: "public",
    label: "Public",
    description: "Freely discoverable by anyone. Listed on your public profile.",
    icon: <Globe className="w-4 h-4" />,
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
];

interface Props {
  hash: string;
  filename: string;
  currentVisibility: Visibility;
  onSuccess: (newVisibility: Visibility) => void;
  onClose: () => void;
}

export function PrivacyModal({ hash, filename, currentVisibility, onSuccess, onClose }: Props) {
  const [step, setStep] = useState<Step>("choose");
  const [newVisibility, setNewVisibility] = useState<Visibility | null>(null);
  const [method, setMethod] = useState<VerifyMethod>("password");

  // Password states
  const hasPinStored = !!localStorage.getItem(STORAGE_PIN_KEY);
  const hasBioStored = !!localStorage.getItem(STORAGE_BIO_KEY);
  const [pinPhase, setPinPhase] = useState<"enter" | "create" | "confirm">(hasPinStored ? "enter" : "create");
  const [pinValue, setPinValue] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");

  // Biometric states
  const [bioPhase, setBioPhase] = useState<"prompt" | "register">(hasBioStored ? "prompt" : "register");

  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  function handleChoose(vis: Visibility) {
    if (vis === currentVisibility) return;
    setNewVisibility(vis);
    setStep("verify");
  }

  async function handlePasswordVerify() {
    setError(null);
    setIsWorking(true);
    try {
      if (pinPhase === "create") {
        if (pinValue.length < 4) { setError("PIN must be at least 4 characters."); return; }
        // Move to confirm phase
        setPinPhase("confirm");
        setPinValue("");
        return;
      }
      if (pinPhase === "confirm") {
        if (pinValue !== pinConfirm && pinValue !== pinConfirm) {
          // Actually compare with stored first value
        }
        // pinValue here is the confirm; we need to compare against the create value
        // Let me restructure: use separate state for the "create" value
        // This logic is handled below via pinConfirm
      }
      if (pinPhase === "enter") {
        const stored = localStorage.getItem(STORAGE_PIN_KEY);
        const inputHash = await sha256Hex(pinValue);
        if (inputHash !== stored) {
          setError("Incorrect PIN. Please try again.");
          setPinValue("");
          return;
        }
        await applyChange();
      }
    } finally {
      setIsWorking(false);
    }
  }

  // Separate clean handler
  async function handlePin() {
    setError(null);
    if (pinPhase === "create") {
      if (pinValue.length < 4) { setError("PIN must be at least 4 characters."); return; }
      setPinConfirm(pinValue);
      setPinValue("");
      setPinPhase("confirm");
      return;
    }
    if (pinPhase === "confirm") {
      if (pinValue !== pinConfirm) { setError("PINs don't match. Try again."); setPinValue(""); return; }
      const hashed = await sha256Hex(pinValue);
      localStorage.setItem(STORAGE_PIN_KEY, hashed);
      await applyChange();
      return;
    }
    if (pinPhase === "enter") {
      setIsWorking(true);
      try {
        const stored = localStorage.getItem(STORAGE_PIN_KEY);
        const inputHash = await sha256Hex(pinValue);
        if (inputHash !== stored) {
          setError("Incorrect PIN. Please try again.");
          setPinValue("");
          return;
        }
        await applyChange();
      } finally {
        setIsWorking(false);
      }
    }
  }

  async function handleBiometric() {
    setError(null);
    setIsWorking(true);
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      if (bioPhase === "register") {
        const credential = await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: "File Fingerprint", id: window.location.hostname },
            user: {
              id: crypto.getRandomValues(new Uint8Array(16)),
              name: "owner",
              displayName: "File Fingerprint Owner",
            },
            pubKeyCredParams: [
              { alg: -7, type: "public-key" },
              { alg: -257, type: "public-key" },
            ],
            authenticatorSelection: {
              authenticatorAttachment: "platform",
              userVerification: "required",
              residentKey: "preferred",
            },
            timeout: 60000,
          },
        }) as PublicKeyCredential | null;
        if (!credential) { setError("Biometric registration was cancelled."); return; }
        localStorage.setItem(STORAGE_BIO_KEY, b64encode(credential.rawId));
        setBioPhase("prompt");
        await applyChange();
      } else {
        const credId = localStorage.getItem(STORAGE_BIO_KEY);
        const allowCredentials = credId
          ? [{ id: b64decode(credId), type: "public-key" as const }]
          : [];
        const assertion = await navigator.credentials.get({
          publicKey: { challenge, allowCredentials, userVerification: "required", timeout: 60000 },
        });
        if (!assertion) { setError("Biometric authentication was cancelled."); return; }
        await applyChange();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("cancelled") || msg.includes("NotAllowed") || msg.includes("abort")) {
        setError("Biometric prompt was cancelled or not allowed. Try again.");
      } else {
        setError(`Biometric error: ${msg}`);
      }
    } finally {
      setIsWorking(false);
    }
  }

  async function applyChange() {
    if (!newVisibility) return;
    setStep("applying");
    try {
      const res = await fetch("/api/fingerprint/change-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash, newVisibility }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      setStep("done");
      setTimeout(() => onSuccess(newVisibility), 900);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      setStep("verify");
    }
  }

  const visOpt = (v: Visibility) => VISIBILITY_OPTIONS.find(o => o.value === v)!;
  const curOpt = visOpt(currentVisibility);
  const newOpt = newVisibility ? visOpt(newVisibility) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/40">
          <div>
            <h2 className="font-semibold text-foreground">Privacy Settings</h2>
            <p className="text-xs text-muted-foreground truncate max-w-[280px]">{filename}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step: Choose */}
        {step === "choose" && (
          <div className="p-6 space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Current visibility</p>
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium border px-2.5 py-1 rounded-full ${curOpt.color}`}>
                {curOpt.icon} {curOpt.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">Select a new visibility. You'll verify your identity before the change is applied.</p>
            <div className="space-y-2">
              {VISIBILITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleChoose(opt.value)}
                  disabled={opt.value === currentVisibility}
                  className={`w-full text-left rounded-lg border p-4 transition-all
                    ${opt.value === currentVisibility
                      ? "opacity-40 cursor-not-allowed border-border"
                      : "hover:border-primary/50 hover:bg-muted/40 cursor-pointer border-border"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium border px-2 py-0.5 rounded-full ${opt.color}`}>
                      {opt.icon} {opt.label}
                    </span>
                    {opt.value === currentVisibility && (
                      <span className="text-xs text-muted-foreground">(current)</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Verify */}
        {step === "verify" && newOpt && (
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-3 text-sm">
              <span className={`inline-flex items-center gap-1 text-xs font-medium border px-2 py-0.5 rounded-full ${curOpt.color}`}>
                {curOpt.icon} {curOpt.label}
              </span>
              <span className="text-muted-foreground">→</span>
              <span className={`inline-flex items-center gap-1 text-xs font-medium border px-2 py-0.5 rounded-full ${newOpt.color}`}>
                {newOpt.icon} {newOpt.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground font-medium">Verify your identity to confirm this change.</p>

            {/* Method tabs */}
            <div className="flex rounded-lg border overflow-hidden">
              <button
                onClick={() => { setMethod("password"); setError(null); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors
                  ${method === "password" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/60"}`}
              >
                <KeyRound className="w-4 h-4" /> Password
              </button>
              <button
                onClick={() => { setMethod("biometric"); setError(null); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors border-l
                  ${method === "biometric" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/60"}`}
              >
                <Fingerprint className="w-4 h-4" /> Biometric
              </button>
            </div>

            {/* Password panel */}
            {method === "password" && (
              <div className="space-y-3">
                {pinPhase === "create" && (
                  <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    No owner PIN set yet. Create one to protect future visibility changes.
                  </p>
                )}
                {pinPhase === "confirm" && (
                  <p className="text-xs text-muted-foreground">Re-enter your new PIN to confirm.</p>
                )}
                <Input
                  type="password"
                  placeholder={
                    pinPhase === "create" ? "Create a PIN (4+ characters)"
                    : pinPhase === "confirm" ? "Confirm your PIN"
                    : "Enter your owner PIN"
                  }
                  value={pinValue}
                  onChange={e => { setPinValue(e.target.value); setError(null); }}
                  onKeyDown={e => { if (e.key === "Enter") handlePin(); }}
                  autoFocus
                />
                {error && (
                  <p className="text-xs text-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
                  </p>
                )}
                <Button className="w-full" onClick={handlePin} disabled={!pinValue || isWorking}>
                  {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    pinPhase === "create" ? "Set PIN & Continue"
                    : pinPhase === "confirm" ? "Confirm PIN"
                    : "Verify & Apply Change"
                  )}
                </Button>
                {pinPhase === "enter" && (
                  <button
                    onClick={() => { setPinPhase("create"); setPinValue(""); setError(null); }}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors w-full text-center"
                  >
                    Forgot PIN? Set a new one
                  </button>
                )}
              </div>
            )}

            {/* Biometric panel */}
            {method === "biometric" && (
              <div className="space-y-3">
                {bioPhase === "register" && (
                  <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    No biometric credential registered. Your device will prompt you to create one using Face ID, Touch ID, or Windows Hello.
                  </p>
                )}
                {error && (
                  <p className="text-xs text-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
                  </p>
                )}
                <Button className="w-full gap-2" onClick={handleBiometric} disabled={isWorking}>
                  {isWorking
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Waiting for device…</>
                    : <><Fingerprint className="w-4 h-4" /> {bioPhase === "register" ? "Register Biometric" : "Authenticate with Device"}</>
                  }
                </Button>
                {bioPhase === "prompt" && (
                  <button
                    onClick={() => { setBioPhase("register"); setError(null); }}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors w-full text-center"
                  >
                    Register a new biometric credential
                  </button>
                )}
              </div>
            )}

            <button
              onClick={() => { setStep("choose"); setError(null); setPinValue(""); setPinConfirm(""); }}
              className="text-xs text-muted-foreground hover:text-primary transition-colors w-full text-center"
            >
              ← Back to visibility options
            </button>
          </div>
        )}

        {/* Step: Applying */}
        {step === "applying" && (
          <div className="p-12 flex flex-col items-center justify-center space-y-4">
            <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            <div className="text-center space-y-1">
              <p className="font-medium">Writing to blockchain…</p>
              <p className="text-sm text-muted-foreground">Submitting visibility update to Hedera Testnet</p>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && newOpt && (
          <div className="p-12 flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-medium">Visibility updated</p>
              <span className={`inline-flex items-center gap-1 text-xs font-medium border px-2 py-0.5 rounded-full ${newOpt.color}`}>
                {newOpt.icon} {newOpt.label}
              </span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
