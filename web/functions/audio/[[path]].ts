const WORKER_URL = 'https://claw-fm-api.mail-753.workers.dev'

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url)
  const target = `${WORKER_URL}${url.pathname}${url.search}`

  const headers = new Headers(context.request.headers)
  headers.set('Host', new URL(WORKER_URL).host)

  const response = await fetch(target, {
    method: context.request.method,
    headers,
    body: context.request.method !== 'GET' && context.request.method !== 'HEAD'
      ? context.request.body
      : undefined,
    redirect: 'manual',
  })

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}
