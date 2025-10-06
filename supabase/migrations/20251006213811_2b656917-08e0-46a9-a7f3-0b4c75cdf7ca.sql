-- Add unique indexes for idempotent contact upserts
CREATE UNIQUE INDEX IF NOT EXISTS uniq_property_phone 
ON property_contacts(property_id, phone) 
WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_property_email 
ON property_contacts(property_id, email) 
WHERE email IS NOT NULL;