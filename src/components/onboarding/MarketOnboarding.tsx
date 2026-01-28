import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MarketOnboardingProps {
  onComplete: (market: { state: string; city: string }) => void;
  isSaving?: boolean;
}

export function MarketOnboarding({ onComplete, isSaving = false }: MarketOnboardingProps) {
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingCities, setLoadingCities] = useState(false);
  const [statesError, setStatesError] = useState<string | null>(null);
  const [citiesError, setCitiesError] = useState<string | null>(null);

  // Fetch distinct states via RPC (instant, no client-side pagination)
  useEffect(() => {
    async function fetchStates() {
      setLoadingStates(true);
      setStatesError(null);
      try {
        const { data, error } = await supabase.rpc('fn_distinct_states');

        if (error) {
          console.error('[MarketOnboarding] Error fetching states:', error);
          setStatesError("Failed to load states. Please try again.");
          return;
        }

        const stateList = (data as { state: string }[] | null)?.map(r => r.state).filter(Boolean) || [];
        setStates(stateList);
      } catch (e) {
        console.error('[MarketOnboarding] Exception fetching states:', e);
        setStatesError("Failed to load states. Please try again.");
      } finally {
        setLoadingStates(false);
      }
    }
    fetchStates();
  }, []);

  // Fetch distinct cities via RPC (instant, no client-side pagination)
  useEffect(() => {
    if (!selectedState) {
      setCities([]);
      setSelectedCity(null);
      return;
    }

    async function fetchCities() {
      setLoadingCities(true);
      setCitiesError(null);
      setSelectedCity(null);
      try {
        const { data, error } = await supabase.rpc('fn_distinct_cities', {
          p_state: selectedState,
        });

        if (error) {
          console.error('[MarketOnboarding] Error fetching cities:', error);
          setCitiesError("Failed to load cities. Please try again.");
          return;
        }

        const cityList = (data as { city: string }[] | null)?.map(r => r.city).filter(Boolean) || [];
        setCities(cityList);
      } catch (e) {
        console.error('[MarketOnboarding] Exception fetching cities:', e);
        setCitiesError("Failed to load cities. Please try again.");
      } finally {
        setLoadingCities(false);
      }
    }
    fetchCities();
  }, [selectedState]);

  const handleContinue = () => {
    if (selectedState && selectedCity) {
      onComplete({ state: selectedState, city: selectedCity });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-brand/10 flex items-center justify-center">
            <MapPin className="h-6 w-6 text-brand" />
          </div>
          <CardTitle className="text-2xl">What area do you want to monitor?</CardTitle>
          <CardDescription className="text-base">
            We'll show you active enforcement pressure in this market
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="state-select">State</Label>
            {statesError ? (
              <div className="flex items-center gap-2 text-sm text-destructive p-2 border border-destructive/30 rounded-md bg-destructive/5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{statesError}</span>
                <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              </div>
            ) : (
              <Select
                value={selectedState || ""}
                onValueChange={(v) => setSelectedState(v || null)}
                disabled={loadingStates}
              >
                <SelectTrigger id="state-select">
                  <SelectValue placeholder={loadingStates ? "Loading states..." : "Select a state"} />
                </SelectTrigger>
                <SelectContent>
                  {states.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="city-select">City</Label>
            {citiesError ? (
              <div className="flex items-center gap-2 text-sm text-destructive p-2 border border-destructive/30 rounded-md bg-destructive/5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{citiesError}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 text-xs"
                  onClick={() => {
                    const s = selectedState;
                    setSelectedState(null);
                    setTimeout(() => setSelectedState(s), 50);
                  }}
                >
                  Retry
                </Button>
              </div>
            ) : (
              <Select
                value={selectedCity || ""}
                onValueChange={(v) => setSelectedCity(v || null)}
                disabled={!selectedState || loadingCities}
              >
                <SelectTrigger id="city-select">
                  <SelectValue
                    placeholder={
                      !selectedState
                        ? "Select a state first"
                        : loadingCities
                          ? "Loading cities..."
                          : `Select a city (${cities.length})`
                    }
                  />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {cities.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Button
            onClick={handleContinue}
            disabled={!selectedState || !selectedCity || loadingCities || isSaving}
            className="w-full"
            size="lg"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : loadingCities ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
