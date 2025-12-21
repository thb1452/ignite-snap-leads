import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ExternalLink, MapPin, Mail, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AddToListDialog } from "./AddToListDialog";
import { ActivityTimeline } from "./ActivityTimeline";
import { StatusSelector } from "./StatusSelector";
import { mockSkipTrace } from "@/services/mockData";
import { formatDistanceToNow, format } from "date-fns";

interface Violation {
  id: string;
  violation_type: string;
  status: string;
  opened_date: string | null;
  days_open: number | null;
  case_id: string | null;
  // NOTE: description and raw_description are NEVER included for legal safety
}

interface PropertyWithViolations {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  snap_score: number | null;
  snap_insight: string | null;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  updated_at: string | null;
  violations: Violation[];
}

interface LeadActivity {
  id: string;
  property_id: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PropertyList {
  id: string;
  list_id: string;
  list_name: string;
}

interface PropertyDetailPanelProps {
  property: PropertyWithViolations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PropertyDetailPanel({ property, open, onOpenChange }: PropertyDetailPanelProps) {
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [propertyLists, setPropertyLists] = useState<PropertyList[]>([]);
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [isTracing, setIsTracing] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const [showRetryDialog, setShowRetryDialog] = useState(false);
  const [retryForm, setRetryForm] = useState({
    address_line: "",
    city: "",
    state: "",
    postal_code: "",
    owner_name: ""
  });
  const { toast } = useToast();

  useEffect(() => {
    if (property && open) {
      // Demo mode - no backend fetches
      setActivities([]);
      setPropertyLists([]);
      setContacts([]);
    }
  }, [property, open]);

  if (!property) return null;

  const logActivity = async (status: string, notes?: string) => {
    if (!property) return;
    
    setIsLogging(true);
    try {
      // Demo mode - simulate activity logging
      await new Promise(resolve => setTimeout(resolve, 500));

      toast({
        title: "Demo Mode",
        description: `Activity logged: ${status}`,
      });
    } catch (error) {
      console.error("Error logging activity:", error);
      toast({
        title: "Error",
        description: "Failed to log activity",
        variant: "destructive",
      });
    } finally {
      setIsLogging(false);
    }
  };

  // Demo mode - no fetch functions needed

  const handleSkipTrace = async (overrides?: any) => {
    if (!property) return;

    console.log("[PropertyDetailPanel] Demo skip trace for property:", property.id);
    
    setIsTracing(true);
    try {
      // Use mock skip trace
      const result = await mockSkipTrace(property.id);
      
      if (result.success && result.contacts) {
        setContacts(result.contacts);
        toast({
          title: "Demo Mode",
          description: `Found ${result.contacts.length} contact(s)`,
        });
        setShowRetryDialog(false);
      }
    } catch (error: any) {
      console.log("[PropertyDetailPanel] No contacts found in demo");
      setRetryForm({
        address_line: property.address,
        city: property.city,
        state: property.state,
        postal_code: property.zip,
        owner_name: ""
      });
      setShowRetryDialog(true);
      toast({
        title: "Demo Mode",
        description: "No contacts found - try alternate search",
      });
    } finally {
      setIsTracing(false);
    }
  };

  const getScoreClass = (n: number | null) => {
    if (!n) return 'bg-slate-100 text-ink-600 border border-slate-200';
    if (n >= 80) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    if (n >= 50) return 'bg-amber-50 text-amber-700 border border-amber-200';
    return 'bg-slate-100 text-ink-600 border border-slate-200';
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const googleMapsUrl = property.latitude && property.longitude
    ? `https://www.google.com/maps?q=${property.latitude},${property.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${property.address}, ${property.city}, ${property.state} ${property.zip}`)}`;

  const hasMultipleViolations = property.violations.length >= 3;
  const snapScore = property.snap_score;
  const credits = 100; // Demo mode - fake credits
  const hasContacts = contacts.length > 0;
  const notTraced = contacts.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[600px] overflow-hidden p-0 flex flex-col z-[2000] snap-drawer">
        <motion.div
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
          className="h-full flex flex-col"
        >
          {/* Hero Header */}
          <div className="p-5 md:p-6 border-b bg-white/90 backdrop-blur">
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl md:text-2xl font-semibold text-ink-900 font-display truncate">
                    {property.address}
                  </h2>
                  <p className="text-sm text-ink-400 font-ui mt-1">
                    {property.city}, {property.state} {property.zip}
                  </p>
                  {/* Last Snap Update Timestamp */}
                  {property.updated_at && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-ink-400">
                      <Clock className="h-3 w-3" />
                      <span>
                        Last Snap update: {format(new Date(property.updated_at), "MMM d, yyyy")} ({formatDistanceToNow(new Date(property.updated_at), { addSuffix: true })})
                      </span>
                    </div>
                  )}
                </div>
                {snapScore !== null && (
                  <motion.span
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold border ${getScoreClass(snapScore)} ${
                      snapScore >= 80 ? 'animate-pulse' : ''
                    }`}
                  >
                    🔥 {snapScore}
                  </motion.span>
                )}
              </div>
            </div>
          </div>

          {/* Main Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
            {/* Property Image */}
            {property.photo_url ? (
              <div className="aspect-[16/9] rounded-xl overflow-hidden bg-slate-100">
                <img
                  src={property.photo_url}
                  alt={property.address}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="aspect-[16/9] rounded-xl bg-slate-100 flex items-center justify-center">
                <div className="text-center text-slate-400">
                  <div className="text-4xl mb-2">🏠</div>
                  <p className="text-sm">No image available</p>
                </div>
              </div>
            )}

            {/* SnapInsight Card */}
            {property.snap_insight && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-2xl border border-amber-200/70 shadow-[0_1px_0_0_rgba(16,24,40,.04)] bg-amber-50/50 p-4"
              >
                <div className="flex items-start gap-2">
                  <span className="text-lg">💡</span>
                  <div>
                    <div className="text-xs font-medium text-amber-900 mb-1">SnapInsight</div>
                    <p className="text-sm text-amber-800">{property.snap_insight}</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Tags Section (Demo Mode) */}
            {(property as any).mockTags && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className="flex flex-wrap gap-2"
              >
                {(property as any).mockTags.map((tag: string, index: number) => (
                  <span
                    key={index}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
                  >
                    {tag}
                  </span>
                ))}
              </motion.div>
            )}

            {/* Violations Timeline */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-2xl border border-slate-200/70 shadow-[0_1px_0_0_rgba(16,24,40,.04)] bg-white p-5 md:p-6"
            >
              <div className="text-sm font-medium mb-4 text-ink-700 font-ui">Violations</div>
              {property.violations.length === 0 ? (
                <p className="text-sm text-ink-400 text-center py-4">No violations recorded</p>
              ) : (
                <ol className="relative border-s border-slate-200 ml-3 space-y-4">
                  {property.violations.map((v) => (
                    <li key={v.id} className="ms-4">
                      <div className={`absolute -left-1.5 mt-1 h-3 w-3 rounded-full ${
                        v.status === 'Open' ? 'bg-amber-400' : 'bg-emerald-400'
                      }`} />
                      <div className="rounded-xl border p-3">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-ink-800">{v.violation_type || "Unknown"}</div>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            v.status === 'Open'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            {v.status}
                          </span>
                        </div>
                        {/* NOTE: Raw violation descriptions are NEVER shown to users for legal safety */}
                        <p className="text-xs text-ink-400 mt-1">
                          Opened {formatDate(v.opened_date)} • {v.days_open} days
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </motion.section>

            {/* Activity Timeline */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <ActivityTimeline activities={activities} />
            </motion.section>

            {/* Status Selector */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="rounded-2xl border border-slate-200/70 shadow-[0_1px_0_0_rgba(16,24,40,.04)] bg-white p-5"
            >
              <div className="text-sm font-medium mb-3 text-ink-700 font-ui">Quick Status Update</div>
              <StatusSelector
                onSelect={(status) => logActivity(status)}
                disabled={isLogging}
              />
            </motion.div>

            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-brand hover:underline font-medium"
            >
              <MapPin className="h-4 w-4" />
              View on Google Maps
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* Sticky Action Footer */}
          <div className="border-t p-4 md:p-5 bg-white sticky bottom-0 space-y-3 pb-[calc(env(safe-area-inset-bottom)+16px)]">
            {notTraced && (
              <div className="mb-3 flex gap-3 items-center">
                <Button
                  onClick={handleSkipTrace}
                  disabled={isTracing || credits <= 0}
                  className="rounded-xl px-5 py-2.5 bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-40"
                >
                  {isTracing ? "Tracing..." : "Skip Trace"}
                </Button>
                {credits <= 0 && (
                  <span className="text-sm text-ink-500">
                    0 credits – Buy Credits to enable
                  </span>
                )}
              </div>
            )}
            {hasContacts && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    className="rounded-xl px-4 py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 flex-1 transition-all"
                    onClick={() => {
                      logActivity("SMS Sent");
                      toast({
                        title: "Demo Mode",
                        description: "Text message sent to owner",
                      });
                    }}
                    disabled={isLogging}
                  >
                    <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    Text Owner
                  </Button>
                  <Button
                    className="rounded-xl px-4 py-2.5 bg-blue-600 text-white hover:bg-blue-700 flex-1 transition-all"
                    onClick={() => {
                      logActivity("Call Made");
                      toast({
                        title: "Demo Mode",
                        description: "Calling owner...",
                      });
                    }}
                    disabled={isLogging}
                  >
                    <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    Call Owner
                  </Button>
                </div>
                <Button
                  className="rounded-xl px-4 py-2.5 bg-ink-900 text-white hover:bg-ink-700 w-full transition-all"
                  onClick={() => {
                    logActivity("Email Sent");
                    toast({
                      title: "Demo Mode",
                      description: "Email sent to owner",
                    });
                  }}
                  disabled={isLogging}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </Button>
              </div>
            )}
          </div>

          <AddToListDialog
            open={addToListOpen}
            onOpenChange={setAddToListOpen}
            propertyIds={[property.id]}
            userLists={[]}
            onSuccess={() => {
              toast({
                title: "Demo Mode",
                description: "List updated successfully",
              });
            }}
          />

          {/* Retry Skip Trace Dialog */}
          <Dialog open={showRetryDialog} onOpenChange={setShowRetryDialog}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Try Alternate Address</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Address Line</label>
                  <Input
                    value={retryForm.address_line}
                    onChange={(e) => setRetryForm({ ...retryForm, address_line: e.target.value })}
                    placeholder="123 Main St, Unit 4B"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">City</label>
                    <Input
                      value={retryForm.city}
                      onChange={(e) => setRetryForm({ ...retryForm, city: e.target.value })}
                      placeholder="Springfield"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">State</label>
                    <Input
                      value={retryForm.state}
                      onChange={(e) => setRetryForm({ ...retryForm, state: e.target.value })}
                      placeholder="IL"
                      maxLength={2}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Postal Code</label>
                  <Input
                    value={retryForm.postal_code}
                    onChange={(e) => setRetryForm({ ...retryForm, postal_code: e.target.value })}
                    placeholder="62701"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Owner Name (Optional)</label>
                  <Input
                    value={retryForm.owner_name}
                    onChange={(e) => setRetryForm({ ...retryForm, owner_name: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowRetryDialog(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleSkipTrace(retryForm)}
                  disabled={isTracing}
                  className="flex-1"
                >
                  {isTracing ? "Retrying..." : "Retry Skip Trace"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </motion.div>
      </SheetContent>
    </Sheet>
  );
}
