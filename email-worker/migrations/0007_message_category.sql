ALTER TABLE messages
ADD COLUMN category TEXT NOT NULL DEFAULT 'primary'
CHECK (category IN ('primary', 'social', 'promotions', 'updates'));
