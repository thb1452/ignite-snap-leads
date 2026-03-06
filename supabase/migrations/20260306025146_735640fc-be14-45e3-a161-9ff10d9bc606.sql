
DELETE FROM foia_requests WHERE target_id IN (SELECT id FROM targets);
DELETE FROM foia_assignments WHERE target_id IN (SELECT id FROM targets);
DELETE FROM press_rotation WHERE target_id IN (SELECT id FROM targets);
DELETE FROM credential_target_cooldown WHERE target_id IN (SELECT id FROM targets);
DELETE FROM targets;
