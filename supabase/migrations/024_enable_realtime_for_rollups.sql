-- Migration 024: Enable Realtime on employee_equity_rollups + notifications
--
-- Cross-tab staleness: when admin approves overtime in one tab, other tabs
-- displaying rollups (schedule grid sidebar, employees equity panel) need
-- to auto-refresh. Subscribing to postgres_changes requires the table to
-- be in the supabase_realtime publication.
--
-- notifications was already being consumed via channel in
-- NotificationsProvider but was never actually added to the publication,
-- so that channel silently never fired — adding it here fixes it too.

ALTER PUBLICATION supabase_realtime ADD TABLE employee_equity_rollups;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
