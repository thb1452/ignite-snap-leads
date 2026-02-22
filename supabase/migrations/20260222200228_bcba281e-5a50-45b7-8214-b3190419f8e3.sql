-- Fix decimal zips, skipping any that would create duplicates
UPDATE properties p
SET zip = regexp_replace(p.zip, '\.0+$', '')
WHERE p.zip ~ '\.\d+$'
  AND NOT EXISTS (
    SELECT 1 FROM properties p2
    WHERE lower(trim(p2.address)) = lower(trim(p.address))
      AND lower(trim(p2.city)) = lower(trim(p.city))
      AND lower(trim(p2.state)) = lower(trim(p.state))
      AND lower(trim(p2.zip)) = lower(trim(regexp_replace(p.zip, '\.0+$', '')))
      AND p2.id != p.id
  );

-- Fix the specific concatenated parcel address
UPDATE properties 
SET address = '1212 LAKESIDE PASS'
WHERE address = '1D 65439 65440 65441 1212 LAKESIDE PASS' 
  AND city = 'New Braunfels' AND state = 'TX';