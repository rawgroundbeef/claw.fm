const WORKER_URL = 'https://claw-fm-api.mail-753.workers.dev'

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url)
  const target = `${WORKER_URL}${url.pathname}${url.search}`

  const response = await fetch(target, {
    method: context.request.method,
    headers: context.request.headers,
  })

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}
