import { useState, useCallback } from 'react';
import { Star, Upload, Loader2, X, FileText } from 'lucide-react';
import { db } from '@/lib/foia/db';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

const DATA_FORMATS = [
  { value: 'csv', label: 'CSV / Spreadsheet' },
  { value: 'pdf', label: 'PDF' },
  { value: 'image', label: 'Image / Scan' },
  { value: 'mixed', label: 'Mixed Formats' },
  { value: 'other', label: 'Other' },
] as const;

const COMPLETENESS_OPTIONS = [
  { value: 'full', label: 'Full dataset' },
  { value: 'partial', label: 'Partial' },
  { value: 'redacted', label: 'Redacted' },
] as const;

interface FulfillmentModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (metadata: FulfillmentMetadata) => void;
  requestId: string | null;
  jurisdictionName: string;
}

export interface FulfillmentMetadata {
  data_quality_score: number;
  data_format: string;
  fee_amount: number | null;
  redaction_flag: boolean;
  estimated_row_count: number | null;
  is_snap_usable: boolean;
  fulfillment_file_url: string | null;
}

export function FulfillmentModal({ open, onClose, onSubmit, requestId, jurisdictionName }: FulfillmentModalProps) {
  const { toast } = useToast();
  const [quality, setQuality] = useState(3);
  const [format, setFormat] = useState('csv');
  const [completeness, setCompleteness] = useState('full');
  const [feeRequested, setFeeRequested] = useState(false);
  const [feeAmount, setFeeAmount] = useState('');
  const [redacted, setRedacted] = useState(false);
  const [usable, setUsable] = useState(true);
  const [rowCount, setRowCount] = useState('');
  const [uploading, setUploading] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !requestId) return;

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${requestId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('foia-fulfillments')
        .upload(path, file, { upsert: true });
      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('foia-fulfillments')
        .getPublicUrl(path);

      setFileUrl(urlData.publicUrl);
      setFileName(file.name);
    } catch (err) {
      toast({ title: 'Upload failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }, [requestId, toast]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const metadata: FulfillmentMetadata = {
        data_quality_score: quality,
        data_format: format,
        fee_amount: feeRequested && feeAmount ? parseFloat(feeAmount) : null,
        redaction_flag: redacted || completeness === 'redacted',
        estimated_row_count: rowCount ? parseInt(rowCount, 10) : null,
        is_snap_usable: usable,
        fulfillment_file_url: fileUrl,
      };
      onSubmit(metadata);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-green-600" />
            Fulfillment Report
          </DialogTitle>
          <DialogDescription>
            Rate the response from <strong>{jurisdictionName}</strong> to improve intelligence scoring.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Quality Rating */}
          <div>
            <Label className="text-sm font-medium">Data Quality</Label>
            <div className="flex items-center gap-1 mt-1.5">
              {[1, 2, 3, 4, 5].map(i => (
                <button key={i} onClick={() => setQuality(i)} className="transition-colors">
                  <Star className={cn('h-6 w-6', i <= quality ? 'text-amber-400 fill-amber-400' : 'text-slate-300 hover:text-amber-300')} />
                </button>
              ))}
              <span className="text-sm text-slate-500 ml-2">{quality}/5</span>
            </div>
          </div>

          {/* Data Format */}
          <div>
            <Label className="text-sm font-medium">Data Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATA_FORMATS.map(f => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Completeness */}
          <div>
            <Label className="text-sm font-medium">Dataset Completeness</Label>
            <Select value={completeness} onValueChange={(v) => { setCompleteness(v); if (v === 'redacted') setRedacted(true); }}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMPLETENESS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fee */}
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Fee Requested?</Label>
            <Switch checked={feeRequested} onCheckedChange={setFeeRequested} />
          </div>
          {feeRequested && (
            <div>
              <Label className="text-sm font-medium">Fee Amount ($)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
                placeholder="0.00"
                className="mt-1.5"
              />
            </div>
          )}

          {/* Estimated Rows */}
          <div>
            <Label className="text-sm font-medium">Estimated Data Rows</Label>
            <Input
              type="number"
              min="0"
              value={rowCount}
              onChange={(e) => setRowCount(e.target.value)}
              placeholder="e.g. 500"
              className="mt-1.5"
            />
          </div>

          {/* Usable Toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Usable for Snap Ignite?</Label>
            <Switch checked={usable} onCheckedChange={setUsable} />
          </div>

          {/* File Upload */}
          <div>
            <Label className="text-sm font-medium">Upload Response File</Label>
            <div className="mt-1.5">
              {fileName ? (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
                  <FileText className="h-4 w-4 text-green-600" />
                  <span className="truncate flex-1">{fileName}</span>
                  <button onClick={() => { setFileUrl(null); setFileName(null); }}>
                    <X className="h-4 w-4 text-slate-400 hover:text-red-500" />
                  </button>
                </div>
              ) : (
                <label className={cn(
                  'flex items-center gap-2 border border-dashed border-slate-300 rounded-lg px-3 py-3 cursor-pointer hover:border-blue-400 transition-colors text-sm text-slate-500',
                  uploading && 'opacity-50 pointer-events-none'
                )}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? 'Uploading...' : 'Click to upload file'}
                  <input type="file" className="hidden" onChange={handleFileUpload} accept=".csv,.pdf,.xlsx,.xls,.zip,.png,.jpg" />
                </label>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Skip</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save & Complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
