-- Delete violations for sample properties
DELETE FROM violations 
WHERE property_id IN (
  SELECT id FROM properties 
  WHERE city IN ('Springfield', 'Chicago')
);

-- Delete sample properties
DELETE FROM properties 
WHERE city IN ('Springfield', 'Chicago');