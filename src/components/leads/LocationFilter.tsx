import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useJurisdictions } from "@/hooks/useJurisdictions";
import { useMemo, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface LocationFilterProps {
  selectedJurisdiction: string | null;
  selectedCity: string | null;
  selectedCounty: string | null;
  onJurisdictionChange: (value: string | null) => void;
  onCityChange: (value: string | null) => void;
  onCountyChange: (value: string | null) => void;
}

export function LocationFilter({
  selectedJurisdiction,
  selectedCity,
  selectedCounty,
  onJurisdictionChange,
  onCityChange,
  onCountyChange,
}: LocationFilterProps) {
  const { data: jurisdictions, isLoading } = useJurisdictions();
  const [propertyCities, setPropertyCities] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(true);

  // Sanitize and validate city names
  const isValidCity = (city: string): boolean => {
    if (!city || city.trim().length < 2) return false;
    // Exclude hashtags, numbers-only, entries with "County" 
    if (city.startsWith('#')) return false;
    if (city.toLowerCase().includes('county')) return false;
    if (/^\d+$/.test(city.trim())) return false;
    // Exclude cities with ZIP codes appended (e.g., "Galveston 77550")
    if (/\s\d{5}$/.test(city.trim())) return false;
    // Exclude apartment/unit designators that got into city field
    if (/^#?[A-Z]?\d*$/i.test(city.trim())) return false;
    if (city.startsWith('##')) return false;
    return true;
  };

  // Normalize city name for consistent display
  const normalizeCity = (city: string): string => {
    return city.trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Fetch distinct cities directly from properties table
  useEffect(() => {
    async function fetchCities() {
      setLoadingCities(true);
      try {
        const { data, error } = await supabase
          .from('properties')
          .select('city')
          .order('city');
        
        if (!error && data) {
          // Filter out invalid cities and normalize
          const validCities = data
            .map(p => p.city)
            .filter((city): city is string => Boolean(city) && isValidCity(city))
            .map(normalizeCity);
          
          // Deduplicate after normalization (handles case differences)
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
  }, []);

  // Extract counties from jurisdictions
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
      {/* County Filter */}
      {counties.length > 0 && (
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium whitespace-nowrap">County</Label>
          <Select
            value={selectedCounty || "all"}
            onValueChange={(val) => onCountyChange(val === "all" ? null : val)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Counties</SelectItem>
              {counties.map((county) => (
                <SelectItem key={county} value={county}>
                  {county}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* City Filter */}
      <div className="flex items-center gap-2">
        <Label className="text-sm font-medium whitespace-nowrap">City</Label>
        <Select
          value={selectedCity || "all"}
          onValueChange={(val) => onCityChange(val === "all" ? null : val)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder={loadingCities ? "Loading..." : "All"} />
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
              <SelectValue placeholder={isLoading ? "Loading..." : "All"} />
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
