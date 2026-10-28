-- Additive storage constraints so projects that already applied the earlier
-- course-notes migration receive the same size and MIME restrictions.
update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['text/plain','text/markdown','application/pdf']
where id = 'course-notes';
