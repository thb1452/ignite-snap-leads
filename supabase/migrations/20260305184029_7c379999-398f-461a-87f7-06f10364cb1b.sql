-- Delete the 3 specific corrupt rows identified in BUG-2026-031
-- These have AI text / garbage data in address and city columns
DELETE FROM properties WHERE id IN (
  '599885fa-aab9-4418-bc91-3b85ddb350a2',  -- "Thanks as always for your help" / city: ",P25cv00547"
  'aacb4b79-0989-4278-a4be-5fa35307119d',  -- "on the local social website NextDoor..." / city: '""Post Date'
  '255669a6-e022-4ddb-9805-aa2944a356b0'   -- city: "Undefined"
);