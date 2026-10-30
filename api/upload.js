// POST /api/upload -> issues a short-lived upload token so the admin page can send a file
// straight to Vercel Blob (large PDFs are fine). Only works with the admin password.
const ALLOWED = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
  'image/png', 'image/jpeg',
];
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { handleUpload } = await import('@vercel/blob/client');
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
    const request = new Request('https://' + (req.headers['x-forwarded-host'] || req.headers.host) + req.url, { method: 'POST', headers });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const json = await handleUpload({
      body, request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!process.env.ADMIN_PASSWORD || clientPayload !== process.env.ADMIN_PASSWORD) throw new Error('Unauthorized');
        return { allowedContentTypes: ALLOWED, maximumSizeInBytes: 200 * 1024 * 1024, addRandomSuffix: false, allowOverwrite: false };
      },
    });
    return res.status(200).json(json);
  } catch (e) {
    return res.status(400).json({ error: String((e && e.message) || e) });
  }
};
