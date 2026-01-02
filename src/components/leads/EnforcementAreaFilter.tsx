import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState, useCallback } from "react";
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

  // Sanitize and validate city names - filter out garbage data
  const isValidCity = (city: string): boolean => {
    if (!city || city.trim().length < 2) return false;
    if (city.trim().length > 30) return false;
    if (city.startsWith('#')) return false;
    if (city.startsWith('1-') || city.startsWith('2-')) return false;
    if (city.toLowerCase().includes('county')) return false;
    if (/^\d+$/.test(city.trim())) return false;
    if (/\s\d{5}$/.test(city.trim())) return false;
    if (/^#?[A-Z]?\d*$/i.test(city.trim())) return false;
    if (city.startsWith('##')) return false;
    if (city.toLowerCase() === 'unknown') return false;
    if (!/[a-zA-Z]/.test(city)) return false;
    if (/^\d{1,2}[-\/]\d{1,2}/.test(city.trim())) return false;
    if (city.split(' ').length > 4) return false;
    if (/\b(the|when|there|this|that|with|from|have|will|shall|must)\b/i.test(city)) return false;
    if (/\b(trailer|truck|vehicle|picture|address|owner|property)\b/i.test(city)) return false;
    if (/\b(additional|continuing|believe|action|constitute|eyesore)\b/i.test(city)) return false;
    if (!/^[a-zA-Z]/.test(city.trim())) return false;
    return true;
  };

  // Normalize city name for consistent display
  const normalizeCity = (city: string): string => {
    return city.trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Fetch ALL distinct states
  useEffect(() => {
    async function fetchStates() {
      setLoadingStates(true);
      try {
        const { data: stateData, error: stateError } = await supabase
          .from('properties')
          .select('state')
          .not('state', 'is', null);
        
        if (!stateError && stateData) {
          const validStates = stateData
            .map(p => p.state?.toUpperCase())
            .filter((state): state is string => Boolean(state) && state.length === 2);
          
          const uniqueStates = [...new Set(validStates)].sort();
          console.log(`[EnforcementAreaFilter] Loaded ${uniqueStates.length} distinct states`);
          setPropertyStates(uniqueStates);
        }
      } catch (e) {
        console.error('Error fetching states:', e);
      } finally {
        setLoadingStates(false);
      }
    }
    fetchStates();
  }, []);

  // Fetch ALL cities based on selected state using pagination
  useEffect(() => {
    async function fetchCities() {
      setLoadingCities(true);
      try {
        // Use pagination to fetch ALL cities (Supabase default limit is 1000)
        const allCities: string[] = [];
        const pageSize = 1000;
        let offset = 0;
        let hasMore = true;
        
        while (hasMore) {
          let query = supabase
            .from('properties')
            .select('city')
            .not('city', 'is', null);
          
          if (selectedState) {
            query = query.ilike('state', selectedState);
          }
          
          const { data: cityData, error: cityError } = await query
            .range(offset, offset + pageSize - 1);
          
          if (cityError) {
            console.error('Error fetching cities:', cityError);
            break;
          }
          
          if (cityData && cityData.length > 0) {
            cityData.forEach(p => {
              if (p.city) allCities.push(p.city);
            });
            offset += pageSize;
            hasMore = cityData.length === pageSize;
          } else {
            hasMore = false;
          }
        }
        
        // Process and dedupe
        const validCities = allCities
          .filter((city): city is string => Boolean(city) && isValidCity(city))
          .map(normalizeCity);
        
        const uniqueCities = [...new Set(validCities)].sort();
        console.log(`[EnforcementAreaFilter] Loaded ${uniqueCities.length} distinct cities${selectedState ? ` for ${selectedState}` : ''} (from ${allCities.length} total rows)`);
        setPropertyCities(uniqueCities);
      } catch (e) {
        console.error('Error fetching cities:', e);
      } finally {
        setLoadingCities(false);
      }
    }
    fetchCities();
  }, [selectedState]);

  // Only clear city when STATE changes (not when city list updates)
  // This prevents the bug where selecting a city resets it
  useEffect(() => {
    // When state changes, check if selected city is valid for new state
    // But only do this AFTER cities are loaded AND only if state actually changed
    if (selectedCity && !loadingCities && propertyCities.length > 0) {
      const cityExists = propertyCities.some(
        c => c.toLowerCase() === selectedCity.toLowerCase()
      );
      // Only clear if city doesn't exist in the FULLY loaded list
      if (!cityExists) {
        console.log(`[EnforcementAreaFilter] City "${selectedCity}" not found in ${propertyCities.length} cities for state ${selectedState}, clearing`);
        onCityChange(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedState]); // Only run when STATE changes, not when propertyCities updates

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
