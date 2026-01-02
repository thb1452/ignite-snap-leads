import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface EnforcementAreaFilterProps {
  selectedCity: string | null;
  selectedState: string | null;
  onCityChange: (value: string | null) => void;
  onStateChange: (value: string | null) => void;
}

export function EnforcementAreaFilter({
  selectedCity,
  selectedState,
  onCityChange,
  onStateChange,
}: EnforcementAreaFilterProps) {
  const [propertyCities, setPropertyCities] = useState<string[]>([]);
  const [propertyStates, setPropertyStates] = useState<string[]>([]);
  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingCities, setLoadingCities] = useState(false);

  // Fetch distinct states using database function (instant, no pagination)
  useEffect(() => {
    async function fetchStates() {
      setLoadingStates(true);
      try {
        const { data, error } = await supabase.rpc('fn_distinct_states');
        
        if (error) {
          console.error('Error fetching states:', error);
          return;
        }
        
        const states = (data as { state: string }[] | null)?.map(r => r.state).filter(Boolean) || [];
        console.log(`[EnforcementAreaFilter] Loaded ${states.length} distinct states`);
        setPropertyStates(states);
      } catch (e) {
        console.error('Error fetching states:', e);
      } finally {
        setLoadingStates(false);
      }
    }
    fetchStates();
  }, []);

  // Fetch distinct cities using database function (instant, no pagination)
  useEffect(() => {
    async function fetchCities() {
      setLoadingCities(true);
      try {
        const { data, error } = await supabase.rpc('fn_distinct_cities', {
          p_state: selectedState || null
        });
        
        if (error) {
          console.error('Error fetching cities:', error);
          return;
        }
        
        const cities = (data as { city: string }[] | null)?.map(r => r.city).filter(Boolean) || [];
        console.log(`[EnforcementAreaFilter] Loaded ${cities.length} distinct cities${selectedState ? ` for ${selectedState}` : ''}`);
        setPropertyCities(cities);
      } catch (e) {
        console.error('Error fetching cities:', e);
      } finally {
        setLoadingCities(false);
      }
    }
    fetchCities();
  }, [selectedState]);

  // Clear city when state changes if city doesn't exist in new state
  useEffect(() => {
    if (selectedCity && !loadingCities && propertyCities.length > 0) {
      const cityExists = propertyCities.some(
        c => c.toLowerCase() === selectedCity.toLowerCase()
      );
      if (!cityExists) {
        console.log(`[EnforcementAreaFilter] City "${selectedCity}" not found for state ${selectedState}, clearing`);
        onCityChange(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedState]);

  return (
    <div className="flex flex-col gap-3">
      <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        Enforcement Area
      </Label>
      
      <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-3 flex-wrap">
        {/* State Filter */}
        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <Label className="text-sm font-medium whitespace-nowrap">State</Label>
          <Select
            value={selectedState || "all"}
            onValueChange={(val) => onStateChange(val === "all" ? null : val)}
          >
            <SelectTrigger className="w-full md:w-[120px] h-11 md:h-9">
              <SelectValue placeholder={loadingStates ? "Loading..." : "All States"} />
            </SelectTrigger>
            <SelectContent className="z-[9999]">
              <SelectItem value="all">All States</SelectItem>
              {propertyStates.map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* City Filter */}
        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <Label className="text-sm font-medium whitespace-nowrap">City</Label>
          <Select
            value={selectedCity || "all"}
            onValueChange={(val) => onCityChange(val === "all" ? null : val)}
          >
            <SelectTrigger className="w-full md:w-[180px] h-11 md:h-9">
              <SelectValue placeholder={loadingCities ? "Loading..." : "All Cities"} />
            </SelectTrigger>
            <SelectContent className="max-h-[300px] z-[9999]">
              <SelectItem value="all">All Cities</SelectItem>
              {propertyCities.map((city) => (
                <SelectItem key={city} value={city}>
                  {city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
