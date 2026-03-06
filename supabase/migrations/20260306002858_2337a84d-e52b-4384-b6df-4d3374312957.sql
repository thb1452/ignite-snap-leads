
-- Final expanded normalization pass: map remaining identifiable types

CREATE OR REPLACE FUNCTION public.fn_normalize_violation_type(raw_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  t TEXT;
BEGIN
  IF raw_type IS NULL OR TRIM(raw_type) = '' THEN
    RETURN 'Unknown';
  END IF;
  
  t := LOWER(TRIM(raw_type));
  
  -- ========== ALREADY CATEGORIZED ==========
  IF t IN ('exterior', 'safety', 'zoning', 'structural', 'vacancy', 'utility', 'fire') THEN
    RETURN INITCAP(t);
  END IF;

  -- ========== STRUCTURAL ==========
  IF t ~ '(structur|foundation|roof leak|roof damage|collapse|unsafe structure|condemned|load.?bearing|305\.[3-6]|304\.4|302\.7|accessory structure|deck|porch|balcony|stair|walking surface|304\.10|dangerous building|building code|imminent danger|major repair|foundation crack|interior housing)' THEN
    RETURN 'Structural';
  END IF;
  
  -- ========== FIRE ==========
  IF t ~ '(fire|burn|smoke|charred|flammable vegetation|704\.6|smoke alarm|fire alarm|fire damage|fire marshal|arson)' THEN
    RETURN 'Fire';
  END IF;
  
  -- ========== UTILITY ==========
  IF t ~ '(utilit|electric|plumbing|sewage|hvac|furnace|heating|water disconnect|water shutoff|no water|no electric|utility disconnect|605\.[0-9]|602\.|603\.|504\.|505\.|506\.|furnace report|energy|stormwater|lighting|stagnant water|watercourse|illicit discharge|spill|403\.2|bathroom|toilet|ventilation)' THEN
    RETURN 'Utility';
  END IF;

  -- ========== VACANCY ==========
  IF t ~ '(vacant|vacancy|boarded|unoccup|abandon|registration|condemnation|unfit|closing of vacant|109\.[0-9]|placarded)' THEN
    RETURN 'Vacancy';
  END IF;

  -- ========== SAFETY ==========
  IF t ~ '(safety|hazard|danger|unsafe|egress|handrail|guardrail|railing|luminaire|wiring|circuit|carbon monoxide|health|attractive nuisance|nuisance affecting|rodent|vermin|sanitar|animal carcass|dead.*dying|carcass)' THEN
    RETURN 'Safety';
  END IF;

  -- ========== ZONING ==========
  IF t ~ '(zoning|parking|setback|permit|unpermitted|variance|land use|occupancy|right of way|obstruction|illegal sign|signage|illegal construction|without permit|w/out permit|lafayette development code|construction work without|clear vision|parking setback|agricultural use|zoning.?land|code enforcement|home occupation|short term rental|municipal code|carts out)' THEN
    RETURN 'Zoning';
  END IF;

  -- ========== EXTERIOR ==========
  IF t ~ '(exterior|siding|paint|peeling|fascia|soffit|window|door|gutter|downspout|trim|corrosion|304\.[0-9]|protective treatment|weather tight|frame|screen|facade|ipmc 304|ipmc 308|cco |rubbish|garbage|accumulation|landscaping)' THEN
    RETURN 'Exterior';
  END IF;

  -- ========== MAINTENANCE (mapped to Exterior) ==========
  IF t ~ '(weed|grass|overgrown|vegetation|trash|debris|litter|junk|mowing|clean.?up|ce-cl|solid waste|excessive trash|trash.*right.*way|trash.*property|trash.*recycle|dumping|illegal dumping|tree removal|snow.*ice|property maintenance|property inspection|code compliance|inspection|ce inspection|nuisance|blight|maintenance standard|inoperable vehicle|vehicle|restricted vehicle|complaint|miscellaneous|environmental)' THEN
    RETURN 'Exterior';
  END IF;

  -- ========== 2-LETTER CODES ==========
  IF t IN ('hg') THEN RETURN 'Exterior'; END IF;
  IF t IN ('ha') THEN RETURN 'Safety'; END IF;
  IF t IN ('is') THEN RETURN 'Exterior'; END IF;
  IF t IN ('tr') THEN RETURN 'Exterior'; END IF;
  IF t IN ('e4', 'e1', 'e2') THEN RETURN 'Exterior'; END IF;
  IF t IN ('rr') THEN RETURN 'Structural'; END IF;
  IF t IN ('fm') THEN RETURN 'Exterior'; END IF;
  IF t IN ('gc') THEN RETURN 'Exterior'; END IF;
  IF t IN ('an') THEN RETURN 'Safety'; END IF;
  IF t IN ('bi') THEN RETURN 'Structural'; END IF;
  IF t IN ('ls') THEN RETURN 'Zoning'; END IF;
  IF t IN ('mo') THEN RETURN 'Exterior'; END IF;
  IF t IN ('ot') THEN RETURN 'Exterior'; END IF;
  IF t IN ('iv') THEN RETURN 'Zoning'; END IF;
  IF t IN ('jv') THEN RETURN 'Zoning'; END IF;
  IF t IN ('sc') THEN RETURN 'Safety'; END IF;
  IF t IN ('1a', '1c', '1d') THEN RETURN 'Exterior'; END IF;
  
  -- ========== COMBO CODES ==========
  IF t ~ '^(e[0-9]+ ?)+$' THEN RETURN 'Exterior'; END IF;
  IF t ~ '^([a-z]{2} )+[a-z]{2}$' THEN RETURN 'Exterior'; END IF;
  IF t ~ 'hg|tr|fm|gc|mo' THEN RETURN 'Exterior'; END IF;
  IF t ~ 'ha|an' THEN RETURN 'Safety'; END IF;

  -- ========== IPMC CODES ==========
  IF t ~ '^ipmc 30[2-4]' THEN RETURN 'Exterior'; END IF;
  IF t ~ '^ipmc 305' THEN RETURN 'Structural'; END IF;
  IF t ~ '^ipmc [4-6]' THEN RETURN 'Utility'; END IF;
  IF t ~ '^ipmc 7' THEN RETURN 'Fire'; END IF;
  IF t ~ '^cco ' THEN RETURN 'Exterior'; END IF;

  -- ========== CATCH-ALL ==========
  RETURN 'Unknown';
END;
$$;
