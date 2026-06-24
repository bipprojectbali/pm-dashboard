-- Drop PM-WATCH feature: WebhookRequestLog, ActivityEvent, Agent, WebhookToken + enums

DROP TABLE IF EXISTS "webhook_request_log";
DROP TABLE IF EXISTS "activity_event";
DROP TABLE IF EXISTS "agent";
DROP TABLE IF EXISTS "webhook_token";

DROP TYPE IF EXISTS "AgentStatus";
DROP TYPE IF EXISTS "WebhookTokenStatus";
