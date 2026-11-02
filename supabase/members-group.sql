-- Aggiunge la colonna gruppo (bi/crm) alla tabella members
ALTER TABLE members ADD COLUMN IF NOT EXISTS membergroup TEXT;
