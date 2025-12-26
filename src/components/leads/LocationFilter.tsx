import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useJurisdictions } from "@/hooks/useJurisdictions";
import { useMemo, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface LocationFilterProps {
  selectedJurisdiction: string | null;
  selectedCity: string | null;
  selectedState: string | null;
  selectedCounty: string | null;
  onJurisdictionChange: (value: string | null) => void;
  onCityChange: (value: string | null) => void;
  onStateChange: (value: string | null) => void;
  onCountyChange: (value: string | null) => void;
}

interface CityStateOption {
  label: string;
  city: string;
  state: string;
  count: number;
}

export function LocationFilter({
  selectedJurisdiction,
  selectedCity,
  selectedState,
  selectedCounty,
  onJurisdictionChange,
  onCityChange,
  onStateChange,
  onCountyChange,
}: LocationFilterProps) {
  const { data: jurisdictions, isLoading: loadingJurisdictions } = useJurisdictions();
  const [propertyCities, setPropertyCities] = useState<string[]>([]);
  const [propertyStates, setPropertyStates] = useState<string[]>([]);
  const [cityStateOptions, setCityStateOptions] = useState<CityStateOption[]>([]);
  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingCityStates, setLoadingCityStates] = useState(true);

  // Sanitize and validate city names - filter out garbage data
  const isValidCity = (city: string): boolean => {
    if (!city || city.trim().length < 2) return false;
    if (city.trim().length > 30) return false; // City names shouldn't be super long
    if (city.startsWith('#')) return false;
    if (city.startsWith('1-') || city.startsWith('2-')) return false; // "1- Dump Truck" etc
    if (city.toLowerCase().includes('county')) return false;
    if (/^\d+$/.test(city.trim())) return false;
    if (/\s\d{5}$/.test(city.trim())) return false;
    if (/^#?[A-Z]?\d*$/i.test(city.trim())) return false;
    if (city.startsWith('##')) return false;
    if (city.toLowerCase() === 'unknown') return false;
    if (!/[a-zA-Z]/.test(city)) return false;
    if (/^\d{1,2}[-\/]\d{1,2}/.test(city.trim())) return false;
    // Filter out sentences/descriptions (contain multiple spaces or common words)
    if (city.split(' ').length > 4) return false; // City names rarely have 4+ words
    if (/\b(the|when|there|this|that|with|from|have|will|shall|must)\b/i.test(city)) return false;
    if (/\b(trailer|truck|vehicle|picture|address|owner|property)\b/i.test(city)) return false;
    if (/\b(additional|continuing|believe|action|constitute|eyesore)\b/i.test(city)) return false;
    // Must start with a letter
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

  // Fetch states once on mount
  useEffect(() => {
    async function fetchStates() {
      setLoadingStates(true);
      try {
        const { data: stateData, error: stateError } = await supabase
          .from('properties')
          .select('state')
          .not('state', 'is', null)
          .limit(10000);
        
        if (!stateError && stateData) {
          const validStates = stateData
            .map(p => p.state?.toUpperCase())
            .filter((state): state is string => Boolean(state) && state.length === 2);
          
          const uniqueStates = [...new Set(validStates)].sort();
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

  // Fetch city+state combinations for jurisdiction-like dropdown
  useEffect(() => {
    async function fetchCityStates() {
      setLoadingCityStates(true);
      try {
        // Get city, state pairs with counts
        const { data, error } = await supabase
          .from('properties')
          .select('city, state')
          .not('city', 'is', null)
          .not('state', 'is', null)
          .limit(50000);
        
        if (!error && data) {
          // Count occurrences of each city+state combo
          const countMap = new Map<string, { city: string; state: string; count: number }>();
          
          data.forEach(p => {
            if (p.city && p.state && isValidCity(p.city)) {
              const normalizedCity = normalizeCity(p.city);
              const state = p.state.toUpperCase();
              const key = `${normalizedCity}|${state}`;
              
              const existing = countMap.get(key);
              if (existing) {
                existing.count++;
              } else {
                countMap.set(key, { city: normalizedCity, state, count: 1 });
              }
            }
          });
          
          // Convert to array and sort by name
          const options: CityStateOption[] = Array.from(countMap.values())
            .map(({ city, state, count }) => ({
              label: `${city}, ${state}`,
              city,
              state,
              count,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
          
          setCityStateOptions(options);
        }
      } catch (e) {
        console.error('Error fetching city/state combinations:', e);
      } finally {
        setLoadingCityStates(false);
      }
    }
    fetchCityStates();
  }, []);

  // Fetch cities based on selected state (or all if no state selected)
  useEffect(() => {
    async function fetchCities() {
      setLoadingCities(true);
      try {
        let query = supabase
          .from('properties')
          .select('city')
          .not('city', 'is', null);
        
        // Filter by state if selected
        if (selectedState) {
          query = query.ilike('state', selectedState);
        }
        
        const { data: cityData, error: cityError } = await query.limit(10000);
        
        if (!cityError && cityData) {
          const validCities = cityData
            .map(p => p.city)
            .filter((city): city is string => Boolean(city) && isValidCity(city))
            .map(normalizeCity);
          
          const uniqueCities = [...new Set(validCities)].sort();
          setPropertyCities(uniqueCities);
        }
      } catch (e) {
        console.error('Error fetching cities:', e);
      } finally {
        setLoadingCities(false);
      }
    }
    fetchCities();
  }, [selectedState]);

  // Clear city selection when state changes (if city is not in the new state's cities)
  const handleCityChange = useCallback((value: string | null) => {
    onCityChange(value);
  }, [onCityChange]);

  useEffect(() => {
    if (selectedCity && propertyCities.length > 0) {
      const cityExists = propertyCities.some(
        c => c.toLowerCase() === selectedCity.toLowerCase()
      );
      if (!cityExists) {
        handleCityChange(null);
      }
    }
  }, [propertyCities, selectedCity, handleCityChange]);

  // Filter city/state options based on selected state
  const filteredCityStateOptions = useMemo(() => {
    if (!selectedState) return cityStateOptions;
    return cityStateOptions.filter(opt => opt.state === selectedState);
  }, [cityStateOptions, selectedState]);

  // Determine if we should show the jurisdictions table dropdown or the derived city/state dropdown
  const hasJurisdictions = jurisdictions && jurisdictions.length > 1;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* State Filter - always show */}
      <div className="flex items-center gap-2">
        <Label className="text-sm font-medium whitespace-nowrap">State</Label>
        <Select
          value={selectedState || "all"}
          onValueChange={(val) => onStateChange(val === "all" ? null : val)}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder={loadingStates ? "Loading..." : "All States"} />
          </SelectTrigger>
          <SelectContent>
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
      <div className="flex items-center gap-2">
        <Label className="text-sm font-medium whitespace-nowrap">City</Label>
        <Select
          value={selectedCity || "all"}
          onValueChange={(val) => onCityChange(val === "all" ? null : val)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder={loadingCities ? "Loading..." : "All Cities"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cities</SelectItem>
            {propertyCities.map((city) => (
              <SelectItem key={city} value={city}>
                {city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Jurisdiction Filter - show table-based if available, otherwise derived from city/state */}
      {hasJurisdictions ? (
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium whitespace-nowrap">Jurisdiction</Label>
          <Select
            value={selectedJurisdiction || "all"}
            onValueChange={(val) => onJurisdictionChange(val === "all" ? null : val)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={loadingJurisdictions ? "Loading..." : "All Jurisdictions"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Jurisdictions ({jurisdictions?.length || 0})</SelectItem>
              {jurisdictions?.map((jurisdiction) => (
                <SelectItem key={jurisdiction.id} value={jurisdiction.id}>
                  {jurisdiction.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium whitespace-nowrap">Jurisdiction</Label>
          <Select
            value={selectedJurisdiction || "all"}
            onValueChange={(val) => {
              if (val === "all") {
                onJurisdictionChange(null);
                // Don't clear city/state - let user keep those filters
              } else {
                // Parse city|state from value
                const [city, state] = val.split('|');
                onStateChange(state);
                onCityChange(city);
                onJurisdictionChange(val);
              }
            }}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder={loadingCityStates ? "Loading..." : "All Jurisdictions"} />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              <SelectItem value="all">
                All Jurisdictions ({filteredCityStateOptions.length})
              </SelectItem>
              {filteredCityStateOptions.map((opt) => (
                <SelectItem key={`${opt.city}|${opt.state}`} value={`${opt.city}|${opt.state}`}>
                  {opt.label} ({opt.count.toLocaleString()})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
