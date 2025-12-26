import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useJurisdictions } from "@/hooks/useJurisdictions";
import { useMemo, useEffect, useState } from "react";
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
  const { data: jurisdictions, isLoading } = useJurisdictions();
  const [propertyCities, setPropertyCities] = useState<string[]>([]);
  const [propertyStates, setPropertyStates] = useState<string[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Sanitize and validate city names
  const isValidCity = (city: string): boolean => {
    if (!city || city.trim().length < 2) return false;
    if (city.startsWith('#')) return false;
    if (city.toLowerCase().includes('county')) return false;
    if (/^\d+$/.test(city.trim())) return false;
    if (/\s\d{5}$/.test(city.trim())) return false;
    if (/^#?[A-Z]?\d*$/i.test(city.trim())) return false;
    if (city.startsWith('##')) return false;
    if (city.toLowerCase() === 'unknown') return false;
    return true;
  };

  // Normalize city name for consistent display
  const normalizeCity = (city: string): string => {
    return city.trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Fetch distinct cities and states directly from properties table
  useEffect(() => {
    async function fetchLocationData() {
      setLoadingData(true);
      try {
        // Fetch cities - get all and dedupe in JS to avoid 1000 limit issues
        const { data: cityData, error: cityError } = await supabase
          .from('properties')
          .select('city')
          .not('city', 'is', null)
          .limit(10000);
        
        if (!cityError && cityData) {
          const validCities = cityData
            .map(p => p.city)
            .filter((city): city is string => Boolean(city) && isValidCity(city))
            .map(normalizeCity);
          
          const uniqueCities = [...new Set(validCities)].sort();
          setPropertyCities(uniqueCities);
        }

        // Fetch states for "State" dropdown
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
        console.error('Error fetching location data:', e);
      } finally {
        setLoadingData(false);
      }
    }
    fetchLocationData();
  }, []);

  // Extract counties from jurisdictions (if available)
  const counties = useMemo(() => {
    if (!jurisdictions) return [];
    const countySet = new Set<string>();
    jurisdictions.forEach(j => {
      if (j.county) countySet.add(j.county);
    });
    return Array.from(countySet).sort();
  }, [jurisdictions]);

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
            <SelectValue placeholder="All States" />
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
            <SelectValue placeholder={loadingData ? "Loading..." : "All Cities"} />
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

      {/* Jurisdiction Filter */}
      {jurisdictions && jurisdictions.length > 0 && (
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium whitespace-nowrap">Jurisdiction</Label>
          <Select
            value={selectedJurisdiction || "all"}
            onValueChange={(val) => onJurisdictionChange(val === "all" ? null : val)}
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder={isLoading ? "Loading..." : "All Jurisdictions"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Jurisdictions</SelectItem>
              {jurisdictions?.map((jurisdiction) => (
                <SelectItem key={jurisdiction.id} value={jurisdiction.id}>
                  {jurisdiction.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
