import React, { useState, useCallback, useRef } from "react";
import { Upload, File, Copy, Check, RefreshCw, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function Home() {
  const [isDragging, setIsDragging] = useState(false);
  const [isComputing, setIsComputing] = useState(false);
  const [fileData, setFileData] = useState<{ name: string; size: number; lastModified: number } | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const computeHash = async (file: File) => {
    setIsComputing(true);
    setFileData({
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
    });
    setHash(null);
    setTimestamp(null);
    setCopied(false);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      setHash(hashHex);
      setTimestamp(new Date().toISOString());
    } catch (error) {
      console.error(error);
      toast({
        title: "Error computing fingerprint",
        description: "There was a problem reading or hashing the file.",
        variant: "destructive",
      });
    } finally {
      setIsComputing(false);
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
      const file = e.dataTransfer.files[0];
      computeHash(file);
    }
  }, []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      computeHash(file);
    }
  }, []);

  const handleCopy = useCallback(async () => {
    if (hash) {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      toast({
        title: "Fingerprint copied",
        description: "The SHA-256 hash has been copied to your clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  }, [hash, toast]);

  const handleReset = useCallback(() => {
    setFileData(null);
    setHash(null);
    setTimestamp(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center p-6 md:p-12">
      <div className="max-w-3xl w-full mx-auto space-y-10">
        
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif tracking-tight text-foreground">File Fingerprint</h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto font-sans leading-relaxed">
            Establish proof of a file's existence and integrity at a specific moment. 
            Cryptographic hashing is performed entirely on your device.
          </p>
        </div>

        {/* State Machine */}
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
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={onFileChange} 
            />
            <div className="w-16 h-16 rounded-full bg-background border shadow-sm flex items-center justify-center mb-6">
              <Upload className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-medium mb-2">Select a file to fingerprint</h3>
            <p className="text-muted-foreground max-w-sm">
              Drag and drop any file here, or click to browse. The file never leaves your computer.
            </p>
          </div>
        )}

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

        {hash && fileData && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
            <Card className="overflow-hidden border-border/50 shadow-lg" data-testid="certificate-block">
              <div className="bg-muted px-8 py-6 border-b flex items-start justify-between">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Certificate of Fingerprint</h2>
                  <p className="text-2xl font-serif text-foreground">SHA-256 Integrity Record</p>
                </div>
                <File className="w-8 h-8 text-primary opacity-20" />
              </div>
              <CardContent className="p-0">
                <div className="divide-y">
                  <div className="p-8 space-y-4">
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Digital Fingerprint</p>
                    <div 
                      className="font-mono text-xl md:text-2xl lg:text-3xl text-foreground break-all leading-tight tracking-tight select-all"
                      data-testid="fingerprint-display"
                    >
                      {hash}
                    </div>
                  </div>
                  
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
                </div>
              </CardContent>
            </Card>

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
