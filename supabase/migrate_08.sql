-- Track which restaurant a placeholder profile belongs to
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS restaurant_id uuid;

-- Enforce uniqueness: one placeholder per name per restaurant
CREATE UNIQUE INDEX IF NOT EXISTS profiles_placeholder_name_unique
ON profiles (restaurant_id, lower(trim(name)))
WHERE is_placeholder = true AND restaurant_id IS NOT NULL;
