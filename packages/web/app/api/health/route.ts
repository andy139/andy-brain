export async function GET() {
  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    project: process.env.VERCEL_PROJECT_SLUG || 'andy-brain-web',
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
  })
}
