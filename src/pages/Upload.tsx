import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { originalUploadService, originalIntakeEnabled, IntakeError } from '@/services/originalUploadIntake';
import type { Inspection } from '../../supabase/functions/_shared/originalIntake';

export default function Upload() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  if (loading) return <p>Checking your account…</p>;
  if (!user) return <p>Sign in to view your private uploads.</p>;
  return <OriginalUploadIntake key={user.id} ownerId={user.id} initialJob={params.get('job') ?? ''} />;
}

export function OriginalUploadIntake({ ownerId, initialJob='' }: { ownerId: string; initialJob?: string }) {
  const savingHeld = !originalIntakeEnabled();
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState('');
  const [job, setJob] = useState(initialJob);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Inspection | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const inFlight = useRef(false);
  const lifetime = useRef(0);
  useEffect(() => { const epoch=++lifetime.current; return () => { if(lifetime.current===epoch){lifetime.current++;inFlight.current=false;} }; }, []);

  async function run(action:()=>Promise<Inspection|null>, saving=false) {
    if(inFlight.current || saving&&uncertain)return;
    inFlight.current=true;const epoch=lifetime.current;setBusy(true);setError(null);setMessage(null);setResult(null);
    try {
      const found=await action();if(lifetime.current!==epoch)return;
      if(found){setResult(found);setJob(found.reservation.job_id);setUncertain(false);}
      else setMessage('No matching saved reference was found at this check. Nothing new was saved. If an earlier save was interrupted, keep the original and check again before another attempt.');
    } catch(failure) {
      if(lifetime.current!==epoch)return;
      if(failure instanceof IntakeError){
        if(failure.jobId)setJob(failure.jobId);
        setError(failure.message);
        if(failure.code==='unconfirmed'||failure.code==='binding_conflict'||failure.code==='revoked')setUncertain(true);
      } else {setError('The original could not be checked. Keep the same original or saved reference and check again. No processing was requested.');setUncertain(true);}
    } finally {if(lifetime.current===epoch){inFlight.current=false;setBusy(false);}}
  }
  function save(source:File){void run(()=>originalUploadService.save(ownerId,source),true);}

  return <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
    <div><h1 className="text-3xl font-bold mb-2">Original file intake</h1>
      <p className="text-muted-foreground">{savingHeld?'New saves are paused. You can check an existing saved reference.':'Keep one complete original for private review.'}</p></div>
    <Alert><AlertDescription>
      {savingHeld?'Nothing new is uploaded or created while saving is paused. ':''}
      Source approval and processing remain held. Checking a file does not import properties, confirm a water shutoff or start paid work.
    </AlertDescription></Alert>
    <Card><CardHeader><CardTitle>Select the complete original</CardTitle></CardHeader><CardContent className="space-y-3">
      <Label htmlFor="original-csv">Complete CSV file, up to 15 MB</Label>
      <Input id="original-csv" type="file" accept=".csv,text/csv" disabled={busy}
        onChange={event=>setFile(event.target.files?.[0]??null)} />
      <p className="text-sm text-muted-foreground">Files are kept whole. Selecting one stays local; checking looks for its exact saved bytes.</p>
      <div className="flex gap-2 flex-wrap">
        <Button disabled={savingHeld||!file||busy||uncertain} onClick={()=>{if(file)save(file);}}>
          {savingHeld?'Saving is paused — nothing new saved':busy?'Working…':'Save original for review'}
        </Button>
        <Button variant="outline" disabled={!file||busy} onClick={()=>{if(file)void run(()=>originalUploadService.checkFile(ownerId,file));}}>Check this original</Button>
      </div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Check a saved reference</CardTitle></CardHeader><CardContent className="space-y-3">
      <Label htmlFor="original-job">Saved job reference</Label>
      <Input id="original-job" value={job} disabled={busy} onChange={event=>setJob(event.target.value.trim())} />
      <p className="text-sm text-muted-foreground">Use the reference from Upload Jobs after refreshing or signing in again. The original file does not need to be selected.</p>
      <Button variant="outline" disabled={!job||busy} onClick={()=>void run(()=>originalUploadService.checkJob(ownerId,job))}>Check saved original</Button>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Keep pasted CSV locally</CardTitle></CardHeader><CardContent className="space-y-3">
      <Label htmlFor="original-paste">Original CSV text</Label>
      <textarea id="original-paste" className="w-full min-h-40 border rounded p-3" value={pasted} disabled={busy} onChange={event=>setPasted(event.target.value)} />
      <p className="text-sm text-muted-foreground">This text stays in this page. Keep your own copy; refreshing clears it.</p>
      <Button disabled={savingHeld||!pasted||busy||uncertain} onClick={()=>{if(pasted)save(new File([pasted],'pasted-original.csv',{type:'text/csv'}));}}>
        {savingHeld?'Saving is paused — nothing new saved':'Save pasted original for review'}
      </Button>
    </CardContent></Card>
    {result&&<Alert><AlertDescription>
      {result.presence==='absent'?'The saved reference exists, but the original file was not found. Keep the original; do not start a different upload.':
        result.reservation.state==='original_verified'?'The original bytes and saved verification match. Source approval and processing remain held.':'The original bytes were found. A completed verification receipt has not been recorded; processing remains held.'}
      {' '}<Link className="underline" to={`/upload-jobs/${result.reservation.job_id}`}>View saved job</Link>
    </AlertDescription></Alert>}
    {message&&<Alert><AlertDescription>{message}</AlertDescription></Alert>}
    {error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <p><Link className="underline" to="/jobs">View Upload Jobs</Link></p>
    <p className="text-sm text-muted-foreground">Geocoding and processing remain paused. No new processing job starts here.</p>
  </div>;
}
