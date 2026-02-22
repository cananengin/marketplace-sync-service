--
-- PostgreSQL database dump
--

\restrict e5yiT0O0ksKjlbj72Cwy46MDwrKs5pHfvnbK1VnEHYtNaEQQfcyQlJVjNfP0DGF

-- Dumped from database version 16.12
-- Dumped by pg_dump version 16.12

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: app
--

INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES ('14e52914-bcc6-466e-9444-73fcb0d906b2', 'd0980b9df6b5169a8538bffe0fcd2456c0b1b6904622b9415af01c32e3f5f510', '2026-02-20 21:08:30.326756+00', '0001_init', NULL, NULL, '2026-02-20 21:08:30.282472+00', 1);


--
-- Data for Name: stores; Type: TABLE DATA; Schema: public; Owner: app
--

INSERT INTO public.stores (id, "organizationId", marketplace, "externalStoreId", "storeName", "accessToken", currency, "syncToken", "syncStatus", "lastSyncAt", "importedSuccessCount", "createdAt", "updatedAt") VALUES ('7d2386d2-539b-41ef-906b-6a2b66ab7e09', 'org-pending', 'etsy', 'ext-pending', 'Pending Test', 'token-pending', 'USD', '15644af2-22ed-49a6-9c29-0183441ada6f', 'pending', NULL, 0, '2026-02-21 01:05:45.754+00', '2026-02-21 01:05:45.754+00');
INSERT INTO public.stores (id, "organizationId", marketplace, "externalStoreId", "storeName", "accessToken", currency, "syncToken", "syncStatus", "lastSyncAt", "importedSuccessCount", "createdAt", "updatedAt") VALUES ('843707fa-ac13-4aaa-b6fb-a9138e6990bd', 'org-manual', 'etsy', 'ext-manual-1', 'Manual Store', 'token-manual-1', 'USD', '67377afe-1d10-424f-86e1-138e2f790abf', 'pending', '2026-02-21 14:30:48.842+00', 0, '2026-02-21 14:27:16.13+00', '2026-02-21 14:30:48.842+00');


--
-- Data for Name: sync_logs; Type: TABLE DATA; Schema: public; Owner: app
--

INSERT INTO public.sync_logs (id, "storeId", receipt, status, "orderId", amount, currency, "errorDetails", attempt, "nextRetryAt", "importedAt", "createdAt", "updatedAt") VALUES ('1ac787bc-b89a-4add-888f-63d52ba15b8e', '7d2386d2-539b-41ef-906b-6a2b66ab7e09', 'rec-1', 'pending', NULL, NULL, NULL, NULL, 0, NULL, NULL, '2026-02-21 01:05:45.757+00', '2026-02-21 01:05:45.757+00');
INSERT INTO public.sync_logs (id, "storeId", receipt, status, "orderId", amount, currency, "errorDetails", attempt, "nextRetryAt", "importedAt", "createdAt", "updatedAt") VALUES ('285ab60f-a45c-4e40-a0d8-a40e267f38b6', '7d2386d2-539b-41ef-906b-6a2b66ab7e09', 'rec-2', 'failed', NULL, NULL, NULL, NULL, 1, NULL, NULL, '2026-02-21 01:05:45.757+00', '2026-02-21 01:05:45.757+00');
INSERT INTO public.sync_logs (id, "storeId", receipt, status, "orderId", amount, currency, "errorDetails", attempt, "nextRetryAt", "importedAt", "createdAt", "updatedAt") VALUES ('610690b3-1702-4400-b1a1-dd99071633d6', '7d2386d2-539b-41ef-906b-6a2b66ab7e09', 'rec-3', 'success', NULL, NULL, NULL, NULL, 1, NULL, NULL, '2026-02-21 01:05:45.757+00', '2026-02-21 01:05:45.757+00');
INSERT INTO public.sync_logs (id, "storeId", receipt, status, "orderId", amount, currency, "errorDetails", attempt, "nextRetryAt", "importedAt", "createdAt", "updatedAt") VALUES ('8b1f8de9-2b84-43a0-a394-e7e9887dcc1f', '843707fa-ac13-4aaa-b6fb-a9138e6990bd', 'RL15', 'rate_limited', NULL, NULL, NULL, 'rate_limited', 1, '2026-02-21 14:32:01.234506+00', NULL, '2026-02-21 14:30:48.833+00', '2026-02-21 14:30:48.833+00');


--
-- PostgreSQL database dump complete
--

\unrestrict e5yiT0O0ksKjlbj72Cwy46MDwrKs5pHfvnbK1VnEHYtNaEQQfcyQlJVjNfP0DGF

