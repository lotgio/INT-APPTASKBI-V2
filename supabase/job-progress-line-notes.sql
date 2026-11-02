CREATE TABLE IF NOT EXISTS job_progress_line_notes (
  linekey TEXT PRIMARY KEY,
  note TEXT NOT NULL DEFAULT '',
  updatedat TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE job_progress_line_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON job_progress_line_notes;
DROP POLICY IF EXISTS "Enable insert for all users" ON job_progress_line_notes;
DROP POLICY IF EXISTS "Enable update for all users" ON job_progress_line_notes;
DROP POLICY IF EXISTS "Enable delete for all users" ON job_progress_line_notes;

CREATE POLICY "Enable read access for all users"
  ON job_progress_line_notes FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users"
  ON job_progress_line_notes FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users"
  ON job_progress_line_notes FOR UPDATE USING (true);

CREATE POLICY "Enable delete for all users"
  ON job_progress_line_notes FOR DELETE USING (true);
