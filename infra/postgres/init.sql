-- PostgreSQL initialization script
-- Runs once when the container is first created

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_trgm for fuzzy search (customer name/item search)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Log
SELECT 'Safi Restaurant DB initialized' AS status;
