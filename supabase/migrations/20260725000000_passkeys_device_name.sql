-- Add device_name column to passkeys table for human-readable device identification
ALTER TABLE passkeys
ADD COLUMN IF NOT EXISTS device_name TEXT;

-- Backfill existing rows with a default name based on device_type
UPDATE passkeys
SET device_name = CASE
  WHEN device_type = 'platform' THEN 'Biometría del dispositivo'
  WHEN device_type = 'cross-platform' THEN 'Llave de seguridad'
  ELSE 'Dispositivo registrado'
END
WHERE device_name IS NULL;
