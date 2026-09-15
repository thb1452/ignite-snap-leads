import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { createUploadJob, UploadIntakeUnconfirmedError, UploadIntakeValidationError, newOriginalIntakeHeld, UploadIntakeHeldError } from '@/services/uploadJobs';

export default function Upload() {
  const { user, loading } = useAuth();
  if (loading) return <p>Checking your account…</p>;
  if (!user) return <p>Sign in to view your private uploads.</p>;
  return <OriginalUploadIntake key={user.id} ownerId={user.id} />;
}

// New original intake stays held. No location detection, dropped rows, splitting,
// property import, source acceptance, insight generation or geocoding runs here.
export function OriginalUploadIntake({ ownerId }: { ownerId: string }) {
  const savingHeld = newOriginalIntakeHeld();
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedJobId, setSavedJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const inFlight = useRef(false);
  const lifetime = useRef(0);
  useEffect(() => { const epoch = ++lifetime.current; return () => { if (lifetime.current === epoch) lifetime.current++; }; }, []);

  async function saveOriginal(source: File) {
    if (inFlight.current || uncertain) return;
    if (!source.name.toLowerCase().endsWith('.csv') || source.size < 1 || source.size > 15 * 1024 * 1024) {
      setError('Choose one complete CSV file up to 15 MB. Nothing was saved.'); return;
    }
    inFlight.current = true;
    const epoch = lifetime.current;
    setBusy(true); setError(null); setSavedJobId(null);
    try {
      const jobId = await createUploadJob({ file: source, userId: ownerId, city: null, county: null, state: '' });
      if (lifetime.current !== epoch) return;
      setSavedJobId(jobId); setFile(null); setPasted('');
    } catch (failure) {
      if (lifetime.current !== epoch) return;
      if (failure instanceof UploadIntakeHeldError) { setError(failure.message); return; }
      if (failure instanceof UploadIntakeValidationError) { setError(failure.message); return; }
      setUncertain(true);
      const reference = failure instanceof UploadIntakeUnconfirmedError && failure.actorUserId === ownerId ? ` Reference: ${failure.proposedJobId}.` : '';
      setError('Saving could not be confirmed. Your file or job may already be saved. Check Upload Jobs before trying again. No processing was requested.' + reference);
    } finally {
      if (lifetime.current === epoch) { inFlight.current = false; setBusy(false); }
    }
  }

  return <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
    <div><h1 className="text-3xl font-bold mb-2">Original file intake is paused</h1>
      <p className="text-muted-foreground">File selection and pasted text stay on this device. Nothing is saved or processed.</p></div>
    <Alert><AlertDescription>
      New saves are paused until every original can be tracked and reconciled safely after an interruption.
      Nothing is uploaded and no job is created here. Existing jobs and originals remain available in Upload Jobs.
      Selecting a file or entering text does not approve a source, confirm a water shutoff or start processing.
    </AlertDescription></Alert>
    <Card><CardHeader><CardTitle>Select an original file locally</CardTitle></CardHeader><CardContent className="space-y-3">
      <Label htmlFor="original-csv">Complete CSV file, up to 15 MB</Label>
      <Input id="original-csv" type="file" accept=".csv,text/csv" disabled={busy || uncertain}
        onChange={event => setFile(event.target.files?.[0] ?? null)} />
      <p className="text-sm text-muted-foreground">Other formats remain held. Files are never relabeled, filtered or split to bypass intake limits.</p>
      <Button disabled={savingHeld || !file || busy || uncertain} onClick={() => { if (file) void saveOriginal(file); }}>
        {savingHeld ? 'Saving is paused — nothing saved' : busy ? 'Saving…' : 'Save original for review'}
      </Button>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Keep pasted CSV locally</CardTitle></CardHeader><CardContent className="space-y-3">
      <Label htmlFor="original-paste">Original CSV text</Label>
      <textarea id="original-paste" className="w-full min-h-40 border rounded p-3" value={pasted} disabled={busy || uncertain}
        onChange={event => setPasted(event.target.value)} />
      <p className="text-sm text-muted-foreground">This text stays in this page and is not saved. Keep your original copy; refreshing clears the text.</p>
      <Button disabled={savingHeld || !pasted || busy || uncertain} onClick={() => {
        if (pasted) void saveOriginal(new File([pasted], 'pasted-original.csv', { type: 'text/csv' }));
      }}>{savingHeld ? 'Saving is paused — nothing saved' : 'Save pasted original for review'}</Button>
    </CardContent></Card>
    {savedJobId && <Alert><AlertDescription>
      Original saved. Processing is held. <Link className="underline" to={`/upload-jobs/${savedJobId}`}>View saved job</Link>
    </AlertDescription></Alert>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <p><Link className="underline" to="/jobs">View Upload Jobs</Link></p>
    <p className="text-sm text-muted-foreground">Geocoding is paused. No new geocoding job can start here.</p>
  </div>;
}
