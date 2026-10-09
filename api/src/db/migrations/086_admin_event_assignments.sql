CREATE TABLE admin_event_assignment (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES carnival_event(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (user_id, event_id)
);
