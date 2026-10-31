-- Bucket configuration only. Objects must always be uploaded/deleted through the Storage API.
-- No public policies are created. The existing D1 retains order metadata and session ownership.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('trilha-do-amor-fotos','trilha-do-amor-fotos',false,10485760,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;
