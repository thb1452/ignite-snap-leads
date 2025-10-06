import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ExternalLink, MapPin, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AddToListDialog } from "./AddToListDialog";
import { ActivityTimeline } from "./ActivityTimeline";
import { StatusSelector } from "./StatusSelector";
import { useCreditBalance } from "@/hooks/useCredits";

interface Violation {
  id: string;
  violation_type: string;
  description: string | null;
  status: string;
  opened_date: string | null;
  days_open: number | null;
  case_id: string | null;
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
  const { data: creditsData } = useCreditBalance();

  useEffect(() => {
    if (property && open) {
      fetchActivities();
      fetchPropertyLists();
      fetchContacts();
    }
  }, [property, open]);

  if (!property) return null;

  const logActivity = async (status: string, notes?: string) => {
    if (!property) return;
    
    setIsLogging(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("lead_activity")
        .insert({
          property_id: property.id,
          user_id: user.id,
          status,
          notes: notes || null,
        });

      if (error) throw error;

      toast({
        title: "Activity logged",
        description: `${status} recorded successfully`,
      });

      await fetchActivities();
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

  const fetchActivities = async () => {
    if (!property) return;

    try {
      const { data, error } = await supabase
        .from("lead_activity")
        .select("*")
        .eq("property_id", property.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setActivities(data || []);
    } catch (error) {
      console.error("Error fetching activities:", error);
    }
  };

  const fetchPropertyLists = async () => {
    if (!property) return;

    try {
      const { data, error } = await supabase
        .from("list_properties")
        .select(`
          id,
          list_id,
          lead_lists (
            name
          )
        `)
        .eq("property_id", property.id);

      if (error) throw error;

      const formattedLists = (data || []).map((item: any) => ({
        id: item.id,
        list_id: item.list_id,
        list_name: item.lead_lists?.name || "Unknown List",
      }));

      setPropertyLists(formattedLists);
    } catch (error) {
      console.error("Error fetching property lists:", error);
    }
  };

  const fetchContacts = async () => {
    if (!property) return;

    try {
      const { data, error } = await supabase
        .from("property_contacts")
        .select("*")
        .eq("property_id", property.id);

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error("Error fetching contacts:", error);
    }
  };

  const handleSkipTrace = async (overrides?: any) => {
    if (!property) return;

    console.log("[PropertyDetailPanel] Skip trace clicked for property:", property.id, overrides ? "with overrides" : "");
    
    setIsTracing(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/skiptrace`;
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          property_id: property.id,
          overrides: overrides || null
        }),
      });

      const result = await response.json();
      const found = result.contacts?.length ?? 0;
      
      console.log("[PropertyDetailPanel] Skip trace complete. Found contacts:", found);
      
      if (result.ok) {
        setContacts(result.contacts || []);
        
        if (found > 0) {
          const isDemoContact = result.contacts.some((c: any) => c.source?.includes("sandbox_demo"));
          toast({
            title: "Skip trace complete",
            description: isDemoContact 
              ? `Found ${found} contact(s) (Sandbox demo mode)`
              : `Found ${found} contact(s)`,
          });
          setShowRetryDialog(false);
        } else {
          // Show retry dialog with pre-filled address
          setRetryForm({
            address_line: property.address,
            city: property.city,
            state: property.state,
            postal_code: property.zip,
            owner_name: ""
          });
          setShowRetryDialog(true);
          toast({
            title: "No numbers found",
            description: "No numbers found — try alternate address or owner search",
          });
        }
      } else {
        throw new Error(result.error || "Skip trace failed");
      }
    } catch (error: any) {
      console.error("[PropertyDetailPanel] Skip trace error:", error);
      toast({
        title: "Skip trace failed",
        description: error.message || "An error occurred",
        variant: "destructive",
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
  const credits = creditsData ?? 0;
  const hasContacts = contacts.length > 0;
  const notTraced = contacts.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[600px] overflow-hidden p-0 flex flex-col">
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
                          <div className="font-medium text-ink-800">{v.violation_type}</div>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            v.status === 'Open'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            {v.status}
                          </span>
                        </div>
                        {v.description && (
                          <p className="text-sm text-ink-500 mt-1">{v.description}</p>
                        )}
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
                {credits === 0 && (
                  <span className="text-sm text-ink-500">
                    0 credits – Buy Credits to enable
                  </span>
                )}
              </div>
            )}
            {hasContacts && (
              <div className="flex gap-2">
                <Button
                  className="rounded-xl px-4 py-2.5 bg-ink-900 text-white hover:bg-ink-700 flex-1 transition-all"
                  onClick={() => logActivity("Email Sent")}
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
            propertyId={property.id}
            onListAdded={fetchPropertyLists}
            currentListIds={propertyLists.map((l) => l.list_id)}
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
