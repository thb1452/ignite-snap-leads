import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCity } from "@/utils/formatAddress";

interface MarketOnboardingProps {
  onComplete: (market: { state: string; city: string }) => void;
}

export function MarketOnboarding({ onComplete }: MarketOnboardingProps) {
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingCities, setLoadingCities] = useState(false);

  const isValidCity = useCallback((city: string): boolean => {
    if (!city || city.trim().length < 2 || city.trim().length > 30) return false;
    if (city.startsWith('#') || city.startsWith('1-') || city.startsWith('2-')) return false;
    if (city.toLowerCase().includes('county') || city.toLowerCase() === 'unknown') return false;
    if (/^\d+$/.test(city.trim())) return false;
    if (!/[a-zA-Z]/.test(city)) return false;
    if (!/^[a-zA-Z]/.test(city.trim())) return false;
    if (city.split(' ').length > 4) return false;
    if (/\b(the|when|there|this|that|with|from|trailer|truck|vehicle|picture|address|owner|property)\b/i.test(city)) return false;
    return true;
  }, []);

  // Fetch states
  useEffect(() => {
    async function fetchStates() {
      setLoadingStates(true);
      try {
        const { data, error } = await supabase
          .from('properties')
          .select('state')
          .not('state', 'is', null);

        if (!error && data) {
          const validStates = data
            .map(p => p.state?.toUpperCase())
            .filter((s): s is string => Boolean(s) && s.length === 2);
          setStates([...new Set(validStates)].sort());
        }
      } catch (e) {
        console.error('Error fetching states:', e);
      } finally {
        setLoadingStates(false);
      }
    }
    fetchStates();
  }, []);

  // Fetch cities when state changes
  useEffect(() => {
    if (!selectedState) {
      setCities([]);
      setSelectedCity(null);
      return;
    }

    async function fetchCities() {
      setLoadingCities(true);
      setSelectedCity(null);
      try {
        const allCities: string[] = [];
        const pageSize = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('properties')
            .select('city')
            .not('city', 'is', null)
            .ilike('state', selectedState!)
            .range(offset, offset + pageSize - 1);

          if (error || !data || data.length === 0) {
            hasMore = false;
            break;
          }

          data.forEach(p => {
            if (p.city) allCities.push(p.city);
          });
          hasMore = data.length === pageSize;
          offset += pageSize;
        }

        const normalized = allCities
          .filter(isValidCity)
          .map(c => formatCity(c.trim()));
        setCities([...new Set(normalized)].sort());
      } catch (e) {
        console.error('Error fetching cities:', e);
      } finally {
        setLoadingCities(false);
      }
    }
    fetchCities();
  }, [selectedState, isValidCity]);

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
          </div>

          <div className="space-y-2">
            <Label htmlFor="city-select">City</Label>
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
                        : "Select a city"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {cities.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleContinue}
            disabled={!selectedState || !selectedCity}
            className="w-full"
            size="lg"
          >
            {loadingCities ? (
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
