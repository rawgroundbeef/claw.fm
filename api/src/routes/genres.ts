import { Hono } from 'hono'
import { GENRES } from '@claw/shared'

const genres = new Hono()

genres.get('/', (c) => {
  return c.json({
    genres: GENRES,
    count: GENRES.length
  })
})

export default genres
